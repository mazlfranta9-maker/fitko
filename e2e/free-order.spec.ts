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
    export async function saveRemote(){} export async function finishRemote(){} export async function saveExercise(e){return e;}
  `,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".editing-banner strong")).toHaveText("Honza");
  return { records, reads: () => reads };
}
const row = (page: Page, exercise: number, series: number) =>
  page.locator(`#set-${exercise}-${series}`);
const write = async (
  page: Page,
  exercise: number,
  series: number,
  weight: string,
) => {
  await row(page, exercise, series)
    .locator("input[inputmode=decimal]")
    .fill(weight);
  await row(page, exercise, series)
    .locator("input[inputmode=numeric]")
    .fill("12");
};
const pass = async (page: Page, exercise: number, series: number) =>
  row(page, exercise, series).locator("button.pass-turn").click();

test("lýtka před rameny: střídání zůstane na zvoleném cviku a zachová oběma série", async ({
  page,
}) => {
  const { records } = await transport(page);
  for (let series = 0; series < 3; series++) {
    await write(page, 7, series, String(50 + series));
    await expect(row(page, 7, series)).toHaveClass(/active-set/);
    await pass(page, 7, series);
    await expect(page.locator(".editing-banner strong")).toHaveText("David");
    await expect(row(page, 7, series)).toHaveClass(/active-set/);
    await write(page, 7, series, String(30 + series));
    await pass(page, 7, series);
    await expect(page.locator(".editing-banner strong")).toHaveText(
      series === 2 ? "David" : "Honza",
    );
    await expect(row(page, 7, series === 2 ? 2 : series + 1)).toHaveClass(
      /active-set/,
    );
  }
  await expect(
    page.getByRole("status").filter({ hasText: "Oba máte tento cvik hotový" }),
  ).toBeVisible();
  await expect(row(page, 8, 0)).not.toHaveClass(/active-set/);
  // Now the users deliberately choose shoulders, independent of the card order.
  await page
    .locator(".person-switch button")
    .filter({ hasText: "Honza" })
    .click();
  await write(page, 3, 0, "20");
  await expect(row(page, 3, 0)).toHaveClass(/active-set/);
  await pass(page, 3, 0);
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await write(page, 3, 0, "15");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
      ),
    )
    .toEqual({});
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
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await expect(row(page, 7, 0).locator("input[inputmode=decimal]")).toHaveValue(
    "30",
  );
  await expect(row(page, 3, 0).locator("input[inputmode=decimal]")).toHaveValue(
    "15",
  );
  await expect(row(page, 3, 0)).toHaveClass(/active-set/);
});

test("návrat z rozbalovací nabídky nebo do aplikace nevybere jiné kolo", async ({
  page,
}) => {
  const state = await transport(page);
  await write(page, 7, 0, "50");
  await pass(page, 7, 0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
      ),
    )
    .toEqual({});
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
  // Wait for the new remote data to be applied, not just for the read to start.
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-history") || "[]").some(
          (w: Workout) => w.id === "other",
        ),
      ),
    )
    .toBe(true);
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await expect(row(page, 7, 0)).toHaveClass(/active-set/);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fitlog-online-cycle")!),
    ),
  ).toEqual({ day: 3, round: "free-order" });
});

test("Honza má zvolený cvik hotový: David dopíše vlastní série bez přeskakování", async ({
  page,
}) => {
  await transport(page);
  for (let series = 0; series < 3; series++) {
    await write(page, 7, series, String(50 + series));
    await pass(page, 7, series);
    if (series < 2)
      await page
        .locator(".person-switch button")
        .filter({ hasText: "Honza" })
        .click();
  }
  await page
    .locator(".person-switch button")
    .filter({ hasText: "David" })
    .click();
  for (let series = 0; series < 3; series++) {
    await write(page, 7, series, String(30 + series));
    await pass(page, 7, series);
    await expect(page.locator(".editing-banner strong")).toHaveText("David");
    await expect(row(page, 7, Math.min(series + 1, 2))).toHaveClass(
      /active-set/,
    );
  }
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
      ),
    )
    .toEqual({});
  for (let series = 0; series < 3; series++)
    await expect(
      row(page, 7, series).locator("input[inputmode=decimal]"),
    ).toHaveValue(String(30 + series));
});

test("předvyplnění všech tří sérií oběma zachová běžné střídání i po reloadu", async ({
  page,
}) => {
  const { records } = await transport(page);
  for (let series = 0; series < 3; series++)
    await write(page, 7, series, String(50 + series));
  await page
    .locator(".person-switch button")
    .filter({ hasText: "David" })
    .click();
  for (let series = 0; series < 3; series++)
    await write(page, 7, series, String(30 + series));
  await page
    .locator(".person-switch button")
    .filter({ hasText: "Honza" })
    .click();
  for (let series = 0; series < 3; series++) {
    await pass(page, 7, series);
    await expect(page.locator(".editing-banner strong")).toHaveText("David");
    await expect(row(page, 7, series)).toHaveClass(/active-set/);
    await expect(
      row(page, 7, series).locator("input[inputmode=decimal]"),
    ).toHaveValue(String(30 + series));
    await pass(page, 7, series);
    await expect(page.locator(".editing-banner strong")).toHaveText(
      series === 2 ? "David" : "Honza",
    );
    await expect(row(page, 7, series === 2 ? 2 : series + 1)).toHaveClass(
      /active-set/,
    );
    if (series === 0) {
      await expect
        .poll(() =>
          page.evaluate(() =>
            JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
          ),
        )
        .toEqual({});
      await page.reload();
      await expect(page.locator(".editing-banner strong")).toHaveText("Honza");
      await expect(row(page, 7, 1)).toHaveClass(/active-set/);
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

test("jen Honza předvyplněný: Enter dál střídá běžně a podržení nepotvrdí partnera", async ({
  page,
}) => {
  await transport(page);
  for (let series = 0; series < 3; series++)
    await write(page, 7, series, String(50 + series));
  await row(page, 7, 0).locator("input[inputmode=numeric]").press("Enter");
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await write(page, 7, 0, "30");
  await row(page, 7, 0)
    .locator("input[inputmode=numeric]")
    .dispatchEvent("keydown", { key: "Enter", repeat: true });
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await row(page, 7, 0).locator("input[inputmode=numeric]").press("Enter");
  await expect(page.locator(".editing-banner strong")).toHaveText("Honza");
  await expect(row(page, 7, 1)).toHaveClass(/active-set/);
  await pass(page, 7, 1);
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await expect(row(page, 7, 1)).toHaveClass(/active-set/);
});
