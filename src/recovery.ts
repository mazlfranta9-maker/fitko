import { arrangeEntries, type Exercise, type Workout } from "./domain";
import type { PendingSave, SetPatch } from "./autosave";

// Without a saved baseline a differing remote value is a conflict, never an
// invitation to overwrite another device. Only missing fields are recovered.
export function recoverDraft(
  draft: Workout,
  remote: Workout | undefined,
  exercises: Exercise[],
  pending?: PendingSave,
) {
  const workout = {
    ...draft,
    entries: arrangeEntries(draft.day, draft.entries, exercises),
  };
  const changes: SetPatch[] = [];
  let conflicts = false;
  if (draft.completed || remote?.completed)
    return { workout, changes, conflicts: !!remote?.completed };
  workout.entries = workout.entries.map((entry, position) => {
    const online = remote?.entries.find(
      (e) => e.exerciseId === entry.exerciseId,
    );
    return {
      ...entry,
      sets: entry.sets.map((set, index) => {
        const queued = pending?.changes.find(
          (c) => c.exerciseId === entry.exerciseId && c.ordinal === index + 1,
        );
        const fields = (["weight", "reps"] as const).filter((field) => {
          if (queued && (!queued.fields || queued.fields.includes(field)))
            return false;
          const value = online?.sets[index]?.[field] ?? "";
          if (
            set[field] !== "" &&
            value !== "" &&
            Number(set[field].replace(",", ".")) !== Number(value)
          )
            conflicts = true;
          return set[field] !== "" && value === "";
        });
        if (
          !online &&
          remote?.entries.length &&
          !remote.entries.some((e) => e.exerciseId === entry.exerciseId)
        ) {
          if (fields.length) conflicts = true;
          return set;
        }
        const recovered = {
          weight: online?.sets[index]?.weight ?? "",
          reps: online?.sets[index]?.reps ?? "",
        };
        for (const field of fields) recovered[field] = set[field];
        if (fields.length)
          changes.push({
            position,
            ordinal: index + 1,
            exerciseId: entry.exerciseId,
            ...recovered,
            fields,
          });
        return recovered;
      }),
    };
  });
  return { workout, changes, conflicts };
}
