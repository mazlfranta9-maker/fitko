-- Oprava oprávnění pro projekty s omezenými výchozími granty.
-- Lze spustit opakovaně. Existující RLS politiky zůstávají aktivní.
grant usage on schema public to authenticated;
grant select on public.profiles, public.exercises, public.rounds,
  public.cycle, public.workouts, public.workout_exercises, public.sets
  to authenticated;
grant insert, update on public.exercises to authenticated;
grant delete on public.workouts to authenticated;
