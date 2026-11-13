import { expect, test, type Page } from "@playwright/test";
import { seedExercises, selected, type Workout } from "../src/domain";
import type { PendingSave } from "../src/autosave";

async function transport(page: Page) {
  const records: Workout[] = [];
  let reads = 0;
  await page.exposeFunction("freeOrderRead", () => {
    reads++;
    return {
      profiles: [
        { id: "honza", auth_user_id: "honza", name: "Honza" },
        { id: "david", auth_user_id: null, name: "David" },
      ],
      exercises: seedExercises,
      workouts: structuredClone(records),
      cycle: { day: 3, round_id: "free-order" },
    };
  });
  await page.exposeFunction("freeOrderWrite", (job: PendingSave) => {
    let w = records.find(
      (w) => w.user === job.workout.user && w.round === job.workout.round,
    );
    if (!w) {
      w = structuredClone(job.workout);
      records.push(w);
    }
    for (const c of job.changes) {
      const entry = w.entries.find((e) => e.exerciseId === c.exerciseId)!;
      for (const field of c.fields ?? ["weight", "reps"])
        entry.sets[c.ordinal - 1][field] = c[field];
    }
    return w.id;
  });
  await page.route(/\/src\/storage\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'honza'}}}}),getUser:async()=>({data:{user:{id:'honza'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
    export function read(k,f){return JSON.parse(localStorage.getItem(k)||'null')??f;}
    export function persist(k,v){localStorage.setItem(k,JSON.stringify(v));}
    export const loadRemote=()=>window.freeOrderRead();
    export const savePatch=j=>window.freeOrderWrite(j);
    export async function loadNextTraining(){return null;} export async function saveNextTraining(){} export async function deleteExerciseRemote(){} export async function saveRemote(){} export async function finishRemote(){} export async function saveExercise(e){return e;}
  `,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".editing-banner strong")).toHaveText("Honza");
  return { records, reads: () => reads };
}
const row = (
  page: Page,
  person: "Honza" | "David",
  exercise: number,
  series: number,
) => page.locator(`#set-${person}-${exercise}-${series}`);
const write = async (
  page: Page,
  person: "Honza" | "David",
  exercise: number,
  series: number,
  weight: string,
) => {
  await row(page, person, exercise, series)
    .locator("input[inputmode=decimal]")
    .fill(weight);
  await row(page, person, exercise, series)
    .locator("input[inputmode=numeric]")
    .fill("12");
};
const pass = async (
  page: Page,
  person: "Honza" | "David",
  exercise: number,
  series: number,
) => row(page, person, exercise, series).locator("button.pass-turn").click();
const drained = async (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
      ),
    )
    .toEqual({});

test("lýtka před rameny: oba viditelní a střídání zůstane na zvoleném cviku", async ({
  page,
}) => {
  const { records } = await transport(page);
  await expect(page.locator(".person-switch")).toHaveCount(0);
  for (let series = 0; series < 3; series++) {
    await write(page, "Honza", 7, series, String(50 + series));
    await pass(page, "Honza", 7, series);
    await expect(row(page, "David", 7, series)).toHaveClass(/active-set/);
    await expect(row(page, "Honza", 7, series)).toBeVisible();
    await write(page, "David", 7, series, String(30 + series));
    await pass(page, "David", 7, series);
    await expect(
      row(
        page,
        series === 2 ? "David" : "Honza",
        7,
        series === 2 ? 2 : series + 1,
      ),
    ).toHaveClass(/active-set/);
  }
  await expect(
    page.getByRole("status").filter({ hasText: "Oba máte tento cvik hotový" }),
  ).toBeVisible();
  await expect(row(page, "Honza", 8, 0)).not.toHaveClass(/active-set/);
  await write(page, "Honza", 3, 0, "20");
  await pass(page, "Honza", 3, 0);
  await write(page, "David", 3, 0, "15");
  await drained(page);
  expect(
    records
      .find((w) => w.user === "Honza")!
      .entries[7].sets.map((s) => s.weight),
  ).toEqual(["50", "51", "52"]);
  expect(
    records
      .find((w) => w.user === "David")!
      .entries[7].sets.map((s) => s.weight),
  ).toEqual(["30", "31", "32"]);
  await page.reload();
  await expect(
    row(page, "Honza", 7, 0).locator("input[inputmode=decimal]"),
  ).toHaveValue("50");
  await expect(
    row(page, "David", 7, 0).locator("input[inputmode=decimal]"),
  ).toHaveValue("30");
  await expect(row(page, "David", 3, 0)).toHaveClass(/active-set/);
});

test("návrat do aplikace nezmění společné kolo ani viditelná pole", async ({
  page,
}) => {
  const state = await transport(page);
  await write(page, "Honza", 7, 0, "50");
  await pass(page, "Honza", 7, 0);
  await drained(page);
  state.records.push({
    id: "other",
    round: "newer-remote",
    user: "Honza",
    day: 6,
    date: "2099-01-01",
    completed: false,
    entries: selected(6, seedExercises).map((exerciseId) => ({
      exerciseId,
      sets: [0, 1, 2].map(() => ({ weight: "10", reps: "10" })),
    })),
  });
  const reads = state.reads();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => state.reads()).toBeGreaterThan(reads);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-history") || "[]").some(
          (w: Workout) => w.id === "other",
        ),
      ),
    )
    .toBe(true);
  await expect(row(page, "David", 7, 0)).toHaveClass(/active-set/);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fitlog-online-cycle")!),
    ),
  ).toEqual({ day: 3, round: "free-order" });
  await expect(
    row(page, "Honza", 7, 0).locator("input[inputmode=decimal]"),
  ).toHaveValue("50");
});

test("Honza potvrdí všechny série a David pak dopíše vlastní bez přeskakování", async ({
  page,
}) => {
  await transport(page);
  for (let series = 0; series < 3; series++) {
    await write(page, "Honza", 7, series, String(50 + series));
    await pass(page, "Honza", 7, series);
  }
  for (let series = 0; series < 3; series++) {
    await write(page, "David", 7, series, String(30 + series));
    await pass(page, "David", 7, series);
    await expect(page.locator(".editing-banner strong")).toHaveText("David");
    await expect(row(page, "David", 7, Math.min(series + 1, 2))).toHaveClass(
      /active-set/,
    );
  }
  await drained(page);
});

test("všech šest předvyplněných sérií: potvrzení a obnovení nepřepíše ani neskryje partnera", async ({
  page,
}) => {
  const { records } = await transport(page);
  for (const person of ["Honza", "David"] as const)
    for (let series = 0; series < 3; series++)
      await write(
        page,
        person,
        7,
        series,
        String((person === "Honza" ? 50 : 30) + series),
      );
  for (let series = 0; series < 3; series++) {
    await pass(page, "Honza", 7, series);
    await expect(row(page, "David", 7, series)).toHaveClass(/active-set/);
    await pass(page, "David", 7, series);
    if (series === 0) {
      await drained(page);
      await page.reload();
      await expect(row(page, "Honza", 7, 1)).toHaveClass(/active-set/);
    }
  }
  await expect(
    page.getByRole("status").filter({ hasText: "Oba máte tento cvik hotový" }),
  ).toBeVisible();
  expect(
    records
      .find((w) => w.user === "Honza")!
      .entries[7].sets.map((s) => s.weight),
  ).toEqual(["50", "51", "52"]);
  expect(
    records
      .find((w) => w.user === "David")!
      .entries[7].sets.map((s) => s.weight),
  ).toEqual(["30", "31", "32"]);
});

test("Enter přidělí potvrzení správnému člověku, podržení nepotvrdí další sérii", async ({
  page,
}) => {
  await transport(page);
  for (let series = 0; series < 3; series++)
    await write(page, "Honza", 7, series, String(50 + series));
  await row(page, "Honza", 7, 0)
    .locator("input[inputmode=numeric]")
    .press("Enter");
  await expect(row(page, "David", 7, 0)).toHaveClass(/active-set/);
  await write(page, "David", 7, 0, "30");
  await row(page, "David", 7, 0)
    .locator("input[inputmode=numeric]")
    .dispatchEvent("keydown", { key: "Enter", repeat: true });
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await row(page, "David", 7, 0)
    .locator("input[inputmode=numeric]")
    .press("Enter");
  await expect(row(page, "Honza", 7, 1)).toHaveClass(/active-set/);
});
