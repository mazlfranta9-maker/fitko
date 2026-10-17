export type Person = "Honza" | "David";
export type SetEntry = { weight: string; reps: string };
export type Exercise = {
  id: string;
  name: string;
  muscle: string;
  note: string;
  photo: string;
  archived: boolean;
};
export type Workout = {
  id: string;
  round: string;
  day: number;
  user: Person;
  date: string;
  completed: boolean;
  entries: { exerciseId: string; sets: SetEntry[] }[];
};
export const muscles = [
  "Prsa",
  "Biceps",
  "Záda",
  "Triceps",
  "Nohy",
  "Ramena",
  "Předloktí",
  "Bedra",
  "Trapézy",
  "Lýtka",
  "Břicho",
];
const pairs = [
  ["Prsa", "Biceps"],
  ["Záda", "Triceps"],
  ["Nohy", "Ramena"],
  ["Biceps", "Prsa"],
  ["Triceps", "Záda"],
  ["Ramena", "Nohy"],
];
export const typeOf = (day: number) => (day <= 6 ? "Lehký" : "Těžký");
export const nextDay = (day: number) => (day % 12) + 1;
export function plan(day: number) {
  const main = pairs[(day - 1) % 6];
  const extra = main.includes("Prsa")
    ? ["Předloktí", "Břicho"]
    : main.includes("Záda")
      ? ["Bedra", "Břicho"]
      : ["Trapézy", "Lýtka", "Břicho"];
  return {
    main,
    extra,
    slots: [...main.flatMap((m) => [m, m, m]), ...extra],
  };
}
export function validSets(sets: SetEntry[]) {
  return (
    sets.length === 3 &&
    sets.every(
      (s) =>
        s.weight.trim() !== "" &&
        s.reps.trim() !== "" &&
        Number.isFinite(Number(s.weight.replace(",", "."))) &&
        Number(s.weight.replace(",", ".")) >= 0 &&
        Number(s.weight.replace(",", ".")) <= 2000 &&
        /^\d+$/.test(s.reps) &&
        +s.reps > 0 &&
        +s.reps <= 1000,
    )
  );
}
export const kg = (s: string) => Number(s.replace(",", "."));
export const volume = (sets: SetEntry[]) =>
  sets.reduce((n, s) => n + kg(s.weight) * +s.reps, 0);
export const category = (m: string) =>
  ["Prsa", "Záda", "Nohy"].includes(m)
    ? "Velké"
    : ["Biceps", "Triceps", "Ramena"].includes(m)
      ? "Malé"
      : "Doplňkové";
const names: Record<string, string[]> = {
  Prsa: ["Bench press", "Tlaky s jednoručkami", "Rozpažování na kladkách"],
  Biceps: [
    "Bicepsový zdvih s osou",
    "Kladivové zdvihy",
    "Zdvihy na Scottově lavici",
  ],
  Záda: [
    "Stahování horní kladky",
    "Přítahy v předklonu",
    "Veslování na kladce",
  ],
  Triceps: ["Stlačování kladky", "Francouzský tlak", "Triceps nad hlavou"],
  Nohy: ["Dřep s osou", "Leg press", "Zakopávání"],
  Ramena: ["Tlaky nad hlavou", "Upažování", "Obrácený peck deck"],
  Předloktí: ["Zdvihy zápěstí"],
  Bedra: ["Hyperextenze"],
  Trapézy: ["Krčení ramen"],
  Lýtka: ["Výpony ve stoje"],
  Břicho: ["Zkracovačky"],
};
export const seedExercises: Exercise[] = Object.entries(names).flatMap(
  ([muscle, ns]) =>
    ns.map((name, i) => ({
      id: `seed-${muscles.indexOf(muscle)}-${i}`,
      name,
      muscle,
      note: "",
      photo: "",
      archived: false,
    })),
);
export function selected(day: number, ex: Exercise[]) {
  const count: Record<string, number> = {};
  return plan(day).slots.map((m) => {
    const i = count[m] || 0;
    count[m] = i + 1;
    return ex.filter((e) => e.muscle === m && !e.archived)[i]?.id || "";
  });
}
export function demoHistory(): Workout[] {
  return [0, 1, 2, 3].flatMap((n) =>
    (["Honza", "David"] as Person[]).map((user, j) => ({
      id: `demo-${n}-${j}`,
      round: `demo-round-${n}`,
      day: n % 2 ? 7 : 1,
      user,
      date: new Date(Date.now() - (28 - n * 7) * 86400000).toISOString(),
      completed: true,
      entries: selected(n % 2 ? 7 : 1, seedExercises).map((exerciseId) => ({
        exerciseId,
        sets: [0, 1, 2].map((i) => ({
          weight: String(30 + n * 2.5 + j * 5 + i * 2.5),
          reps: String(n % 2 ? 7 - i : 12 - i),
        })),
      })),
    })),
  );
}

// Starší koncepty přeřadíme podle partií, přičemž série cestují se svým cvikem.
export function arrangeEntries(
  day: number,
  entries: Workout["entries"],
  exercises: Exercise[],
): Workout["entries"] {
  if (entries.length !== plan(day).slots.length) return entries;
  const remaining = [...entries],
    result: Workout["entries"] = [];
  for (const muscle of plan(day).slots) {
    const index = remaining.findIndex(
      (e) => exercises.find((x) => x.id === e.exerciseId)?.muscle === muscle,
    );
    if (index < 0) return entries;
    result.push(remaining.splice(index, 1)[0]);
  }
  return result;
}
