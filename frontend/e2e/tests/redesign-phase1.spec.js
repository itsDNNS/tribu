const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe('Phase 1 redesign views', () => {
  test('recipes, templates, contacts, and school timetables show a plain title', async ({ authedPage: page }) => {
    await navigateTo(page, 'Recipes');
    await expect(page.locator('.recipes-page')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Recipes', level: 1 })).toBeVisible();
    await expect(page.locator('.recipes-page-icon')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await navigateTo(page, 'Templates');
    await expect(page.locator('.templates-view')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigateTo(page, 'Contacts');
    await expect(page.locator('.contacts-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.contacts-tab-toggle')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigateTo(page, 'School timetables');
    await expect(page.locator('.school-timetables-view')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'School timetables', level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
