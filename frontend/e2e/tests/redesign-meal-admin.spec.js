const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe('Meal plan and admin redesign surfaces', () => {
  test('meal plan and admin subpages use the warm redesigned shells', async ({ authedPage: page }) => {
    await navigateTo(page, 'Meal plan');
    await expect(page.locator('.meal-plans-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.meal-plan-page-icon')).toBeVisible();
    await expect(page.locator('.meal-plan-week-summary')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigateTo(page, 'Admin');
    await expect(page.locator('.admin-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.admin-page-icon')).toBeVisible();

    await page.getByRole('button', { name: /Invitations|Einladungen/ }).click();
    await expect(page.locator('.admin-subpage-invites')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.admin-subpage-invites .admin-subpage-icon')).toBeVisible();

    await page.getByRole('button', { name: /Displays|Anzeige|Display/ }).click();
    await expect(page.locator('.admin-subpage-displays')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.admin-subpage-displays .admin-subpage-icon')).toBeVisible();

    await page.getByRole('button', { name: /Backups|Sicherungen/ }).click();
    await expect(page.locator('.admin-subpage-backups')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.admin-subpage-backups .admin-subpage-icon')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
