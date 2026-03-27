const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test.describe('Dashboard', () => {
  test('shows greeting with username', async ({ authedPage: page, testUser }) => {
    const greeting = page.locator('.view-title');
    await expect(greeting).toBeVisible({ timeout: 10000 });
    await expect(greeting).toContainText(testUser.displayName);
  });

  test('quick-action buttons navigate to correct views', async ({ authedPage: page }) => {
    await page.locator('.dashboard-header-actions').waitFor({ timeout: 10000 });

    // Event → Calendar (icon button with aria-label)
    await page.locator('.dashboard-header-actions .btn-icon').first().click();
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard
    await navigateTo(page, 'Home');
    await page.locator('.dashboard-header-actions').waitFor({ timeout: 10000 });

    // Task → Tasks (second icon button)
    await page.locator('.dashboard-header-actions .btn-icon').nth(1).click();
    await expect(page.locator('.tasks-filter-tabs')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard
    await navigateTo(page, 'Home');
    await page.locator('.dashboard-header-actions').waitFor({ timeout: 10000 });

    // Contact → Contacts (third icon button)
    await page.locator('.dashboard-header-actions .btn-icon').nth(2).click();
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 10000 });
  });
});
