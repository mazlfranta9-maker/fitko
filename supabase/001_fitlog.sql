-- Spusťte jednou v SQL editoru svého Supabase projektu.
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, name text not null unique check(name in ('Honza','David')));
create table public.exercises (id text primary key, name text not null check(length(trim(name)) between 1 and 120), muscle text not null check(muscle in ('Prsa','Biceps','Záda','Triceps','Nohy','Ramena','Předloktí','Bedra','Trapézy','Lýtka','Břicho')), note text not null default '', photo text not null default '', archived boolean not null default false);
create table public.rounds(id uuid primary key default gen_random_uuid(), day integer not null check(day between 1 and 12), created_at timestamptz not null default now(), advanced boolean not null default false);
create table public.cycle(id boolean primary key default true check(id), day integer not null check(day between 1 and 12), round_id uuid not null references public.rounds(id));
with r as(insert into public.rounds(day) values(1) returning id) insert into public.cycle(day,round_id) select 1,id from r;
create table public.workouts(id uuid primary key, round_id uuid not null references public.rounds(id), user_id uuid not null references public.profiles(id), day integer not null check(day between 1 and 12), started_at timestamptz not null default now(), completed boolean not null default false, unique(round_id,user_id));
create table public.workout_exercises(id uuid primary key default gen_random_uuid(),workout_id uuid not null references public.workouts(id) on delete cascade,exercise_id text not null references public.exercises(id),position integer not null check(position between 0 and 9),unique(workout_id,position));
create table public.sets(id uuid primary key default gen_random_uuid(),workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,ordinal integer not null check(ordinal between 1 and 3),weight numeric(8,2) not null check(weight between 0 and 2000),reps integer not null check(reps between 1 and 1000),unique(workout_exercise_id,ordinal));
create function public.is_member() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid()) $$;
revoke all on function public.is_member() from public; grant execute on function public.is_member() to authenticated;
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.rounds enable row level security;
alter table public.cycle enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(public.is_member());
create policy exercises_read on public.exercises for select to authenticated using(public.is_member());
create policy exercises_insert on public.exercises for insert to authenticated with check(public.is_member());
create policy exercises_update on public.exercises for update to authenticated using(public.is_member()) with check(public.is_member());
create policy rounds_read on public.rounds for select to authenticated using(public.is_member());
create policy cycle_read on public.cycle for select to authenticated using(public.is_member());
create policy workouts_read on public.workouts for select to authenticated using(public.is_member());
create policy workouts_delete on public.workouts for delete to authenticated using(user_id=auth.uid() and public.is_member());
create policy entries_read on public.workout_exercises for select to authenticated using(public.is_member());
create policy sets_read on public.sets for select to authenticated using(public.is_member());
-- Všechny zápisy výsledků procházejí transakční RPC; přímé zápisy RLS nepovoluje.
create function public.save_workout(payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare wid uuid; rid uuid; d integer; ex jsonb; s jsonb; eid uuid; pos integer:=0; ord integer; existing public.workouts; expected text[]; main text[]; counts jsonb:='{}'; seen text[]:='{}'; legacy text[]; actual text[];
begin
 if not public.is_member() then raise exception 'Nepovolený účet'; end if;
 if payload->>'user' <> (select name from public.profiles where id=auth.uid()) then raise exception 'Cizí profil'; end if;
 wid:=(payload->>'id')::uuid; rid:=(payload->>'round')::uuid;
 select day into d from public.rounds where id=rid; if d is null or d<>(payload->>'day')::int then raise exception 'Neplatný den cyklu'; end if;
 main:=case ((d-1)%6) when 0 then array['Prsa','Biceps'] when 1 then array['Záda','Triceps'] when 2 then array['Nohy','Ramena'] when 3 then array['Biceps','Prsa'] when 4 then array['Triceps','Záda'] else array['Ramena','Nohy'] end;
 expected:=array[main[1],main[1],main[1],main[2],main[2],main[2]]||case when 'Prsa'=any(main) then array['Předloktí','Břicho'] when 'Záda'=any(main) then array['Bedra','Břicho'] else array['Trapézy','Lýtka','Břicho'] end;
 legacy:=main||main||main||expected[7:array_length(expected,1)];
 select array_agg(e.muscle order by a.ordinality) into actual from jsonb_array_elements(payload->'entries') with ordinality a(value,ordinality) left join public.exercises e on e.id=a.value->>'exerciseId';
 if actual=legacy then expected:=legacy; end if;
 if jsonb_array_length(payload->'entries')<>array_length(expected,1) then raise exception 'Nesprávný počet cviků'; end if;
 -- Serializace zápisů jednoho uživatele a kola.
 perform pg_advisory_xact_lock(hashtextextended(rid::text||auth.uid()::text,0));
 select * into existing from public.workouts where round_id=rid and user_id=auth.uid() for update;
 if existing.id is not null then wid:=existing.id; end if;
 if exists(select 1 from public.workouts where id=wid and user_id<>auth.uid()) then raise exception 'Cizí záznam'; end if;
 insert into public.workouts(id,round_id,user_id,day,started_at) values(wid,rid,auth.uid(),d,(payload->>'date')::timestamptz) on conflict(id) do nothing;
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
create function public.complete_workout(workout_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare w public.workouts; r public.rounds; nr uuid; other_user uuid;
begin
 if not public.is_member() then raise exception 'Nepovolený účet'; end if;
 select * into w from public.workouts where id=workout_id and user_id=auth.uid() for update;
 if w.id is null then raise exception 'Trénink nenalezen'; end if;
 if not exists(select 1 from public.workout_exercises where workout_exercises.workout_id=w.id) or exists(select 1 from public.workout_exercises e where e.workout_id=w.id and (select count(*) from public.sets where workout_exercise_id=e.id)<>3) then raise exception 'Neúplné série'; end if;
 select * into r from public.rounds where id=w.round_id for update;
 update public.workouts set completed=true where id=w.id;
 if not r.advanced then
  -- Druhému profilu zachováme totéž kolo, i když začne zapisovat později.
  for other_user in select id from public.profiles where id<>auth.uid() loop
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
create function public.change_cycle(new_day integer) returns void language plpgsql security definer set search_path=public as $$
declare nr uuid;
begin
 if not public.is_member() or new_day not between 1 and 12 then raise exception 'Nepovolená změna'; end if;
 perform 1 from public.cycle where id=true for update;
 insert into public.rounds(day) values(new_day) returning id into nr;
 update public.cycle set day=new_day,round_id=nr where id=true;
end $$;
revoke all on function public.save_workout(jsonb),public.complete_workout(uuid),public.change_cycle(integer) from public;
grant execute on function public.save_workout(jsonb),public.complete_workout(uuid),public.change_cycle(integer) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('exercise-photos','exercise-photos',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy photos_insert on storage.objects for insert to authenticated with check(bucket_id='exercise-photos' and public.is_member());
-- Fotografie cviků jsou veřejné přes těžko uhodnutelné URL. Osobní fotografie sem nenahrávejte.

insert into public.exercises(id,name,muscle) values
('seed-0-0','Bench press','Prsa'),
('seed-0-1','Tlaky s jednoručkami','Prsa'),
('seed-0-2','Rozpažování na kladkách','Prsa'),
('seed-1-0','Bicepsový zdvih s osou','Biceps'),
('seed-1-1','Kladivové zdvihy','Biceps'),
('seed-1-2','Zdvihy na Scottově lavici','Biceps'),
('seed-2-0','Stahování horní kladky','Záda'),
('seed-2-1','Přítahy v předklonu','Záda'),
('seed-2-2','Veslování na kladce','Záda'),
('seed-3-0','Stlačování kladky','Triceps'),
('seed-3-1','Francouzský tlak','Triceps'),
('seed-3-2','Triceps nad hlavou','Triceps'),
('seed-4-0','Dřep s osou','Nohy'),
('seed-4-1','Leg press','Nohy'),
('seed-4-2','Zakopávání','Nohy'),
('seed-5-0','Tlaky nad hlavou','Ramena'),
('seed-5-1','Upažování','Ramena'),
('seed-5-2','Obrácený peck deck','Ramena'),
('seed-6-0','Zdvihy zápěstí','Předloktí'),
('seed-7-0','Hyperextenze','Bedra'),
('seed-8-0','Krčení ramen','Trapézy'),
('seed-9-0','Výpony ve stoje','Lýtka'),
('seed-10-0','Zkracovačky','Břicho');

-- Oprava oprávnění pro projekty s omezenými výchozími granty.
-- Lze spustit opakovaně. Existující RLS politiky zůstávají aktivní.
grant usage on schema public to authenticated;
grant select on public.profiles, public.exercises, public.rounds,
  public.cycle, public.workouts, public.workout_exercises, public.sets
  to authenticated;
grant insert, update on public.exercises to authenticated;
grant delete on public.workouts to authenticated;
