import { expect, it } from "vitest";
import type { Workout } from "./domain";
import {
  trainingDays, trainingTotals, pragueDateKey, pragueLocalToIso,
  pragueTimeParts, czechTrainingDate,
} from "./calendar";

const w = (user: "Honza" | "David", date: string, completed = true): Workout => ({
  id: user + date, user, date, completed, day: 1, round: "abc", entries: [],
});

it("dokončené záznamy sdružuje do odcvičených dnů bez dvojího započtení", () => {
  const days = trainingDays([
    w("Honza", "2026-10-25T10:00:00Z"),
    w("David", "2026-10-25T10:05:00Z"),
    w("Honza", "2026-10-24T10:00:00Z", false),
    w("David", "2026-09-30T18:00:00Z"),
  ]);
  expect(days.map((d) => d.dateKey)).toEqual(["2026-10-25", "2026-09-30"]);
  expect(days[0].participants).toEqual(["Honza", "David"]);
  expect(trainingTotals(days, new Date("2026-10-28T09:00:00Z"))).toEqual({
    month: { days: 1, honza: 1, david: 1 },
    year: { days: 2, honza: 1, david: 2 },
  });
});
it("práce s půlnocí v ČR nepřepisuje datum na UTC", () => {
  expect(pragueDateKey("2026-10-25T23:30:00Z")).toBe("2026-10-26");
  expect(czechTrainingDate("2026-10-25")).toContain("25");
});
it("čas plánování správně zachází s letním i zimním časem", () => {
  expect(pragueLocalToIso("2026-10-28", "18:00")).toBe("2026-10-28T17:00:00.000Z");
  expect(pragueLocalToIso("2026-07-28", "18:00")).toBe("2026-07-28T16:00:00.000Z");
  expect(pragueLocalToIso("2026-03-29", "02:30")).toBeNull();
  expect(pragueTimeParts("2026-10-28T17:00:00.000Z")).toEqual({ date: "2026-10-28", time: "18:00" });
});
