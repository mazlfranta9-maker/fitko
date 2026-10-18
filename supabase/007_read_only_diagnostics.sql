-- Pouze čtení. Spusťte ručně; výsledek SQL editoru správce nedokazuje klientské RLS.
select name, id, to_jsonb(p)->>'auth_user_id' as auth_user_id,
 exists(select 1 from auth.users u where u.id::text=case when to_jsonb(p) ? 'auth_user_id' then to_jsonb(p)->>'auth_user_id' else p.id::text end) as linked_account_exists
from public.profiles p order by name;
select count(*) as cycle_rows from public.cycle;
select id,day,round_id from public.cycle;
select p.proname,
 case when p.proname='is_member' then position('auth_user_id' in pg_get_functiondef(p.oid))>0 end as separate_login_membership,
 case when p.proname='save_workout_patch' then position('fields' in pg_get_functiondef(p.oid))>0 end as field_patch_support
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('is_member','save_workout','save_workout_patch','complete_workout');
select tablename,policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' order by tablename,policyname;
select table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee='authenticated' order by table_name,privilege_type;
