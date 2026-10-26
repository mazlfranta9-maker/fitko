-- 006: bezpečné smazání cviku, který nikde není použit.
-- Spusťte až po 001 a 005; historie a série se NIKDY nemažou.
begin;

create or replace function public.delete_unused_exercise(target_exercise_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member() then
    raise exception 'Nepovolený účet';
  end if;
  if not exists (
    select 1 from public.exercises where id = target_exercise_id
  ) then
    raise exception 'Cvik již v databázi neexistuje';
  end if;
  if exists (
    select 1
    from public.workout_exercises
    where exercise_id = target_exercise_id
  ) then
    raise exception 'Cvik je použit v tréninku nebo historii. Místo smazání jej archivujte.';
  end if;

  -- Cizí klíč workout_exercises.exercise_id zabrání odstranění
  -- i v případě souběžného vložení nového záznamu.
  delete from public.exercises where id = target_exercise_id;
  return true;
end;
$$;

revoke all on function public.delete_unused_exercise(text) from public;
grant execute on function public.delete_unused_exercise(text) to authenticated;
notify pgrst, 'reload schema';
commit;
