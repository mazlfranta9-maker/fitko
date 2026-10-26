import { expect, it } from "vitest";
import { deletionBlockReason } from "./exercise-deletion";
import type { Exercise, Workout } from "./domain";

const e = (id: string, muscle = "Prsa", archived = false): Exercise => ({
  id, name: id, muscle, note: "", photo: "", archived,
});
const workout = (exerciseId: string): Workout => ({
  id: "workout", round: "round", day: 1, user: "Honza",
  date: "2026-10-26", completed: false,
  entries: [{ exerciseId, sets: [{ weight: "", reps: "" }] }],
});

it("nepovolí smazat cvik z rozpracovaného tréninku ani z historie", () => {
  const items = [e("a"), e("b"), e("c"), e("d")];
  expect(deletionBlockReason(items[3], items, [workout("d")])).toContain("archivujte");
});
it("pro hlavní partii zachová nejméně tři aktivní cviky", () => {
  const items = [e("a"), e("b"), e("c")];
  expect(deletionBlockReason(items[0], items, [])).toContain("alespoň 3");
  expect(deletionBlockReason(e("d"), [...items, e("d")], [])).toBeNull();
});
it("pro doplňkové partie zachová alespoň jeden aktivní cvik", () => {
  expect(deletionBlockReason(e("a", "Břicho"), [e("a", "Břicho")], [])).toContain("alespoň 1");
  expect(deletionBlockReason(e("b", "Břicho"), [e("a", "Břicho"), e("b", "Břicho")], [])).toBeNull();
});
it("archivovaný nepoužitý cvik může být smazán", () => {
  const items = [e("a", "Břicho", true)];
  expect(deletionBlockReason(items[0], items, [])).toBeNull();
});
