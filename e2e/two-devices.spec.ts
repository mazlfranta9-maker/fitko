import { test, expect } from "@playwright/test";
import { seedExercises, type Workout } from "../src/domain";
import type { PendingSave } from "../src/autosave";

test("PC a telefon: oddělená úložiště, oba profily, souběh a obnova starého konceptu", async ({
  browser,
}) => {
  const records: Workout[] = [];
  const pc = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  for (const context of [pc, phone]) {
    await context.exposeFunction("fitlogRemote", () => ({
      profiles: [
        { id: "h", auth_user_id: "h", name: "Honza" },
        { id: "d", auth_user_id: null, name: "David" },
      ],
      exercises: seedExercises,
      workouts: structuredClone(records),
      cycle: { day: 1, round_id: "shared" },
    }));
    await context.exposeFunction("fitlogPatch", async (job: PendingSave) => {
      let w = records.find(
        (w) => w.round === job.workout.round && w.user === job.workout.user,
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
    await context.route(/\/src\/storage\.ts(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
      export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'h'}}}}),getUser:async()=>({data:{user:{id:'h'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
      export function read(k,f){return JSON.parse(localStorage.getItem(k)||'null')??f;}
      export function persist(k,v){localStorage.setItem(k,JSON.stringify(v));}
      export const loadRemote=()=>window.fitlogRemote();
      export const savePatch=j=>{if(!navigator.onLine)throw Error('Offline');return window.fitlogPatch(j);};
      export async function saveRemote(){} export async function finishRemote(){} export async function saveExercise(e){return e;}
    `,
      }),
    );
  }
  const a = await pc.newPage(),
    b = await phone.newPage();
  await Promise.all([a.goto("/"), b.goto("/")]);
  await Promise.all([
    expect(a.locator(".editing-banner strong")).toHaveText("Honza"),
    expect(b.locator(".editing-banner strong")).toHaveText("Honza"),
  ]);
  const weights = (p: typeof a) => p.locator("input[inputmode=decimal]");
  const reps = (p: typeof a) => p.locator("input[inputmode=numeric]");
  await Promise.all([
    weights(a).nth(0).fill("40"),
    weights(b).nth(1).fill("30"),
  ]);
  await Promise.all([reps(a).nth(0).fill("8"), reps(b).nth(1).fill("9")]);
  await expect
    .poll(() => records[0]?.entries[0].sets.slice(0, 2))
    .toEqual([
      { weight: "40", reps: "8" },
      { weight: "30", reps: "9" },
    ]);
  // Both stale snapshots edit separate fields of the same series.
  await Promise.all([weights(a).nth(0).fill("45"), reps(b).nth(0).fill("10")]);
  await expect
    .poll(() => records[0]?.entries[0].sets[0])
    .toEqual({ weight: "45", reps: "10" });
  await a
    .getByRole("button", {
      name: "Zapsat sérii 1 cviku 1 a předat Davidovi",
      exact: true,
    })
    .click();
  await weights(a).nth(0).fill("20");
  await reps(a).nth(0).fill("10");
  await expect
    .poll(() => records.find((w) => w.user === "David")?.entries[0].sets[0])
    .toEqual({ weight: "20", reps: "10" });
  await b.reload();
  await b
    .getByRole("button", {
      name: "Zapsat sérii 1 cviku 1 a předat Davidovi",
      exact: true,
    })
    .click();
  await expect(weights(b).nth(0)).toHaveValue("20");
  await expect(reps(b).nth(0)).toHaveValue("10");
  // A legacy draft exists without an outbox, as in older application versions.
  await b.evaluate(() => {
    const drafts = JSON.parse(localStorage.getItem("fitlog-online-history")!);
    const d = structuredClone(drafts.find((w: Workout) => w.user === "David"));
    d.entries[0].sets[2] = { weight: "22,5", reps: "7" };
    localStorage.setItem("fitlog-online-drafts", JSON.stringify([d]));
  });
  await b.reload();
  await expect
    .poll(() => records.find((w) => w.user === "David")?.entries[0].sets[2])
    .toEqual({ weight: "22,5", reps: "7" });
  await expect
    .poll(() =>
      b.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
      ),
    )
    .toEqual({});
  await pc.close();
  await phone.close();
});
