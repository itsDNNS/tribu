const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test.describe('Dashboard', () => {
  test('shows greeting with username', async ({ authedPage: page, testUser }) => {
    const greeting = page.locator('.bento-welcome h2');
    await expect(greeting).toBeVisible({ timeout: 10000 });
    await expect(greeting).toContainText(testUser.displayName);
  });

  test('quick-action buttons navigate to correct views', async ({ authedPage: page }) => {
    await page.locator('.bento-welcome').waitFor({ timeout: 10000 });

    // Event → Calendar
    await page.locator('.bento-welcome .btn-ghost', { hasText: 'Event' }).click();
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard — on mobile, bottom-nav uses "Home" not "Dashboard"
    await navigateTo(page, 'Home');
    await page.locator('.bento-welcome').waitFor({ timeout: 10000 });

    // Task → Tasks
    await page.locator('.bento-welcome .btn-ghost', { hasText: 'Task' }).click();
    await expect(page.locator('.tasks-filter-tabs')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard
    await navigateTo(page, 'Home');
    await page.locator('.bento-welcome').waitFor({ timeout: 10000 });

    // Contact → Contacts
    await page.locator('.bento-welcome .btn-ghost', { hasText: 'Contact' }).click();
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 10000 });
  });
});
