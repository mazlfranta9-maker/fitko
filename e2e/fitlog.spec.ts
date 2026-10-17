import { test, expect } from "@playwright/test";
test("mobilní zápis, obnovení, dokončení a sdílený cyklus", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dnes je den pro progres." }),
  ).toBeVisible();
  await expect(page.locator(".exercise-card")).toHaveCount(8);
  await expect(page.locator(".muscle-label")).toHaveText([
    "Prsa",
    "Prsa",
    "Prsa",
    "Biceps",
    "Biceps",
    "Biceps",
    "Předloktí",
    "Břicho",
  ]);
  expect(await page.locator("body").evaluate((e) => e.scrollWidth)).toBe(390);
  const weights = page.locator(".set-row input[inputmode=decimal]");
  const reps = page.locator(".set-row input[inputmode=numeric]");
  for (let i = 0; i < 24; i++) {
    await weights.nth(i).fill("12,5");
    await reps.nth(i).fill("10");
  }
  await page.reload();
  await expect(weights.first()).toHaveValue("12,5");
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Dokončit trénink", exact: true })
    .click();
  await expect(page.locator(".day-display strong")).toContainText("02");
  await page.getByRole("button", { name: "D David" }).click();
  await expect(page.locator(".day-display strong")).toContainText("01");
  for (let i = 0; i < 24; i++) {
    await weights.nth(i).fill("15");
    await reps.nth(i).fill("9");
  }
  await page
    .getByRole("button", { name: "Dokončit trénink", exact: true })
    .click();
  await expect(page.locator(".day-display strong")).toContainText("02");
  await page.getByRole("button", { name: "Historie", exact: true }).click();
  await expect(page.locator(".history-card").first()).toContainText("David");
  await page.getByRole("button", { name: "Cviky", exact: true }).click();
  await page.getByRole("button", { name: "Přidat cvik" }).click();
  await page.getByLabel("Název", { exact: true }).fill("Testovací tlak");
  await page.getByRole("button", { name: "Uložit cvik" }).click();
  await expect(
    page.getByRole("heading", { name: "Testovací tlak" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Progres", exact: true }).click();
  await expect(page.locator(".progress-card")).toHaveCount(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "/tmp/fitlog-mobile.png", fullPage: true });
});
test("desktopový přehled a mobilní zobrazení bez přetečení", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await expect(page.locator(".workout-hero")).toBeVisible();
  await page.screenshot({ path: "/tmp/fitlog-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.locator("body").evaluate((e) => e.scrollWidth)).toBe(360);
  await page.screenshot({
    path: "/tmp/fitlog-training-mobile.png",
    fullPage: true,
  });
});
test("nabídka je nahoře i při posunu a správa připraví propojení Davida", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.locator("nav");
  expect((await nav.boundingBox())!.y).toBeLessThan(80);
  await page.evaluate(() => window.scrollTo(0, 900));
  expect((await nav.boundingBox())!.y).toBeLessThan(80);
  await page.getByRole("button", { name: "Historie", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page
    .getByRole("button", { name: "Nastavení", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByText("Správa aplikace a přidání Davida", { exact: true })
    .click();
  await page.getByLabel("Davidův e-mail").fill("david@example.com");
  await page
    .getByRole("button", { name: "Připravit propojení Davida" })
    .click();
  await expect(page.getByLabel("SQL pro propojení Davida")).toHaveValue(
    /david@example.com/,
  );
  await expect(page.getByLabel("SQL pro propojení Davida")).toHaveValue(
    /INSERT INTO public.profiles/,
  );
});
