import { createClient } from "@supabase/supabase-js";
import type { Exercise, Workout, Person } from "./domain";
const env = (import.meta as unknown as { env: Record<string, string> }).env;
export const supabase =
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY
    ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
    : null;
export function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function persist(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
export async function loadRemote() {
  if (!supabase) throw Error("Supabase není připojen.");
  const [p, e, w, c] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("exercises").select("*"),
    supabase.from("workouts").select("*, workout_exercises(*, sets(*))"),
    supabase.from("cycle").select("*").single(),
  ]);
  for (const r of [p, e, w, c]) if (r.error) throw r.error;
  return {
    profiles: p.data!,
    exercises: e.data!.map((e) => ({
      ...e,
      photo: e.photo || "",
    })) as Exercise[],
    workouts: w.data!.map((w) => ({
      id: w.id,
      round: w.round_id,
      day: w.day,
      user: p.data!.find((p) => p.id === w.user_id)?.name as Person,
      date: w.started_at,
      completed: w.completed,
      entries: w.workout_exercises
        .sort((a: any, b: any) => a.position - b.position)
        .map((e: any) => ({
          exerciseId: e.exercise_id,
          sets: e.sets
            .sort((a: any, b: any) => a.ordinal - b.ordinal)
            .map((s: any) => ({
              weight: s.weight === null ? "" : String(s.weight),
              reps: s.reps === null ? "" : String(s.reps),
            })),
        })),
    })) as Workout[],
    cycle: c.data,
  };
}
export async function saveRemote(w: Workout) {
  if (!supabase) return;
  const { data, error } = await supabase.rpc("save_workout", { payload: w });
  if (error) throw error;
  return data as string;
}
export async function finishRemote(w: Workout) {
  if (!supabase) return;
  const { error } = await supabase.rpc("complete_workout", {
    workout_id: w.id,
  });
  if (error) throw error;
}
export async function saveExercise(e: Exercise) {
  if (!supabase) return;
  let photo = e.photo;
  if (photo.startsWith("data:")) {
    const blob = await (await fetch(photo)).blob();
    const path = `${e.id}/${crypto.randomUUID()}.jpg`;
    const r = await supabase.storage
      .from("exercise-photos")
      .upload(path, blob, { contentType: blob.type });
    if (r.error) throw r.error;
    photo = supabase.storage.from("exercise-photos").getPublicUrl(path)
      .data.publicUrl;
  }
  const { error } = await supabase.from("exercises").upsert({ ...e, photo });
  if (error) throw error;
  return { ...e, photo };
}

export async function savePatch(job: import("./autosave").PendingSave) {
  if (!supabase) throw Error("Supabase není připojen.");
  const { data, error } = await supabase.rpc("save_workout_patch", {
    payload: job.workout,
    changes: job.changes,
  });
  if (error) throw error;
  return data as string;
}
