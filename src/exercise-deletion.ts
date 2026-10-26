import type { Exercise, Workout } from "./domain";

const largeOrSmall = new Set(["Prsa", "Biceps", "Záda", "Triceps", "Nohy", "Ramena"]);

// Odstranění nesmí rozbít rozpracovaný trénink ani historii.
export function deletionBlockReason(
  exercise: Exercise,
  exercises: Exercise[],
  records: Workout[],
): string | null {
  if (
    records.some((w) =>
      w.entries.some((entry) => entry.exerciseId === exercise.id),
    )
  ) {
    return "Cvik už se používá v tréninku nebo historii. Místo smazání jej archivujte.";
  }
  const minimum = largeOrSmall.has(exercise.muscle) ? 3 : 1;
  const available = exercises.filter(
    (e) => e.id !== exercise.id && e.muscle === exercise.muscle && !e.archived,
  ).length;
  if (!exercise.archived && available < minimum) {
    return `Pro partii ${exercise.muscle} musí zůstat alespoň ${minimum} aktivních cviků. Nejprve přidejte náhradu.`;
  }
  return null;
}
