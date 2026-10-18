import { arrangeEntries, type Exercise, type Workout } from "./domain";

const filled = (entry: Workout["entries"][number]) =>
  entry.sets.some((s) => s.weight !== "" || s.reps !== "");
// Old results stay attached to their original exercise. Never relabel them.
export function followHonza(
  david: Workout,
  honza: Workout,
  exercises: Exercise[],
) {
  const source = arrangeEntries(honza.day, honza.entries, exercises);
  const previous = arrangeEntries(david.day, david.entries, exercises);
  if (david.round !== honza.round || david.completed || !source.length)
    return { workout: david, conflict: false };
  const conflict = previous.some(
    (entry, i) => entry.exerciseId !== source[i]?.exerciseId && filled(entry),
  );
  if (conflict) return { workout: david, conflict: true };
  return {
    workout: {
      ...david,
      entries: source.map((entry, i) => ({
        exerciseId: entry.exerciseId,
        sets:
          previous[i]?.exerciseId === entry.exerciseId
            ? previous[i].sets
            : [0, 1, 2].map(() => ({ weight: "", reps: "" })),
      })),
    },
    conflict: false,
  };
}

// A cached cycle is only a previous screen, not a shared selection. Prefer
// pending local writes, then the newest meaningful unfinished round online.
export function sharedRound(
  workouts: Workout[],
  cycle: { day: number; round: string },
  pending: Workout[],
  keepRound?: string,
) {
  const explicit =
    keepRound && [...pending, ...workouts].find((w) => w.round === keepRound);
  if (explicit) return { day: explicit.day, round: explicit.round };
  const local = [...pending].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (local) return { day: local.day, round: local.round };
  const meaningful = workouts
    .filter(
      (w) =>
        !w.completed &&
        (w.entries.some(filled) ||
          workouts.some((other) => other.round === w.round && other.completed)),
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return meaningful ? { day: meaningful.day, round: meaningful.round } : cycle;
}
