import { expect, it } from "vitest";
import type { Exercise } from "./domain";
import {
  ALL_PROGRESS_MUSCLES,
  filterProgressExercises,
  selectedProgressExerciseId,
} from "./progress-filter";

const exercise = (
  id: string,
  name: string,
  muscle: string,
  archived = false,
): Exercise => ({
  id, name, muscle, archived, note: "", photo: "",
});
const library = [
  exercise("b", "Tlaky s jednoručkami", "Prsa"),
  exercise("a", "Bench press", "Prsa"),
  exercise("c", "Bicepsový zdvih s osou", "Biceps"),
  exercise("old", "Historický bench", "Prsa", true),
];

it("po výběru prsou nabídne pouze cviky na prsa, včetně historických", () => {
  const result = filterProgressExercises(library, "Prsa");
  expect(result.map((item) => item.id).sort()).toEqual(["a", "b", "old"]);
});
it("výběr všech partií obsahuje všechny cviky", () => {
  expect(filterProgressExercises(library, ALL_PROGRESS_MUSCLES)).toHaveLength(4);
});
it("změna partie vybere první dostupný cvik, ne předchozí biceps", () => {
  const available = filterProgressExercises(library, "Prsa");
  expect(selectedProgressExerciseId("c", available)).toBe("a");
  expect(selectedProgressExerciseId("b", available)).toBe("b");
});
it("prázdná partie a pozdější načtení cviků fungují bez neplatného výběru", () => {
  expect(selectedProgressExerciseId("c", [])).toBe("");
  expect(selectedProgressExerciseId("c", filterProgressExercises(library, "Nohy"))).toBe("");
  expect(selectedProgressExerciseId("c", filterProgressExercises(library, "Biceps"))).toBe("c");
});
