import { test, expect } from "@playwright/test";
import { seedExercises } from "../src/domain";
test("online zapojení fronty odesílá série obou profilů a obnoví offline zápis", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Řízený transport ověřuje UI bez skutečných uživatelských hesel.
  // SQL transakce a oprávnění samostatně ověřuje live-database.test.ts.
  await page.route(/\/src\/storage\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
 const clone=x=>structuredClone(x);const records=[];window.fitlogTestWrites=[];window.fitlogTestAccount="honza-account";window.fitlogDavidLinked=false;window.fitlogDavidProfileExists=true;
 export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'honza-account'}}}}),getUser:async()=>({data:{user:{id:window.fitlogTestAccount}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({}),signInWithPassword:async()=>({error:null})}};
 export function read(key,fallback){return JSON.parse(localStorage.getItem(key)||'null')??fallback;}
 export function persist(key,value){localStorage.setItem(key,JSON.stringify(value));}
 export async function loadRemote(){return {profiles:[{id:'honza-account',auth_user_id:'honza-account',name:'Honza'},{id:'david-profile',auth_user_id:window.fitlogDavidLinked?'david-account':null,name:'David'}].filter(p=>p.name==='Honza'||window.fitlogDavidProfileExists),exercises:${JSON.stringify(seedExercises)},workouts:clone(records),cycle:{day:1,round_id:'shared-online-round'}};}
 export async function savePatch(job){if(!navigator.onLine)throw Error('Offline');window.fitlogTestWrites.push(clone(job));let w=records.find(w=>w.user===job.workout.user&&w.round===job.workout.round);if(!w){w=clone(job.workout);records.push(w);}for(const c of job.changes)w.entries[c.position].sets[c.ordinal-1]={weight:c.weight,reps:c.reps};return w.id;}
 export async function saveRemote(){} export async function finishRemote(){} export async function saveExercise(e){return e;}
 `,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".editing-banner strong")).toHaveText("Honza");
  const weights = page.locator("input[inputmode=decimal]"),
    reps = page.locator("input[inputmode=numeric]");
  await weights.nth(0).fill("12,5");
  await reps.nth(0).fill("10");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
      ),
    )
    .toEqual({});
  await expect
    .poll(() => page.evaluate(() => (window as any).fitlogTestWrites.length))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", {
      name: "Zapsat sérii 1 cviku 1 a předat Davidovi",
      exact: true,
    })
    .click();
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await weights.nth(0).fill("20");
  await reps.nth(0).fill("8");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).fitlogTestWrites.some(
          (j: any) => j.workout.user === "David",
        ),
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", {
      name: "Zapsat sérii 1 cviku 1 a předat Honzovi",
      exact: true,
    })
    .click();
  await expect(weights.nth(0)).toHaveValue("12,5");
  await context.setOffline(true);
  await weights.nth(1).fill("15");
  await reps.nth(1).fill("9");
  await expect(page.locator(".sync-status")).toContainText("telefonu");
  await context.setOffline(false);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).fitlogTestWrites.some((j: any) =>
          j.changes.some(
            (c: any) => c.ordinal === 2 && c.weight === "15" && c.reps === "9",
          ),
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
      ),
    )
    .toEqual({});
  await page.getByRole("button", { name: "D David" }).click();
  await expect(weights.nth(0)).toHaveValue("20");
  await page.evaluate(() => {
    (window as any).fitlogTestAccount = "david-account";
    (window as any).fitlogDavidLinked = true;
  });
  await page
    .getByRole("button", { name: "Nastavení", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Obnovit online data" }).click();
  await page.getByRole("button", { name: "Zavřít", exact: true }).click();
  await expect(page.locator(".header-right .avatar")).toHaveText("D");
  await page.getByRole("button", { name: "H Honza" }).click();
  await expect(weights.nth(0)).toHaveValue("12,5");
  // Ani starší databáze bez Davidova profilu nesmí otevírat Nastavení.
  await page.evaluate(() => {
    (window as any).fitlogTestAccount = "honza-account";
    (window as any).fitlogDavidProfileExists = false;
  });
  await page
    .getByRole("button", { name: "Nastavení", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Obnovit online data" }).click();
  await page.getByRole("button", { name: "Zavřít", exact: true }).click();
  await page.getByRole("button", { name: "D David" }).click();
  await expect(page.locator(".editing-banner strong")).toHaveText("David");
  await expect(page.locator(".modal-backdrop")).toHaveCount(0);
  await weights.nth(1).fill("25");
  await reps.nth(1).fill("6");
  await expect(page.locator(".sync-status")).toContainText("telefonu");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(
          JSON.parse(localStorage.getItem("fitlog-online-outbox") || "{}"),
        ).some((j: any) => j.workout.user === "David"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "H Honza" }).click();
  await expect(weights.nth(0)).toHaveValue("12,5");
  await expect(page.locator(".modal-backdrop")).toHaveCount(0);
  expect(errors).toEqual([]);
});
