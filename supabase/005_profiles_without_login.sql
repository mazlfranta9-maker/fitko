-- Oddělí cvičícího od jeho přihlášení. Davidovi lze zapisovat ještě před založením účtu.
-- Spusťte po přípravě databáze 001/004. Zachovává ID profilů i všechny výsledky.
begin;
alter table public.profiles add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.profiles drop constraint if exists profiles_id_fkey;
update public.profiles p set auth_user_id=p.id
 where p.auth_user_id is null and exists(select 1 from auth.users u where u.id=p.id);
insert into public.profiles(id,name) values(gen_random_uuid(),'David') on conflict(name) do nothing;

create or replace function public.bind_profile_account() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.auth_user_id is null and exists(select 1 from auth.users where id=new.id) then
  new.auth_user_id:=new.id;
 end if;
 return new;
end $$;
revoke all on function public.bind_profile_account() from public;
drop trigger if exists bind_profile_account on public.profiles;
create trigger bind_profile_account before insert on public.profiles
 for each row execute function public.bind_profile_account();

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where auth_user_id=auth.uid())
$$;
revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;
notify pgrst,'reload schema';
commit;
