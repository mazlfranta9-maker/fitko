-- 007: Jeden společný termín příštího tréninku pro Honzu a Davida.
-- Nezasahuje do historie, plánů ani odcvičených sérií.
-- Spustit jednou v SQL editoru Supabase před nasazením nové verze.
begin;

create table if not exists public.training_schedule (
  id boolean primary key default true check (id = true),
  next_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.training_schedule enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_schedule'
      and policyname = 'training_schedule_select'
  ) then
    create policy training_schedule_select on public.training_schedule
      for select to authenticated using (public.is_member());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_schedule'
      and policyname = 'training_schedule_insert'
  ) then
    create policy training_schedule_insert on public.training_schedule
      for insert to authenticated with check (public.is_member());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'training_schedule'
      and policyname = 'training_schedule_update'
  ) then
    create policy training_schedule_update on public.training_schedule
      for update to authenticated using (public.is_member())
      with check (public.is_member());
  end if;
end;
$$;

grant select, insert, update on public.training_schedule to authenticated;
insert into public.training_schedule (id, next_at)
  values (true, null)
  on conflict (id) do nothing;
notify pgrst, 'reload schema';
commit;
