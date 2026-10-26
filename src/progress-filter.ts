import type { Exercise } from "./domain";

export const ALL_PROGRESS_MUSCLES = "Všechny partie";

export function filterProgressExercises(
  exercises: Exercise[],
  muscle: string,
): Exercise[] {
  return exercises
    .filter(
      (exercise) =>
        muscle === ALL_PROGRESS_MUSCLES || exercise.muscle === muscle,
    )
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export function selectedProgressExerciseId(
  requestedId: string,
  available: Exercise[],
): string {
  return available.some((exercise) => exercise.id === requestedId)
    ? requestedId
    : (available[0]?.id ?? "");
}
