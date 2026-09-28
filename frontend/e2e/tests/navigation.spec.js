const { test, expect } = require('../helpers/fixtures');

test.describe('Navigation UI', () => {
  test('desktop sidebar changes views', async ({ authedPage: page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width <= 768, 'Desktop-only sidebar navigation check');

    const sidebarNav = page.locator('.nav-groups');
    await sidebarNav.locator('.nav-item', { hasText: 'Calendar' }).click();
    await expect(page.locator('.tc-calendar-grid, .ui-month-grid')).toBeVisible({ timeout: 10000 });
    await expect(sidebarNav.locator('.nav-item.active')).toContainText('Calendar');

    await sidebarNav.locator('.nav-item', { hasText: 'Today' }).click();
    await expect(page.locator('#main-content').getByRole('region', { name: 'Today' })).toBeVisible({ timeout: 10000 });
    await expect(sidebarNav.locator('.nav-item.active')).toContainText('Today');
    // Settings and admin sit in the account menu, not in the sidebar.
    await expect(sidebarNav).not.toContainText('Settings');
  });

  test('mobile tabs, page chips and the account menu change views', async ({ authedPage: page }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width > 768, 'Mobile-only navigation check');

    const bottomNav = page.locator('.bottom-nav');
    await bottomNav.getByRole('button', { name: 'Plan', exact: true }).click();
    // Phones open the calendar on the agenda under the week strip.
    await expect(page.locator('.ui-day-strip')).toBeVisible({ timeout: 10000 });
    await expect(bottomNav.locator('.ui-nav-button.active')).toContainText('Plan');
    await expect(page.locator('.app-header-title')).toHaveText('Plan');

    const pages = page.getByRole('navigation', { name: 'Pages in Plan' });
    await pages.getByRole('button', { name: 'Meal plan' }).click();
    await expect(pages.getByRole('button', { name: 'Meal plan' })).toHaveAttribute('aria-current', 'page');

    // Today, then Plan again: the page used last opens.
    await bottomNav.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('#main-content').getByRole('region', { name: 'Today' })).toBeVisible();
    await bottomNav.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(pages.getByRole('button', { name: 'Meal plan' })).toHaveAttribute('aria-current', 'page');

    await page.locator('.app-header').getByRole('button', { name: 'Account and settings', exact: true }).click();
    const menu = page.getByRole('dialog');
    await menu.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeAttached({ timeout: 10000 });
    await expect(page.locator('.ms-card')).toHaveCount(4);
    await expect(menu).toBeHidden();
  });
});
