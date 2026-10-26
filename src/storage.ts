/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";
import type { Exercise, Workout, Person } from "./domain";
const env = import.meta.env;
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
  const signal = AbortSignal.timeout(20000);
  const [p, e, w, c] = await Promise.all([
    supabase.from("profiles").select("*").abortSignal(signal),
    supabase.from("exercises").select("*").abortSignal(signal),
    supabase
      .from("workouts")
      .select("*, workout_exercises(*, sets(*))")
      .abortSignal(signal),
    supabase
      .from("cycle")
      .select("*")
      .eq("id", true)
      .abortSignal(signal)
      .maybeSingle(),
  ]);
  for (const r of [p, e, w, c]) if (r.error) throw r.error;
  if (!c.data)
    throw Error(
      "Společný cyklus není dostupný. Ověřte přihlášený účet, propojení profiles.auth_user_id a RLS; lokální zápisy zůstávají zachovány.",
    );
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
  if (typeof data !== "string" || !data)
    throw Error("Server nepotvrdil ID uloženého tréninku.");
  return data;
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

export async function savePatch(
  job: import("./autosave").PendingSave,
  honzaPlan?: string[],
) {
  if (!supabase) throw Error("Supabase není připojen.");
  const { data, error } = await supabase
    .rpc("save_workout_patch", {
      payload: { ...job.workout, honzaPlan },
      changes: job.changes,
    })
    .abortSignal(AbortSignal.timeout(20000));
  if (error) throw error;
  if (typeof data !== "string" || !data)
    throw Error("Server nepotvrdil ID uloženého tréninku.");
  return data;
}

// Trvalé smazání je povolené pouze cvikům bez historických výsledků.
export async function deleteExerciseRemote(id: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.rpc("delete_unused_exercise", {
    target_exercise_id: id,
  });
  if (error) throw error;
  if (data !== true) throw Error("Server nepotvrdil smazání cviku.");
}
