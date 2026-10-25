import { expect, test } from "@playwright/test";
import { seedExercises } from "../src/domain";

test("z nabídky otevře knihovní formulář, předvyplní partii a vybere cvik oběma", async ({
  page,
}) => {
  await page.goto("/");
  const selects = page.locator(".exercise-name select");
  // Other exercises' results must not be touched by the new selection.
  await page.locator("#set-1-0 input[inputmode=decimal]").fill("25");
  await page.locator("#set-1-0 input[inputmode=numeric]").fill("8");
  await selects.nth(0).selectOption("__add_exercise__");
  const form = page.locator("form.modal");
  await expect(form.getByRole("heading")).toHaveText("Nový cvik");
  await expect(form.getByRole("combobox")).toHaveValue("Prsa");
  await form.getByLabel("Název", { exact: true }).fill("Nový tlak z tréninku");
  await form
    .getByLabel("Poznámka", { exact: true })
    .fill("Založeno přímo při tréninku");
  await form.getByRole("button", { name: "Uložit cvik", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(selects.nth(0).locator("option:checked")).toHaveText(
    "Nový tlak z tréninku",
  );
  await expect(page.locator("#set-1-0 input[inputmode=decimal]")).toHaveValue(
    "25",
  );
  await page
    .locator(".person-switch button")
    .filter({ hasText: "David" })
    .click();
  await expect(selects.nth(0)).toBeDisabled();
  await expect(selects.nth(0).locator("option:checked")).toHaveText(
    "Nový tlak z tréninku",
  );
  await page.getByRole("button", { name: "Cviky", exact: true }).click();
  await expect(
    page.locator(".library-card").filter({ hasText: "Nový tlak z tréninku" }),
  ).toBeVisible();
});

test("zrušení formuláře nemění cvik a další založení z knihovny nepoužije starou kartu", async ({
  page,
}) => {
  await page.goto("/");
  const select = page.getByLabel("Cvik 1", { exact: true });
  const original = await select.inputValue();
  await select.selectOption("__add_exercise__");
  await page
    .locator("form.modal")
    .getByRole("button", { name: "Zavřít", exact: true })
    .click();
  await expect(select).toHaveValue(original);
  await page.getByRole("button", { name: "Cviky", exact: true }).click();
  await page.getByRole("button", { name: "Přidat cvik", exact: true }).click();
  const form = page.locator("form.modal");
  await form.getByLabel("Název", { exact: true }).fill("Pouze v knihovně");
  await form.getByRole("button", { name: "Uložit cvik", exact: true }).click();
  await page.getByRole("button", { name: "Trénink", exact: true }).click();
  await expect(select).toHaveValue(original);
});

test("změna partie ve formuláři uloží do knihovny bez dosazení špatné partie do plánu", async ({
  page,
}) => {
  await page.goto("/");
  const select = page.getByLabel("Cvik 1", { exact: true });
  const original = await select.inputValue();
  await select.selectOption("__add_exercise__");
  const form = page.locator("form.modal");
  await form.getByLabel("Název", { exact: true }).fill("Nový biceps");
  await form.getByRole("combobox").selectOption("Biceps");
  await form.getByRole("button", { name: "Uložit cvik", exact: true }).click();
  await expect(select).toHaveValue(original);
  await page.getByRole("button", { name: "Cviky", exact: true }).click();
  await expect(
    page.locator(".library-card").filter({ hasText: "Nový biceps" }),
  ).toBeVisible();
});

test("chyba uložení zachová formulář a umožní opakovat bez změny původního cviku", async ({
  page,
}) => {
  await page.route(/\/src\/storage\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
  export const supabase=null;
  export function read(k,f){return JSON.parse(localStorage.getItem(k)||'null')??f;}
  export function persist(k,v){localStorage.setItem(k,JSON.stringify(v));}
  export async function loadRemote(){} export async function savePatch(){} export async function saveRemote(){} export async function finishRemote(){}
  export async function saveExercise(e){if(!window.allowExerciseSave)throw Error('Síť nedostupná');return e;}
 `,
    }),
  );
  await page.goto("/");
  const select = page.getByLabel("Cvik 1", { exact: true });
  const original = await select.inputValue();
  await select.selectOption("__add_exercise__");
  const form = page.locator("form.modal");
  await form
    .getByLabel("Název", { exact: true })
    .fill("Cvik po obnovení spojení");
  await form.getByRole("button", { name: "Uložit cvik", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Cvik nebyl uložen" }),
  ).toBeVisible();
  await expect(form.getByLabel("Název", { exact: true })).toHaveValue(
    "Cvik po obnovení spojení",
  );
  await expect(select).toHaveValue(original);
  await page.evaluate(() => {
    (window as any).allowExerciseSave = true;
  });
  await form.getByRole("button", { name: "Uložit cvik", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(select.locator("option:checked")).toHaveText(
    "Cvik po obnovení spojení",
  );
});

test("nový biceps se vybere i v online tréninku, který má zatím jen prázdný záznam", async ({
  page,
}) => {
  await page.route(/\/src\/storage\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
  const exercises=${JSON.stringify(seedExercises)};
  const records=[{id:'placeholder',round:'shared-placeholder',day:1,user:'Honza',date:'2026-10-25',completed:false,entries:[]}];
  export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'honza'}}}}),getUser:async()=>({data:{user:{id:'honza'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
  export function read(k,f){return JSON.parse(localStorage.getItem(k)||'null')??f;}
  export function persist(k,v){localStorage.setItem(k,JSON.stringify(v));}
  export async function loadRemote(){return {profiles:[{id:'honza',auth_user_id:'honza',name:'Honza'},{id:'david',auth_user_id:null,name:'David'}],exercises:structuredClone(exercises),workouts:structuredClone(records),cycle:{day:1,round_id:'shared-placeholder'}};}
  export async function savePatch(job){records[0]=structuredClone(job.workout);return job.workout.id;}
  export async function saveExercise(e){exercises.push(e);return e;}
  export async function saveRemote(){} export async function finishRemote(){}
 `,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".editing-banner strong")).toHaveText("Honza");
  const select = page.getByLabel("Cvik 4", { exact: true });
  await select.selectOption("__add_exercise__");
  const form = page.locator("form.modal");
  await expect(form.getByRole("combobox")).toHaveValue("Biceps");
  await form
    .getByLabel("Název", { exact: true })
    .fill("Nový biceps v rozepsaném tréninku");
  await form.getByRole("button", { name: "Uložit cvik", exact: true }).click();
  await expect(select.locator("option:checked")).toHaveText(
    "Nový biceps v rozepsaném tréninku",
  );
  await expect(page.locator(".sync-status")).toHaveText("Uloženo online");
});
