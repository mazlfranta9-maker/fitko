import { expect, it } from "vitest";
import { recoverDraft } from "./recovery";
import { selected, seedExercises, type Workout } from "./domain";
const blank = (): Workout => ({
  id: "local",
  user: "David",
  round: "round",
  day: 1,
  date: "2026-10-17",
  completed: false,
  entries: selected(1, seedExercises).map((exerciseId) => ({
    exerciseId,
    sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
  })),
});
it("obnoví Davidův starý Bench 20 × 10 z konceptu bez fronty", () => {
  const d = blank(),
    remote = blank();
  d.entries[0].sets[0] = { weight: "20", reps: "10" };
  const result = recoverDraft(d, remote, seedExercises);
  expect(result.conflicts).toBe(false);
  expect(result.changes).toEqual([
    expect.objectContaining({
      position: 0,
      weight: "20",
      reps: "10",
      fields: ["weight", "reps"],
    }),
  ]);
  expect(d.entries[0].sets[0].weight).toBe("20");
});
it("obnoví střídavé pořadí a série přenese s identitou cviku", () => {
  const d = blank();
  d.entries[1].sets[0] = { weight: "25", reps: "8" };
  d.entries = [0, 3, 1, 4, 2, 5, 6, 7].map((i) => d.entries[i]);
  const result = recoverDraft(d, undefined, seedExercises);
  expect(result.changes[0]).toMatchObject({
    position: 1,
    exerciseId: selected(1, seedExercises)[1],
    weight: "25",
  });
});
it("nepřepíše novější online údaje ani dokončenou historii", () => {
  const d = blank(),
    remote = blank();
  d.entries[0].sets[0] = { weight: "20", reps: "10" };
  remote.entries[0].sets[0] = { weight: "30", reps: "" };
  const result = recoverDraft(d, remote, seedExercises);
  expect(result.conflicts).toBe(true);
  expect(result.changes[0]).toMatchObject({
    weight: "30",
    reps: "10",
    fields: ["reps"],
  });
  remote.completed = true;
  expect(recoverDraft(d, remote, seedExercises).changes).toEqual([]);
});
