const { test, expect } = require('../helpers/fixtures');

test.describe('Navigation UI', () => {
  test('desktop sidebar changes views', async ({ authedPage: page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width <= 768, 'Desktop-only sidebar navigation check');

    const sidebarNav = page.locator('.nav-groups');
    await sidebarNav.locator('.nav-item', { hasText: 'Calendar' }).click();
    await expect(page.locator('.tc-calendar-grid, .ui-month-grid')).toBeVisible({ timeout: 10000 });
    await expect(sidebarNav.locator('.nav-item.active')).toContainText('Calendar');

    await sidebarNav.locator('.nav-item', { hasText: 'Dashboard' }).click();
    await expect(page.getByRole('region', { name: 'Quick capture' })).toBeVisible({ timeout: 10000 });
    await expect(sidebarNav.locator('.nav-item.active')).toContainText('Dashboard');
  });

  test('mobile bottom nav and menu change views', async ({ authedPage: page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width > 768, 'Mobile-only navigation check');

    const bottomNav = page.locator('.bottom-nav');
    await bottomNav.getByRole('button', {name:'Calendar',exact:true}).click();
    await expect(page.locator('.tc-calendar-grid, .ui-month-grid')).toBeVisible({ timeout: 10000 });
    await expect(bottomNav.locator('.ui-nav-button.active')).toContainText('Calendar');

    await page.getByRole('button', { name: 'Open menu' }).click();
    const sidebar = page.getByRole('dialog');
    await expect(sidebar).toBeVisible();

    await sidebar.getByRole('button',{name:'Settings',exact:true}).click();
    await expect(page.getByRole('heading', { name: 'Just the way you like it.' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ms-card')).toHaveCount(4);
    await expect(sidebar).toBeHidden();
  });
});
