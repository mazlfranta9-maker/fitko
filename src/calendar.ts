import type { Person, Workout } from "./domain";

export const PRAGUE_TIME_ZONE = "Europe/Prague";
export type TrainingDay = {
  dateKey: string;
  participants: Person[];
};

export function pragueDateKey(input: string | Date): string | null {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return [value("year"), value("month"), value("day")].join("-");
}

export function trainingDays(workouts: Workout[]): TrainingDay[] {
  const grouped = new Map<string, Set<Person>>();
  for (const workout of workouts) {
    if (!workout.completed) continue;
    if (workout.user !== "Honza" && workout.user !== "David") continue;
    const key = pragueDateKey(workout.date);
    if (!key) continue;
    const users = grouped.get(key) ?? new Set<Person>();
    users.add(workout.user);
    grouped.set(key, users);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, users]) => ({
      dateKey,
      participants: (["Honza", "David"] as Person[]).filter((user) =>
        users.has(user),
      ),
    }));
}

export function trainingTotals(days: TrainingDay[], now = new Date()) {
  const today = pragueDateKey(now) ?? "";
  const thisYear = today.slice(0, 4);
  const thisMonth = today.slice(0, 7);
  const calculate = (prefix: string) => {
    const subset = days.filter((day) => day.dateKey.startsWith(prefix));
    return {
      days: subset.length,
      honza: subset.filter((day) => day.participants.includes("Honza")).length,
      david: subset.filter((day) => day.participants.includes("David")).length,
    };
  };
  return { month: calculate(thisMonth), year: calculate(thisYear) };
}

export function czechTrainingDate(dateKey: string): string {
  const date = new Date(dateKey + "T12:00:00Z");
  return date.toLocaleDateString("cs-CZ", {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

// Input is a Prague wall-clock date and time, not the timezone of the phone.
// Reject nonexistent wall-clock times during the spring DST transition.
export function pragueLocalToIso(dateValue: string, timeValue: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue))
    return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  if (hour > 23 || minute > 59 || month < 1 || month > 12 || day < 1 || day > 31)
    return null;
  const base = Date.UTC(year, month - 1, day, hour, minute);
  for (const offset of [2, 1]) {
    const candidate = new Date(base - offset * 3600000);
    const parts = pragueTimeParts(candidate);
    if (parts.date === dateValue && parts.time === timeValue)
      return candidate.toISOString();
  }
  return null;
}

export function pragueTimeParts(input: string | Date): { date: string; time: string } {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: [value("year"), value("month"), value("day")].join("-"),
    time: value("hour") + ":" + value("minute"),
  };
}

export function czechTrainingDateTime(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", {
    timeZone: PRAGUE_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
