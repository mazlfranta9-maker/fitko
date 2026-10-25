import { expect, it } from "vitest";
import {
  confirmationKey,
  exerciseConfirmed,
  nextTurn,
  selected,
  seedExercises,
  type SeriesConfirmations,
  type Workout,
} from "./domain";
const workout = (user: "Honza" | "David"): Workout => ({
  id: user,
  user,
  round: "round",
  day: 3,
  date: "2026-10-25",
  completed: false,
  entries: selected(3, seedExercises).map((exerciseId) => ({
    exerciseId,
    sets: [0, 1, 2].map(() => ({
      weight: user === "Honza" ? "50" : "30",
      reps: "12",
    })),
  })),
});
it("všechny hodnoty předvyplněné: střídá 1H–1D–2H–2D–3H–3D a zůstane u lýtek", () => {
  const h = workout("Honza"),
    d = workout("David"),
    confirmed: SeriesConfirmations = {};
  const before = JSON.stringify([h, d]);
  for (let i = 0; i < 3; i++) {
    confirmed[confirmationKey(h, h.entries[7].exerciseId, i)] = true;
    expect(nextTurn(h, d, 7, i, confirmed)).toEqual({
      person: "David",
      exercise: 7,
      series: i,
    });
    confirmed[confirmationKey(d, d.entries[7].exerciseId, i)] = true;
    expect(nextTurn(d, h, 7, i, confirmed)).toEqual(
      i === 2 ? null : { person: "Honza", exercise: 7, series: i + 1 },
    );
  }
  expect(JSON.stringify([h, d])).toBe(before);
});
it("samotné vyplnění neznačí potvrzení a první může začít David", () => {
  const h = workout("Honza"),
    d = workout("David"),
    confirmed: SeriesConfirmations = {};
  expect(exerciseConfirmed(h, h.entries[7].exerciseId, confirmed)).toBe(false);
  confirmed[confirmationKey(d, d.entries[7].exerciseId, 0)] = true;
  expect(nextTurn(d, h, 7, 0, confirmed)).toEqual({
    person: "Honza",
    exercise: 7,
    series: 0,
  });
});
it("potvrzený Honza má hotovo: David dopíše vlastní série bez změny profilu", () => {
  const h = workout("Honza"),
    d = workout("David"),
    confirmed: SeriesConfirmations = {};
  for (let i = 0; i < 3; i++)
    confirmed[confirmationKey(h, h.entries[7].exerciseId, i)] = true;
  confirmed[confirmationKey(d, d.entries[7].exerciseId, 0)] = true;
  expect(exerciseConfirmed(h, h.entries[7].exerciseId, confirmed)).toBe(true);
  expect(nextTurn(d, h, 7, 0, confirmed)).toEqual({
    person: "David",
    exercise: 7,
    series: 1,
  });
});
it("potvrzení se obnoví po reloadu a nesdílí se mezi profily, cviky a koly", () => {
  const h = workout("Honza"),
    d = workout("David");
  const key = confirmationKey(h, h.entries[7].exerciseId, 0);
  const confirmed = JSON.parse(JSON.stringify({ [key]: true }));
  expect(nextTurn(d, h, 7, 0, confirmed)).toEqual({
    person: "Honza",
    exercise: 7,
    series: 1,
  });
  expect(nextTurn(h, d, 7, 0, confirmed)).toEqual({
    person: "David",
    exercise: 7,
    series: 0,
  });
  expect(nextTurn(h, d, 3, 0, confirmed)).toEqual({
    person: "David",
    exercise: 3,
    series: 0,
  });
  expect(
    nextTurn({ ...h, round: "next" }, { ...d, round: "next" }, 7, 0, confirmed),
  ).toEqual({ person: "David", exercise: 7, series: 0 });
});
it("vymazaná hodnota není hotová ani se starým potvrzením", () => {
  const h = workout("Honza"),
    d = workout("David"),
    confirmed: SeriesConfirmations = {};
  for (let i = 0; i < 3; i++)
    confirmed[confirmationKey(h, h.entries[7].exerciseId, i)] = true;
  h.entries[7].sets[0].weight = "";
  expect(exerciseConfirmed(h, h.entries[7].exerciseId, confirmed)).toBe(false);
  expect(nextTurn(d, h, 7, 0, confirmed)).toEqual({
    person: "Honza",
    exercise: 7,
    series: 0,
  });
});
