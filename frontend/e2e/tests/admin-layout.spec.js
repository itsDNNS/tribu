const { test, expect } = require("@playwright/test");
const { mockAdmin } = require("../helpers/admin-visual");
test.use({
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
  serviceWorkers: "block",
});
async function open(page, options) {
  const api = await mockAdmin(page, options);
  await page.goto("/#admin");
  await expect(
    page.getByRole("heading", { name: "Familie verwalten" }),
  ).toBeVisible();
  return api;
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
for (const width of [320, 390, 768, 1024, 1448])
  test(`admin layout at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.setViewportSize({ width, height: 1053 });
    await open(page);
    await expect(page.locator(".ad-metric").nth(2)).toContainText("1");
    await expect(page.locator(".ad-member")).toHaveCount(4);
    await noOverflow(page);
    if ([390, 1448].includes(width))
      await page.screenshot({
        path: test.info().outputPath(`admin-${width}.png`),
        fullPage: true,
        animations: "disabled",
        style: "nextjs-portal{display:none}",
      });
    const tabs = page.getByRole("navigation", { name: "Admin-Bereiche" });
    for (const name of [
      "Einladungen",
      "Displays",
      "Single Sign-On",
      "Backups",
      "Audit Log",
    ]) {
      await tabs.getByRole("button", { name, exact: true }).click();
      await expect(page.locator(".admin-subpage")).toBeVisible();
      if (name === "Single Sign-On")
        await expect(page.getByTestId("sso-admin-section")).toBeVisible();
      await noOverflow(page);
    }
    expect(errors).toEqual([]);
  });
test("search, profile filters, time format and roles guide", async ({
  page,
}) => {
  const api = await open(page);
  await page
    .getByRole("searchbox", { name: "Mitglied finden …" })
    .fill("Demo C");
  await expect(page.locator(".ad-member")).toHaveCount(1);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Kinder", exact: true }).click();
  await expect(page.locator(".ad-member")).toHaveCount(2);
  await page.getByRole("button", { name: "12 Stunden" }).click();
  await expect(page.locator(".ad-time-example")).toContainText("2:30 PM");
  expect(api.writes.some((r) => r.body?.time_format === "12h")).toBe(true);
  await page
    .getByRole("button", { name: "Rollen und Schutzregeln ansehen" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Kinder haben ihren Platz.",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("profile editor preserves draft on resize and confirms permission changes", async ({
  page,
}) => {
  const api = await open(page);
  await page
    .getByRole("button", { name: "Profil von Demo C bearbeiten" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Rolle", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Familienprofil").selectOption("adult");
  await dialog
    .getByRole("combobox", { name: "Rolle", exact: true })
    .selectOption("admin");
  await expect(
    dialog.getByRole("button", { name: "Speichern", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    dialog.getByRole("combobox", { name: "Rolle", exact: true }),
  ).toHaveValue("admin");
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Speichern", exact: true }),
  ).toBeInViewport();
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.members.find((m) => m.user_id === 3)).toMatchObject({
    is_adult: true,
    role: "admin",
  });
  await page
    .getByRole("button", { name: "Profil von Demo A bearbeiten" })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Familienprofil"),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Rolle", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Mitglied entfernen" }),
  ).toHaveCount(0);
});
test("failed member save keeps the draft and reports an error", async ({
  page,
}) => {
  await open(page, { failSave: true });
  await page
    .getByRole("button", { name: "Mitglied hinzufügen", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Anzeigename", { exact: true }).fill("Demo E");
  await dialog
    .getByLabel("E-Mail", { exact: true })
    .fill("demo-e@example.test");
  await dialog
    .getByRole("button", { name: "Mitglied hinzufügen", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Demo save failed");
  await expect(dialog.getByLabel("Anzeigename", { exact: true })).toHaveValue(
    "Demo E",
  );
});
test("invitation header opens the real form and prevents child admin invitations", async ({
  page,
}) => {
  const api = await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Einladen", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", {
      name: "Rolle für neues Mitglied",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", {
      name: "Einladungslink erstellen",
      exact: true,
    }),
  ).toBeInViewport();
  await dialog
    .getByRole("button", { name: "Einladungslink erstellen", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    api.writes.find((r) => r.path.endsWith("/invitations")).body,
  ).toMatchObject({ role_preset: "member", is_adult_preset: false });
  await expect(page.locator(".token-display")).toContainText(
    "https://example.test/invite/DEMO",
  );
});
test("display editor uses a mobile sheet and saves server configuration", async ({
  page,
}) => {
  const api = await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Admin-Bereiche" })
    .getByRole("button", { name: "Displays", exact: true })
    .click();
  await page.getByTestId("display-config-toggle-1").click();
  await page.getByTestId("display-mode-select").selectOption("eink");
  await expect(page.getByTestId("display-save-config")).toBeInViewport();
  await page.getByTestId("display-save-config").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    api.writes.find(
      (r) => r.method === "PATCH" && r.path.includes("display-devices"),
    ).body.display_mode,
  ).toBe("eink");
});

test("display editor configures rotating areas and the weather place", async ({
  page,
}) => {
  const api = await open(page);
  await page
    .getByRole("navigation", { name: "Admin-Bereiche" })
    .getByRole("button", { name: "Displays", exact: true })
    .click();
  await page.getByTestId("display-weather-choose").click();
  await page.getByTestId("display-weather-query").fill("Hamb");
  await page.getByTestId("display-weather-search").click();
  await page.getByRole("button", { name: /Hamburg/ }).first().click();
  await expect(page.getByTestId("display-weather-place")).toContainText("Hamburg");

  await page.getByTestId("display-config-toggle-1").click();
  const zoneB = page.getByTestId("display-zone-editor-b");
  await zoneB.getByRole("combobox", { name: /Karte hinzufügen/ }).selectOption("stars");
  await page.getByTestId("display-zone-interval-b").selectOption("120");
  await page.getByTestId("display-save-config").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const patch = api.writes.find((r) => r.method === "PATCH" && r.path.includes("display-devices")).body;
  expect(patch.layout_config.zones.b).toEqual({ cards: ["reminders", "school", "stars"], interval_seconds: 120 });
  expect(api.writes.find((r) => r.method === "PUT" && r.path.includes("weather-location")).body).toMatchObject({ name: "Hamburg", latitude: 53.55 });
});

test("dark admin sheets preserve focus, draft and reachable actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await page
    .getByRole("button", { name: "Profil von Demo B bearbeiten" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Speichern", exact: true }),
  ).toBeInViewport();
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Speichern", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("admin-dialog-dark.png"),
    animations: "disabled",
    style: "nextjs-portal{display:none}",
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Profil von Demo B bearbeiten" }),
  ).toBeFocused();
});
test("returning to invitations does not reopen a previously dismissed form", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Einladen", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Abbrechen" })
    .click();
  const nav = page.getByRole("navigation", { name: "Admin-Bereiche" });
  await nav.getByRole("button", { name: "Mitglieder", exact: true }).click();
  await nav.getByRole("button", { name: "Einladungen", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
