-- Průběžné ukládání jednotlivých sérií. Pro existující projekt s migrací 001.
-- Zahrnuje také oprávnění a vzájemné zápisy z aktualizací 002 a 003.
-- Zachovává historii, nové zápisy mohou mít zatím nevyplněné hodnoty.
begin;
-- Oprava oprávnění pro projekty s omezenými výchozími granty.
-- Lze spustit opakovaně. Existující RLS politiky zůstávají aktivní.
grant usage on schema public to authenticated;
grant select on public.profiles, public.exercises, public.rounds,
  public.cycle, public.workouts, public.workout_exercises, public.sets
  to authenticated;
grant insert, update on public.exercises to authenticated;
grant delete on public.workouts to authenticated;

alter policy workouts_delete on public.workouts using (public.is_member());
alter table public.sets alter column weight drop not null;
alter table public.sets alter column reps drop not null;
create or replace function public.save_workout(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare wid uuid; rid uuid; d integer; ex jsonb; s jsonb; eid uuid; pos integer:=0; ord integer; existing public.workouts; expected text[]; main text[]; counts jsonb:='{}'; seen text[]:='{}'; legacy text[]; actual text[]; target_user uuid;
begin
 if not public.is_member() then raise exception 'Nepovolený účet'; end if;
 select id into target_user from public.profiles where name=payload->>'user';
 if target_user is null then raise exception 'Vybraný profil nemá vytvořený účet'; end if;
 wid:=(payload->>'id')::uuid; rid:=(payload->>'round')::uuid;
 select day into d from public.rounds where id=rid; if d is null or d<>(payload->>'day')::int then raise exception 'Neplatný den cyklu'; end if;
 main:=case ((d-1)%6) when 0 then array['Prsa','Biceps'] when 1 then array['Záda','Triceps'] when 2 then array['Nohy','Ramena'] when 3 then array['Biceps','Prsa'] when 4 then array['Triceps','Záda'] else array['Ramena','Nohy'] end;
 expected:=array[main[1],main[1],main[1],main[2],main[2],main[2]]||case when 'Prsa'=any(main) then array['Předloktí','Břicho'] when 'Záda'=any(main) then array['Bedra','Břicho'] else array['Trapézy','Lýtka','Břicho'] end;
 legacy:=main||main||main||expected[7:array_length(expected,1)];
 select array_agg(e.muscle order by a.ordinality) into actual from jsonb_array_elements(payload->'entries') with ordinality a(value,ordinality) left join public.exercises e on e.id=a.value->>'exerciseId';
 if actual=legacy then expected:=legacy; end if;
 if jsonb_array_length(payload->'entries')<>array_length(expected,1) then raise exception 'Nesprávný počet cviků'; end if;
 -- Serializace zápisů jednoho uživatele a kola.
 perform pg_advisory_xact_lock(hashtextextended(rid::text||target_user::text,0));
 select * into existing from public.workouts where round_id=rid and user_id=target_user for update;
 if existing.id is not null then wid:=existing.id; end if;
 if exists(select 1 from public.workouts where id=wid and (user_id<>target_user or round_id<>rid)) then raise exception 'Cizí záznam'; end if;
 insert into public.workouts(id,round_id,user_id,day,started_at) values(wid,rid,target_user,d,(payload->>'date')::timestamptz) on conflict(id) do nothing;
 delete from public.workout_exercises where workout_id=wid;
 for ex in select value from jsonb_array_elements(payload->'entries') loop
  if not exists(select 1 from public.exercises where id=ex->>'exerciseId' and muscle=expected[pos+1]) or (ex->>'exerciseId')=any(seen) then raise exception 'Nesprávná partie nebo duplicitní cvik'; end if;
  seen:=array_append(seen,ex->>'exerciseId');
  if jsonb_array_length(ex->'sets')<>3 then raise exception 'Požadovány přesně 3 série'; end if;
  insert into public.workout_exercises(workout_id,exercise_id,position) values(wid,ex->>'exerciseId',pos) returning id into eid;
  ord:=1;
  for s in select value from jsonb_array_elements(ex->'sets') loop
   if s->>'weight' is null or s->>'reps' is null or (s->>'reps')<>'' and (s->>'reps') !~ '^\d+$' then raise exception 'Neplatná série'; end if;
   insert into public.sets(workout_exercise_id,ordinal,weight,reps) values(eid,ord,nullif(replace(s->>'weight',',','.'),'')::numeric,nullif(s->>'reps','')::int);ord:=ord+1;
  end loop;pos:=pos+1;
 end loop;
 if existing.completed and exists(select 1 from public.sets s join public.workout_exercises e on e.id=s.workout_exercise_id where e.workout_id=wid and (s.weight is null or s.reps is null)) then raise exception 'Dokončený trénink musí mít vyplněné série'; end if;
 return wid;
end $$;
create or replace function public.complete_workout(workout_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare w public.workouts; r public.rounds; nr uuid; other_user uuid;
begin
 if not public.is_member() then raise exception 'Nepovolený účet'; end if;
 select * into w from public.workouts where id=workout_id for update;
 if w.id is null then raise exception 'Trénink nenalezen'; end if;
 if (select count(*) from public.workout_exercises where workout_exercises.workout_id=w.id)<>(case when (w.day-1)%3=2 then 9 else 8 end) or exists(select 1 from public.workout_exercises e where e.workout_id=w.id and (select count(*) from public.sets where workout_exercise_id=e.id and weight is not null and reps is not null)<>3) then raise exception 'Neúplné série'; end if;
 select * into r from public.rounds where id=w.round_id for update;
 update public.workouts set completed=true where id=w.id;
 if not r.advanced then
  -- Druhému profilu zachováme totéž kolo, i když začne zapisovat později.
  for other_user in select id from public.profiles where id<>w.user_id loop
   insert into public.workouts(id,round_id,user_id,day) values(gen_random_uuid(),r.id,other_user,r.day) on conflict(round_id,user_id) do nothing;
  end loop;
  update public.rounds set advanced=true where id=r.id;
  perform 1 from public.cycle where id=true for update;
  if (select round_id from public.cycle where id=true)=r.id then
   insert into public.rounds(day) values(r.day%12+1) returning id into nr;
   update public.cycle set day=r.day%12+1,round_id=nr where id=true;
  end if;
 end if;
end $$;

create or replace function public.save_workout_patch(payload jsonb, changes jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_user uuid; wid uuid; rid uuid; d integer; c jsonb; eid uuid; expected text; slot integer; series integer; m text[]; existing_ex text;
begin
 if not public.is_member() then raise exception 'Nepovolený účet'; end if;
 select id into target_user from public.profiles where name=payload->>'user';
 if target_user is null then raise exception 'Vybraný profil nemá vytvořený účet'; end if;
 rid:=(payload->>'round')::uuid;
 select day into d from public.rounds where id=rid;
 if d is null or d<>(payload->>'day')::int then raise exception 'Neplatný den cyklu'; end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text||target_user::text,0));
 select id into wid from public.workouts where round_id=rid and user_id=target_user for update;
 if wid is null or not exists(select 1 from public.workout_exercises where workout_id=wid) then
  wid:=public.save_workout(payload);
 end if;
 if (select completed from public.workouts where id=wid) then raise exception 'Trénink už je dokončený. Opravte jej v historii.'; end if;
 m:=case ((d-1)%6) when 0 then array['Prsa','Biceps'] when 1 then array['Záda','Triceps'] when 2 then array['Nohy','Ramena'] when 3 then array['Biceps','Prsa'] when 4 then array['Triceps','Záda'] else array['Ramena','Nohy'] end;
 for c in select value from jsonb_array_elements(changes) loop
  slot:=(c->>'position')::int;series:=(c->>'ordinal')::int;
  expected:=case when slot between 0 and 2 then m[1] when slot between 3 and 5 then m[2] when slot=6 then case when 'Prsa'=any(m) then 'Předloktí' when 'Záda'=any(m) then 'Bedra' else 'Trapézy' end when slot=7 then case when 'Nohy'=any(m) then 'Lýtka' else 'Břicho' end when slot=8 and 'Nohy'=any(m) then 'Břicho' end;
  if expected is null or series not between 1 and 3 or not exists(select 1 from public.exercises where id=c->>'exerciseId' and muscle=expected) then raise exception 'Neplatný cvik nebo série'; end if;
  -- Starší koncepty mohou mít střídavé pořadí. Identita cviku zachová jeho série.
  select id into eid from public.workout_exercises where workout_id=wid and exercise_id=c->>'exerciseId';
  if eid is null then
   select id,exercise_id into eid,existing_ex from public.workout_exercises where workout_id=wid and position=slot;
   if not coalesce((c->>'replaceExercise')::boolean,false) then raise exception 'Výběr cviku se změnil na druhém zařízení. Obnovte online data.'; end if;
   if eid is null then raise exception 'Chybí pozice cviku'; end if;
   update public.workout_exercises set exercise_id=c->>'exerciseId' where id=eid;
   update public.sets set weight=null,reps=null where workout_exercise_id=eid;
  end if;
  if coalesce(c->>'reps','')<>'' and (c->>'reps') !~ '^\d+$' then raise exception 'Neplatný počet opakování'; end if;
  insert into public.sets(workout_exercise_id,ordinal,weight,reps)
   values(eid,series,nullif(replace(c->>'weight',',','.'),'')::numeric,nullif(c->>'reps','')::int)
   on conflict(workout_exercise_id,ordinal) do update set weight=excluded.weight,reps=excluded.reps;
 end loop;
 return wid;
end $$;
revoke all on function public.save_workout_patch(jsonb,jsonb) from public;
grant execute on function public.save_workout_patch(jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
