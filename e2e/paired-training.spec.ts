import { expect, test } from "@playwright/test";
import { seedExercises, selected, type Workout } from "../src/domain";

const makeWorkout = (user: "Honza" | "David", completed = false): Workout => ({
  id: user,
  user,
  round: "paired",
  day: 1,
  date: "2026-11-13",
  completed,
  entries: selected(1, seedExercises).map((exerciseId) => ({
    exerciseId,
    sets: [0, 1, 2].map(() => ({
      weight: completed ? "40" : "",
      reps: completed ? "8" : "",
    })),
  })),
});

test("společné zobrazení rozliší jména i barvy a vejde se na PC i do telefonu", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".person-switch")).toHaveCount(0);
  await expect(page.locator(".exercise-card")).toHaveCount(8);
  await expect(page.locator(".exercise-name select")).toHaveCount(8);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 920 });
    const h = page.locator("#set-Honza-0-0"),
      d = page.locator("#set-David-0-0");
    await expect(h.locator("legend")).toContainText("Honza");
    await expect(d.locator("legend")).toContainText("David");
    const hb = (await h.boundingBox())!,
      db = (await d.boundingBox())!;
    if (width > 650) expect(db.x).toBeGreaterThan(hb.x);
    else expect(db.y).toBeGreaterThan(hb.y);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const colours = await page
      .locator(".paired-series")
      .first()
      .locator("fieldset")
      .evaluateAll((nodes) =>
        nodes.map((n) => getComputedStyle(n).borderTopColor),
      );
    expect(colours[0]).not.toBe(colours[1]);
  }
  await page.locator("#set-David-0-0 input").first().fill("25");
  await expect(page.locator("#set-Honza-0-0 input").first()).toHaveValue("");
  await expect(page.getByLabel("Cvik 1", { exact: true })).toBeDisabled();
  await expect(page.locator("#set-Honza-0-0")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".exercise-card")
    .first()
    .screenshot({ path: "/tmp/fitlog-paired-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".paired-series")
    .first()
    .screenshot({ path: "/tmp/fitlog-paired-mobile.png" });
});

test("dokončený Honza zůstane viditelný a zamčený, David pokračuje vlastní druhou sérií", async ({
  page,
}) => {
  await page.addInitScript(
    (history) => {
      localStorage.setItem("fitlog-demo-history", JSON.stringify(history));
      localStorage.setItem(
        "fitlog-demo-cycle",
        JSON.stringify({ round: "paired", day: 1 }),
      );
    },
    [makeWorkout("Honza", true), makeWorkout("David")],
  );
  await page.goto("/");
  const h = page.locator("#set-Honza-0-0"),
    d = page.locator("#set-David-0-0");
  await expect(h.locator("input").first()).toBeDisabled();
  await expect(h.locator("input").first()).toHaveValue("40");
  await expect(
    page.getByRole("button", { name: "Honza · dokončeno", exact: true }),
  ).toBeDisabled();
  await d.locator("input[inputmode=decimal]").fill("20");
  await d.locator("input[inputmode=numeric]").fill("10");
  await expect(h.locator(".previous")).toHaveText("Minule: —");
  await d.locator("button").click();
  await expect(page.locator("#set-David-0-1")).toHaveClass(/active-set/);
  await expect(h.locator("input").first()).toHaveValue("40");
  await page.reload();
  await expect(d.locator("input").first()).toHaveValue("20");
  await expect(h.locator("input").first()).toBeDisabled();
});

test("starší rozdílné cviky se na společné stránce nepřejmenují ani nepřepíší", async ({
  page,
}) => {
  const h = makeWorkout("Honza"),
    d = makeWorkout("David");
  const alternate = seedExercises.find(
    (e) => e.muscle === "Prsa" && e.id !== h.entries[0].exerciseId,
  )!;
  // Move the other exercise out of its former slot, retaining a distinct filled old record.
  d.entries[0] = {
    exerciseId: alternate.id,
    sets: [0, 1, 2].map(() => ({ weight: "17", reps: "9" })),
  };
  await page.addInitScript(
    (history) => {
      localStorage.setItem("fitlog-demo-history", JSON.stringify(history));
      localStorage.setItem(
        "fitlog-demo-cycle",
        JSON.stringify({ round: "paired", day: 1 }),
      );
    },
    [h, d],
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Davidův starší zápis");
  await expect(page.locator("#set-David-0-0 .participant-exercise")).toHaveText(
    alternate.name,
  );
  await expect(page.locator("#set-David-0-0 input").first()).toHaveValue("17");
  await expect(page.locator("#set-David-0-0 input").first()).toBeDisabled();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fitlog-demo-history")!),
  );
  expect(
    saved.find((w: Workout) => w.user === "David").entries[0].exerciseId,
  ).toBe(alternate.id);
});

test("přidání společného cviku funguje i když předtím zapisoval David", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#set-David-1-0 input").first().fill("22");
  await page
    .getByLabel("Cvik 1", { exact: true })
    .selectOption("__add_exercise__");
  await page
    .locator("form.modal")
    .getByLabel("Název", { exact: true })
    .fill("Společný nový tlak");
  await page
    .locator("form.modal")
    .getByRole("button", { name: "Uložit cvik", exact: true })
    .click();
  for (const person of ["Honza", "David"])
    await expect(
      page.locator(`#set-${person}-0-0 .participant-exercise`),
    ).toHaveText("Společný nový tlak");
  await expect(page.locator("#set-David-1-0 input").first()).toHaveValue("22");
});
