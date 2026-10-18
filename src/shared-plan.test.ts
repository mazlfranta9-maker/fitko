import { expect, it } from "vitest";
import { followHonza, sharedRound } from "./shared-plan";
import { selected, seedExercises, type Workout } from "./domain";
const blank = (user: "Honza" | "David" = "Honza"): Workout => ({
  id: user,
  round: "round",
  user,
  day: 1,
  date: "2026-10-18",
  completed: false,
  entries: selected(1, seedExercises).map((exerciseId) => ({
    exerciseId,
    sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
  })),
});
it("David follows Honza without copying weights or reps", () => {
  const h = blank(),
    d = blank("David");
  h.entries[0].exerciseId = "alternate";
  h.entries[0].sets[0] = { weight: "100", reps: "10" };
  const result = followHonza(d, h, seedExercises);
  expect(result.conflict).toBe(false);
  expect(result.workout.entries[0]).toEqual({
    exerciseId: "alternate",
    sets: d.entries[0].sets,
  });
  expect(d.entries[0].exerciseId).not.toBe("alternate");
});
it("old different David results are preserved and reported", () => {
  const h = blank(),
    d = blank("David");
  h.entries[0].exerciseId = "alternate";
  d.entries[0].sets[0] = { weight: "20", reps: "10" };
  expect(followHonza(d, h, seedExercises)).toEqual({
    workout: d,
    conflict: true,
  });
});
it("both devices choose the same meaningful round regardless of cached screen or account", () => {
  const old = blank(),
    newer = { ...blank("David"), round: "new", date: "2026-10-19" };
  old.entries[0].sets[0] = { weight: "100", reps: "10" };
  const cycle = { day: 2, round: "cycle" };
  expect(sharedRound([newer, old], cycle, [])).toEqual({
    day: 1,
    round: old.round,
  });
  expect(sharedRound([old, newer], cycle, [])).toEqual({
    day: 1,
    round: old.round,
  });
  expect(sharedRound([old, newer], cycle, [newer])).toEqual({
    day: 1,
    round: "new",
  });
});
