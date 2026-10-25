import { expect, it } from "vitest";
import { nextTurn, selected, seedExercises, type Workout } from "./domain";
const blank = (user: "Honza" | "David"): Workout => ({
  id: user,
  round: "legs",
  day: 3,
  user,
  date: "2026-10-25",
  completed: false,
  entries: selected(3, seedExercises).map((exerciseId) => ({
    exerciseId,
    sets: [0, 1, 2].map(() => ({ weight: "", reps: "" })),
  })),
});
it("lýtka před rameny: po šesti sériích nepřeskočí na břicho ani jiný cvik", () => {
  const h = blank("Honza"),
    d = blank("David");
  for (const w of [h, d])
    w.entries[7].sets = [0, 1, 2].map(() => ({
      weight: w.user === "Honza" ? "50" : "30",
      reps: "12",
    }));
  expect(nextTurn(d, h, 7, 2)).toBeNull();
  expect(h.entries[3].sets[0]).toEqual({ weight: "", reps: "" });
});
it("partner má lýtka hotová: nabídne zbývající sérii aktuálnímu profilu místo změny cviku", () => {
  const h = blank("Honza"),
    d = blank("David");
  h.entries[7].sets = [0, 1, 2].map(() => ({ weight: "50", reps: "12" }));
  d.entries[7].sets[0] = { weight: "30", reps: "10" };
  expect(nextTurn(d, h, 7, 0)).toEqual({
    person: "David",
    exercise: 7,
    series: 1,
  });
});
it("ruční přechod z lýtek na ramena předává pouze ramena", () => {
  const h = blank("Honza"),
    d = blank("David");
  h.entries[3].sets[0] = { weight: "20", reps: "10" };
  expect(nextTurn(h, d, 3, 0)).toEqual({
    person: "David",
    exercise: 3,
    series: 0,
  });
  d.entries[3].sets[0] = { weight: "15", reps: "10" };
  expect(nextTurn(d, h, 3, 0)).toEqual({
    person: "Honza",
    exercise: 3,
    series: 1,
  });
});
