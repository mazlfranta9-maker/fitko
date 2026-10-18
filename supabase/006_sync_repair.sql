-- Ruční migrace po 001, 004 a 005. Nejprve staging a záloha.
-- Žádné mazání ani přepis tréninkových řádků během migrace.
begin;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='auth_user_id') then
  raise exception 'Nejprve aplikujte 005_profiles_without_login.sql';
 end if;
end $$;
create or replace function public.save_workout_patch(payload jsonb, changes jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare target_user uuid; wid uuid; rid uuid; d integer; c jsonb; eid uuid; expected text; slot integer; series integer; m text[]; existing_ex text;
begin
 if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes)=0 then raise exception 'Chybí změněné série'; end if;
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
   if exists(select 1 from public.sets where workout_exercise_id=eid and (weight is not null or reps is not null)) then raise exception 'Cvik má uložené série. Změna výběru vyžaduje kontrolu historie.'; end if;
   update public.workout_exercises set exercise_id=c->>'exerciseId' where id=eid;
   update public.sets set weight=null,reps=null where workout_exercise_id=eid;
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
notify pgrst,'reload schema';
commit;
