import { describe, it, expect } from "vitest";
import {
  plan,
  nextDay,
  typeOf,
  selected,
  seedExercises,
  validSets,
  volume,
  demoHistory,
} from "./domain";
describe("Tréninkový systém", () => {
  it("opakovaně prochází přesně dvanáct dní", () => {
    let d = 1;
    const days = [];
    for (let i = 0; i < 12; i++) {
      days.push(d);
      d = nextDay(d);
    }
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(d).toBe(1);
  });
  it("střídá celé cviky a den 4 začíná bicepsem", () =>
    expect(plan(4).slots).toEqual([
      "Biceps",
      "Prsa",
      "Biceps",
      "Prsa",
      "Biceps",
      "Prsa",
      "Předloktí",
      "Břicho",
    ]));
  it("má břicho každý den, tři cviky pro hlavní partie a jeden pro doplňky", () => {
    for (let d = 1; d <= 12; d++) {
      const p = plan(d);
      for (const m of p.main)
        expect(p.slots.filter((s) => s === m)).toHaveLength(3);
      for (const m of p.extra)
        expect(p.slots.filter((s) => s === m)).toHaveLength(1);
      expect(p.slots.at(-1)).toBe("Břicho");
      expect(selected(d, seedExercises).every(Boolean)).toBe(true);
      expect(typeOf(d)).toBe(d <= 6 ? "Lehký" : "Těžký");
    }
  });
  it("ukládá každou ze tří sérií a desetinnou čárku bez omezení doporučením", () => {
    const sets = [
      { weight: "12,5", reps: "15" },
      { weight: "15", reps: "10" },
      { weight: "20", reps: "8" },
    ];
    expect(validSets(sets)).toBe(true);
    expect(volume(sets)).toBe(497.5);
    expect(JSON.parse(JSON.stringify(sets))).toEqual(sets);
    expect(validSets(sets.slice(0, 2))).toBe(false);
    expect(validSets([{ weight: "", reps: "3" }, ...sets.slice(1)])).toBe(
      false,
    );
    expect(validSets([{ weight: "-1", reps: "3" }, ...sets.slice(1)])).toBe(
      false,
    );
  });
  it("odděluje profily a každý historický cvik má tři série", () => {
    const ws = demoHistory();
    expect(new Set(ws.map((w) => w.user)).size).toBe(2);
    expect(ws.every((w) => w.entries.every((e) => validSets(e.sets)))).toBe(
      true,
    );
  });
});
