const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

test.describe('Phase 2 redesign system views', () => {
  test('activity, notifications, settings, and admin use the warm system shells', async ({ authedPage: page }) => {
    await navigateTo(page, 'Activity');
    await expect(page.locator('.activity-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.activity-page-icon')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigateTo(page, 'Notifications');
    await expect(page.locator('.notifications-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.notifications-page-icon')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigateTo(page, 'Settings');
    await expect(page.locator('.settings-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.settings-page-icon')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await navigateTo(page, 'Admin');
    await expect(page.locator('.admin-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.admin-page-icon')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
