-- Ruční nasazení po 004/005 (obsahuje i opravu patchů z 006).
-- Nejprve záloha a staging. Neprovádí backfill, mazání ani přepis sérií.
begin;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='auth_user_id') then raise exception 'Nejprve aplikujte 005_profiles_without_login.sql'; end if;
end $$;
create or replace function public.save_workout_patch(payload jsonb, changes jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_user uuid; wid uuid; rid uuid; d integer; c jsonb; eid uuid; expected text; slot integer; series integer; m text[]; existing_ex text; hid uuid; honza_user uuid; shared_ids text[]; init_payload jsonb; blank_entries jsonb; partner_entry uuid;
begin
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)=0 then raise exception 'Chybí změněné série'; end if;
 if not public.is_member() then raise exception 'Nepovolený účet'; end if;
 if (select count(distinct e->>'exerciseId') from jsonb_array_elements(payload->'entries') e)<>jsonb_array_length(payload->'entries') then raise exception 'Duplicitní cvik'; end if;
 select id into target_user from public.profiles where name=payload->>'user';
 if target_user is null then raise exception 'Vybraný profil nemá vytvořený účet'; end if;
 rid:=(payload->>'round')::uuid;
 select day into d from public.rounds where id=rid;
 if d is null or d<>(payload->>'day')::int then raise exception 'Neplatný den cyklu'; end if;
 -- Both profiles share a round lock; the phone can initialize it alone.
 perform pg_advisory_xact_lock(hashtextextended('fitlog-plan:'||rid::text,0));
 select id into honza_user from public.profiles where name='Honza';
 if honza_user is null then raise exception 'Chybí profil Honza'; end if;
 select id into hid from public.workouts where round_id=rid and user_id=honza_user;
 if payload->>'user'='David' and (hid is null or not exists(select 1 from public.workout_exercises where workout_id=hid)) then
  if jsonb_typeof(payload->'honzaPlan') is distinct from 'array' then raise exception 'Nejprve načtěte společné cviky u Honzy; aktualizujte aplikaci'; end if;
  select jsonb_agg(jsonb_build_object('exerciseId',a.value,'sets',jsonb_build_array(jsonb_build_object('weight','','reps',''),jsonb_build_object('weight','','reps',''),jsonb_build_object('weight','','reps',''))) order by a.ordinality)
    into blank_entries from jsonb_array_elements_text(payload->'honzaPlan') with ordinality a(value,ordinality);
  init_payload:=payload||jsonb_build_object('id',gen_random_uuid(),'user','Honza','entries',blank_entries);
  hid:=public.save_workout(init_payload);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(rid::text||target_user::text,0));
 select id into wid from public.workouts where round_id=rid and user_id=target_user for update;
 if wid is null or not exists(select 1 from public.workout_exercises where workout_id=wid) then
  select jsonb_agg(jsonb_build_object('exerciseId',a.value->>'exerciseId','sets',jsonb_build_array(jsonb_build_object('weight','','reps',''),jsonb_build_object('weight','','reps',''),jsonb_build_object('weight','','reps',''))) order by a.ordinality)
   into blank_entries from jsonb_array_elements(payload->'entries') with ordinality a(value,ordinality);
  wid:=public.save_workout(payload||jsonb_build_object('entries',blank_entries));
 end if;
 if (select completed from public.workouts where id=wid) then raise exception 'Trénink už je dokončený. Opravte jej v historii.'; end if;
 m:=case ((d-1)%6) when 0 then array['Prsa','Biceps'] when 1 then array['Záda','Triceps'] when 2 then array['Nohy','Ramena'] when 3 then array['Biceps','Prsa'] when 4 then array['Triceps','Záda'] else array['Ramena','Nohy'] end;
 if payload->>'user'='Honza' then hid:=wid; end if;
 select array_agg(e.exercise_id order by
   case ex.muscle when m[1] then 0 when m[2] then 1
    when 'Předloktí' then 2 when 'Bedra' then 2 when 'Trapézy' then 2 when 'Lýtka' then 3 else 4 end,e.position)
  into shared_ids from public.workout_exercises e join public.exercises ex on ex.id=e.exercise_id where e.workout_id=hid;
 for c in select value from jsonb_array_elements(changes) loop
  slot:=(c->>'position')::int;series:=(c->>'ordinal')::int;
  expected:=case when slot between 0 and 2 then m[1] when slot between 3 and 5 then m[2] when slot=6 then case when 'Prsa'=any(m) then 'Předloktí' when 'Záda'=any(m) then 'Bedra' else 'Trapézy' end when slot=7 then case when 'Nohy'=any(m) then 'Lýtka' else 'Břicho' end when slot=8 and 'Nohy'=any(m) then 'Břicho' end;
  if expected is null or series not between 1 and 3 or not exists(select 1 from public.exercises where id=c->>'exerciseId' and muscle=expected) then raise exception 'Neplatný cvik nebo série'; end if;
  if payload->>'user'='David' and (shared_ids[slot+1] is null or shared_ids[slot+1]<>c->>'exerciseId') then
   raise exception 'Davidův cvik musí odpovídat Honzovi. Obnovte společný plán; lokální série zůstávají zachovány.';
  end if;
  -- Starší koncepty mohou mít střídavé pořadí. Identita cviku zachová jeho série.
  select id into eid from public.workout_exercises where workout_id=wid and exercise_id=c->>'exerciseId';
  if eid is null then
   select id,exercise_id into eid,existing_ex from public.workout_exercises where workout_id=wid and position=slot;
   if payload->>'user'<>'David' and not coalesce((c->>'replaceExercise')::boolean,false) then raise exception 'Výběr cviku se změnil na druhém zařízení. Obnovte online data.'; end if;
   if eid is null then raise exception 'Chybí pozice cviku'; end if;
   if exists(select 1 from public.sets where workout_exercise_id=eid and (weight is not null or reps is not null)) then raise exception 'Cvik má uložené série. Změna výběru vyžaduje kontrolu historie.'; end if;
   update public.workout_exercises set exercise_id=c->>'exerciseId' where id=eid;
  end if;
   if payload->>'user'='Honza' then
    -- The choice is locked as soon as either person has results for it.
    for partner_entry in select e.id from public.workout_exercises e join public.workouts w on w.id=e.workout_id
     where w.round_id=rid and w.user_id<>honza_user and e.position=slot and e.exercise_id<>c->>'exerciseId' loop
      if exists(select 1 from public.sets where workout_exercise_id=partner_entry and (weight is not null or reps is not null)) then
       raise exception 'David už má u tohoto cviku výsledky. Změna výběru by změnila význam série.';
      end if;
      update public.workout_exercises set exercise_id=c->>'exerciseId' where id=partner_entry;
    end loop;
   end if;
  if not (c ? 'weight' and c ? 'reps') or c->>'weight' is null or c->>'reps' is null then raise exception 'Chybí hodnoty série'; end if;
  if c ? 'fields' and (jsonb_typeof(c->'fields')<>'array' or jsonb_array_length(c->'fields')=0 or exists(select 1 from jsonb_array_elements_text(c->'fields') f where f not in ('weight','reps'))) then raise exception 'Neplatná pole série'; end if;
  if coalesce(c->>'reps','')<>'' and (c->>'reps') !~ '^\d+$' then raise exception 'Neplatný počet opakování'; end if;
  insert into public.sets(workout_exercise_id,ordinal,weight,reps)
   values(eid,series,nullif(replace(c->>'weight',',','.'),'')::numeric,nullif(c->>'reps','')::int)
   on conflict(workout_exercise_id,ordinal) do update set weight=case when not(c ? 'fields') or (c->'fields') ? 'weight' then excluded.weight else sets.weight end,
     reps=case when not(c ? 'fields') or (c->'fields') ? 'reps' then excluded.reps else sets.reps end;
 end loop;
 return wid;
end $$;
revoke all on function public.save_workout_patch(jsonb,jsonb) from public;
grant execute on function public.save_workout_patch(jsonb,jsonb) to authenticated;

create or replace function public.enforce_david_exercise() returns trigger
language plpgsql security definer set search_path=public as $$
declare rid uuid; who text; d integer; m text[]; ids text[]; honza_id uuid;
begin
 select w.round_id,p.name,w.day into rid,who,d from public.workouts w join public.profiles p on p.id=w.user_id where w.id=new.workout_id;
 if who='Honza' then
  if exists(select 1 from public.workout_exercises e join public.workouts w on w.id=e.workout_id join public.profiles p on p.id=w.user_id
    join public.sets s on s.workout_exercise_id=e.id
    where w.round_id=rid and p.name='David' and e.position=new.position and e.exercise_id<>new.exercise_id and (s.weight is not null or s.reps is not null)) then
   raise exception 'David už má u tohoto cviku výsledky. Změna výběru by změnila význam série.';
  end if;
  return new;
 end if;
 if who<>'David' then return new; end if;
 -- Updating unrelated columns or preserving a legacy identity is harmless.
 if TG_OP='UPDATE' then
  if old.exercise_id=new.exercise_id and old.position=new.position then return new; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('fitlog-plan:'||rid::text,0));
 select w.id into honza_id from public.workouts w join public.profiles p on p.id=w.user_id where w.round_id=rid and p.name='Honza';
 m:=case ((d-1)%6) when 0 then array['Prsa','Biceps'] when 1 then array['Záda','Triceps'] when 2 then array['Nohy','Ramena'] when 3 then array['Biceps','Prsa'] when 4 then array['Triceps','Záda'] else array['Ramena','Nohy'] end;
 select array_agg(e.exercise_id order by case ex.muscle when m[1] then 0 when m[2] then 1 when 'Předloktí' then 2 when 'Bedra' then 2 when 'Trapézy' then 2 when 'Lýtka' then 3 else 4 end,e.position)
 into ids from public.workout_exercises e join public.exercises ex on ex.id=e.exercise_id where e.workout_id=honza_id;
 if ids[new.position+1] is null or ids[new.position+1]<>new.exercise_id then
  raise exception 'Davidův cvik musí odpovídat Honzovi. Nejprve obnovte společný plán.';
 end if;
 return new;
end $$;
revoke all on function public.enforce_david_exercise() from public;
drop trigger if exists enforce_david_exercise on public.workout_exercises;
create trigger enforce_david_exercise before insert or update of exercise_id,position on public.workout_exercises for each row execute function public.enforce_david_exercise();

notify pgrst,'reload schema';
commit;
