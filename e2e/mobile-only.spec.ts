import { test, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { PendingSave } from "../src/autosave";

test("telefon sám: obnova prvního načtení, společné cviky, David první a offline fronta", async ({
  browser,
}) => {
  const db = new PGlite();
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    await db.exec(
      `create role authenticated;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);`,
    );
    for (const file of ["001_fitlog.sql", "004_live_sets.sql"])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    const account = "10000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users values($1)", [account]);
    await db.query("insert into profiles values($1,'Honza')", [account]);
    for (const file of [
      "005_profiles_without_login.sql",
      "008_shared_exercises.sql",
    ])
      await db.exec(readFileSync("supabase/" + file, "utf8"));
    await db.exec(
      "insert into exercises(id,name,muscle) values('alternate','Jiný tlak','Prsa');grant usage on schema auth to authenticated;set role authenticated;",
    );
    await db.query("select set_config('test.uid',$1,false)", [account]);
    let failedReads = 1;
    await phone.exposeFunction("mobileLoad", async () => {
      if (failedReads-- > 0)
        throw Error("Dočasně nedostupná síť při prvním otevření");
      const profiles = (await db.query("select * from profiles")).rows;
      const exercises = (
        await db.query(
          "select * from exercises where id<>'alternate' order by id",
        )
      ).rows;
      exercises.push(
        ...(await db.query("select * from exercises where id='alternate'"))
          .rows,
      );
      const workouts = [];
      for (const row of (
        await db.query<any>(
          "select w.*,p.name from workouts w join profiles p on p.id=w.user_id",
        )
      ).rows) {
        const entries = [];
        for (const e of (
          await db.query<any>(
            "select * from workout_exercises where workout_id=$1 order by position",
            [row.id],
          )
        ).rows) {
          const sets = (
            await db.query<any>(
              "select weight,reps from sets where workout_exercise_id=$1 order by ordinal",
              [e.id],
            )
          ).rows.map((s) => ({
            weight: s.weight === null ? "" : String(s.weight),
            reps: s.reps === null ? "" : String(s.reps),
          }));
          entries.push({ exerciseId: e.exercise_id, sets });
        }
        workouts.push({
          id: row.id,
          round: row.round_id,
          day: row.day,
          date: new Date(row.started_at).toISOString(),
          user: row.name,
          completed: row.completed,
          entries,
        });
      }
      return {
        profiles,
        exercises,
        workouts,
        cycle: (await db.query("select * from cycle")).rows[0],
      };
    });
    await phone.exposeFunction(
      "mobileSave",
      async ({ job, plan }: { job: PendingSave; plan: string[] }) => {
        const result = await db.query<any>(
          "select save_workout_patch($1::jsonb,$2::jsonb) as id",
          [
            JSON.stringify({ ...job.workout, honzaPlan: plan }),
            JSON.stringify(job.changes),
          ],
        );
        return result.rows[0].id;
      },
    );
    await phone.route(/\/src\/storage\.ts(?:\?.*)?$/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
      export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'${account}'}}}}),getUser:async()=>({data:{user:{id:'${account}'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
      export function read(k,f){return JSON.parse(localStorage.getItem(k)||'null')??f;}
      export function persist(k,v){localStorage.setItem(k,JSON.stringify(v));}
      export const loadRemote=()=>window.mobileLoad();
      export const savePatch=(job,plan)=>window.mobileSave({job,plan});
      export async function saveRemote(){} export async function finishRemote(){} export async function saveExercise(e){return e;}
    `,
      }),
    );
    const page = await phone.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator(".editing-banner strong")).toHaveText("Honza");
    await page
      .locator(".person-switch button")
      .filter({ hasText: "David" })
      .click();
    await expect(page.getByLabel("Cvik 1", { exact: true })).toBeDisabled();
    const weights = page.locator("input[inputmode=decimal]"),
      reps = page.locator("input[inputmode=numeric]");
    await weights.nth(0).fill("20");
    await reps.nth(0).fill("10");
    const result = async () =>
      (
        await db.query<any>(
          "select p.name,e.position,e.exercise_id,s.weight,s.reps from workouts w join profiles p on p.id=w.user_id join workout_exercises e on e.workout_id=w.id join sets s on s.workout_exercise_id=e.id where ordinal=1 order by p.name,e.position",
        )
      ).rows;
    await expect
      .poll(async () =>
        (await result()).find((r) => r.name === "David" && r.position === 0),
      )
      .toMatchObject({ weight: "20.00", reps: 10 });
    await expect(page.locator(".sync-status")).toHaveText("Uloženo online");
    expect(
      (await result()).find((r) => r.name === "Honza" && r.position === 0),
    ).toMatchObject({ weight: null, reps: null });
    await page
      .locator(".person-switch button")
      .filter({ hasText: "Honza" })
      .click();
    await page.getByLabel("Cvik 2", { exact: true }).selectOption("alternate");
    await expect
      .poll(async () =>
        (await result())
          .filter((r) => r.position === 1)
          .map((r) => r.exercise_id),
      )
      .toEqual(["alternate", "alternate"]);
    await page
      .locator(".person-switch button")
      .filter({ hasText: "David" })
      .click();
    await expect(page.getByLabel("Cvik 2", { exact: true })).toHaveValue(
      "alternate",
    );
    await expect(page.getByLabel("Cvik 2", { exact: true })).toBeDisabled();
    await phone.setOffline(true);
    await weights.nth(3).fill("25");
    await reps.nth(3).fill("8");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Object.keys(
              JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
            ).length,
        ),
      )
      .toBeGreaterThan(0);
    await phone.setOffline(false);
    await expect
      .poll(async () =>
        (await result()).find((r) => r.name === "David" && r.position === 1),
      )
      .toMatchObject({ weight: "25.00", reps: 8 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
        ),
      )
      .toEqual({});
    expect(errors).toEqual([]);
  } finally {
    await phone.close();
    await db.close();
  }
});
