const { test, expect } = require('../helpers/fixtures');

test.describe('Navigation UI', () => {
  test('desktop sidebar changes views', async ({ authedPage: page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width <= 768, 'Desktop-only sidebar navigation check');

    const sidebarNav = page.locator('.nav-groups');
    await sidebarNav.locator('.nav-item', { hasText: 'Calendar' }).click();
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });
    await expect(sidebarNav.locator('.nav-item.active')).toContainText('Calendar');

    await sidebarNav.locator('.nav-item', { hasText: 'Dashboard' }).click();
    await expect(page.getByRole('region', { name: 'Quick capture' })).toBeVisible({ timeout: 10000 });
    await expect(sidebarNav.locator('.nav-item.active')).toContainText('Dashboard');
  });

  test('mobile bottom nav and menu change views', async ({ authedPage: page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width > 768, 'Mobile-only navigation check');

    const bottomNav = page.locator('.bottom-nav');
    await bottomNav.locator('.bottom-nav-item', { hasText: 'Plan' }).click();
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });
    await expect(bottomNav.locator('.bottom-nav-item.active')).toContainText('Plan');

    await page.getByRole('button', { name: 'Open menu' }).click();
    const sidebar = page.locator('.sidebar.mobile-open');
    await expect(sidebar).toBeVisible();

    await sidebar.locator('.nav-item', { hasText: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 });
    await expect(sidebar).toBeHidden();
  });
});
