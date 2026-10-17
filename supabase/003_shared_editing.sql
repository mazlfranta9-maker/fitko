-- Umožní Honzovi a Davidovi zapisovat výsledky oběma profilům.
-- Spusťte v existujícím projektu po 001 (a případně opravě 002).
-- Nemění existující tréninky. Lze spustit opakovaně.
begin;
alter policy workouts_delete on public.workouts using (public.is_member());
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
   if s->>'weight' is null or s->>'reps' is null or (s->>'reps') !~ '^\d+$' then raise exception 'Neplatná série'; end if;
   insert into public.sets(workout_exercise_id,ordinal,weight,reps) values(eid,ord,replace(s->>'weight',',','.')::numeric,(s->>'reps')::int);ord:=ord+1;
  end loop;pos:=pos+1;
 end loop;
 return wid;
end $$;
create or replace function public.complete_workout(workout_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare w public.workouts; r public.rounds; nr uuid; other_user uuid;
begin
 if not public.is_member() then raise exception 'Nepovolený účet'; end if;
 select * into w from public.workouts where id=workout_id for update;
 if w.id is null then raise exception 'Trénink nenalezen'; end if;
 if not exists(select 1 from public.workout_exercises where workout_exercises.workout_id=w.id) or exists(select 1 from public.workout_exercises e where e.workout_id=w.id and (select count(*) from public.sets where workout_exercise_id=e.id)<>3) then raise exception 'Neúplné série'; end if;
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

revoke all on function public.save_workout(jsonb), public.complete_workout(uuid) from public;
grant execute on function public.save_workout(jsonb), public.complete_workout(uuid) to authenticated;
commit;
