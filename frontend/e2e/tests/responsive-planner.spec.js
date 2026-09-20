const { test, expect } = require("@playwright/test");
const { mockResponsivePlanner } = require("../helpers/responsive-planner");
test.use({
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
  serviceWorkers: "block",
});
async function open(page, options) {
  const api = await mockResponsivePlanner(page, options);
  await page.goto("/#calendar");
  await expect(
    page.getByRole("heading", { name: "Alles im Blick." }),
  ).toBeVisible();
  return api;
}
const shot = async (page, name) =>
  page.screenshot({
    path: test.info().outputPath(name),
    animations: "disabled",
    style: "nextjs-portal{display:none}",
    fullPage: false,
  });
for (const width of [320, 390, 680, 768, 820, 1024, 1448])
  test(`calendar layouts at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: width===390?1000:width>=800?1090:844 });
    await open(page);
    await expect
      .poll(() =>
        page
          .locator(".ui-planner")
          .evaluate(
            (el) =>
              el.getAttribute("data-density") ===
              (el.getBoundingClientRect().width < 800 ? "compact" : "wide"),
          ),
      )
      .toBe(true);
    const compact =
      (await page.locator(".ui-planner").getAttribute("data-density")) ===
      "compact";
    if (compact) {
      await expect(page.locator(".ui-weekday")).toHaveCount(7);
      await expect(page.locator(".ui-month-grid")).toBeVisible();
      await expect(
        page.locator(".ui-agenda").getByText("Demo-Termin C", { exact: true }),
      ).toBeVisible();
    } else await expect(page.locator(".tc-calendar-day")).toHaveCount(35);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1448)
      await shot(page, `calendar-${width}.png`);
    if(width===390)await page.setViewportSize({width,height:844});
    await page.getByRole("button", { name: "Woche", exact: true }).click();
    if (compact) {
      await expect(page.locator(".ui-day-strip button")).toHaveCount(7);
      await expect(
        page.getByRole("button", { name: "Ein Tag", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      if (width === 390) await shot(page, "week-390.png");
      await page
        .getByRole("button", { name: "Ganze Woche", exact: true })
        .click();
      await expect(page.locator(".ui-agenda-day")).toHaveCount(7);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
test("selected date, family colors, responsive form state and saved details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await open(page);
  await page.locator('.ui-day-button[data-date="2026-09-22"]').click();
  await expect(page.locator(".ui-agenda")).toContainText("Demo-Termin E");
  await page
    .getByRole("combobox", { name: "Familienfilter" })
    .selectOption("2");
  await expect(page.locator(".ui-agenda")).not.toContainText("Demo-Termin E");
  await page.getByRole("combobox", { name: "Familienfilter" }).selectOption("");
  await page.locator('.ui-day-button[data-date="2026-09-21"]').click();
  expect(
    await page
      .locator(".ui-event-card")
      .first()
      .evaluate((el) => el.style.getPropertyValue("--event-color")),
  ).toBe("#79529e");
  await page.locator(".ui-agenda-head").getByRole("button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("input[type=date]").first()).toHaveValue(
    "2026-09-21",
  );
  await dialog.getByRole("textbox").first().fill("Bleibt beim Drehen");
  await page.setViewportSize({ width: 1448, height: 1000 });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox").first()).toHaveValue(
    "Bleibt beim Drehen",
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(dialog.getByRole("textbox").first()).toHaveValue(
    "Bleibt beim Drehen",
  );
  const save = dialog.getByRole("button", { name: "Speichern", exact: true });
  await expect(save).toBeInViewport();
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(
    api.events.find((e) => e.title === "Bleibt beim Drehen").starts_at,
  ).toContain("2026-09-21");
});
test("agenda requests more dates; mobile shell exposes quick capture and navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await open(page);
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByRole("button", { name: "Weitere 14 Tage laden" }).click();
  await expect
    .poll(
      () =>
        api.requests.filter((r) => r.path === "/calendar/events").at(-1).query,
    )
    .toContain("2026-10-18");
  await page
    .locator(".ui-bottom-nav")
    .getByRole("button", { name: "Neu", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kalender", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").locator("input[type=date]").first(),
  ).toHaveValue("2026-09-21");
  await page.keyboard.press("Escape");
  await page
    .locator(".ui-bottom-nav")
    .getByRole("button", { name: "Mehr", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Einstellungen", exact: true }),
  ).toBeVisible();
});
test("meal and weekly planners share day/week controls; a meal can move by date", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await open(page);
  await page.goto("/#meal_plans");
  await expect(page.locator(".ui-day-strip")).toBeVisible();
  await page.locator(".ui-strip-day").filter({ hasText: /19/ }).click();
  await page.getByRole("button", { name: /Demo-Mahlzeit/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=date]").fill("2026-09-20");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.meals[0].plan_date).toBe("2026-09-20");
  await page.goto("/#weekly_plan");
  await expect(page.locator(".ui-day-strip")).toBeVisible();
  await page.getByRole("button", { name: "Ganze Woche", exact: true }).click();
  await expect(page.locator(".ui-agenda-day")).toHaveCount(7);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("date jump, keyboard navigation and sidebar resize retain the selected day", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await open(page);
  await expect(page.locator(".ui-month-grid")).toBeVisible();
  await page
    .getByRole("button", { name: "Datum auswählen", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Datum auswählen", { exact: true })
    .fill("2026-10-31");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Speichern", exact: true })
    .click();
  await page.locator('[data-date="2026-10-31"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-date="2026-11-01"]')).toBeFocused();
  await page.setViewportSize({ width: 1448, height: 900 });
  await expect(
    page.locator(".tc-calendar-day.selected .tc-day-number"),
  ).toHaveText("1");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ui-day-cell.selected .ui-day-number")).toHaveText(
    "1",
  );
  await page.getByRole("button", { name: "Woche", exact: true }).click();
  await expect(page.locator(".ui-strip-day.selected strong")).toHaveText("1");
});
test("compact editing and dark sheets retain family colors and reachable actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await open(page);
  await page
    .locator(".ui-event-content")
    .filter({ hasText: "Demo-Termin C" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bearbeiten", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("Demo-Termin bearbeitet");
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await expect(
    dialog.getByRole("button", { name: "Speichern", exact: true }),
  ).toBeInViewport();
  await shot(page, "event-sheet-dark.png");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator(".ui-agenda")).toContainText("Demo-Termin bearbeitet");
  expect(
    api.events.find((e) => e.title === "Demo-Termin bearbeitet").assigned_to,
  ).toEqual([2]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("children retain read-only compact planning and cannot open quick creation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { child: true });
  await expect(
    page
      .locator(".ui-bottom-nav")
      .getByRole("button", { name: "Neu", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".tc-view-header .primary")).toHaveCount(0);
  await page
    .locator(".ui-event-content")
    .filter({ hasText: "Demo-Termin C" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Bearbeiten", exact: true }),
  ).toHaveCount(0);
});
test("mobile task and contact sheets keep save actions visible with a scrolling form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page);
  await page.goto('/#tasks');
  await page.getByRole('button',{name:'Aufgabe bearbeiten: Demo-Aufgabe'}).click();
  const taskDialog=page.getByRole('dialog');
  await expect(taskDialog.locator('button[type=submit]')).toBeInViewport();
  await taskDialog.getByRole('textbox',{name:'Titel'}).fill('Ranzen und Sporttasche');
  await page.setViewportSize({width:1448,height:1000});
  await expect(taskDialog.getByRole('textbox',{name:'Titel'})).toHaveValue('Ranzen und Sporttasche');
  await page.keyboard.press('Escape');await page.setViewportSize({width:320,height:568});
  await page.goto("/#contacts");
  await page
    .getByRole("button", { name: /Kontakt hinzuf|Neuer Kontakt/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("button[type=submit]")).toBeInViewport();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.keyboard.press("Escape");
});
