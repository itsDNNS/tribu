const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Calendar', () => {
  test('navigate to calendar and see month view', async ({ authedPage: page }) => {
    await navigateTo(page, 'Calendar');
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });
  });

  test('create and view an event', async ({ authedPage: page }) => {
    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    // Click on day 15
    await page.locator('.calendar-day:not(.other-month)', { hasText: /^15$/ }).first().click();

    // Fill event title in the form that appears
    const titleInput = page.locator('input[placeholder="New event..."]');
    await titleInput.waitFor({ timeout: 5000 });
    await titleInput.fill('E2E Test Event');

    // Submit
    await page.locator('button[type="submit"]').first().click();

    // Event should appear
    await expect(page.getByText('E2E Test Event')).toBeVisible({ timeout: 10000 });
  });

  test('delete an event', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);

    // Seed event on the 20th of the current month
    const now = new Date();
    const eventDate = new Date(now.getFullYear(), now.getMonth(), 20, 14, 0, 0);
    await seedCalendarEvent(apiCtx, familyId, {
      title: 'Delete Me',
      starts_at: eventDate.toISOString(),
    });

    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    // Click on day 20
    await page.locator('.calendar-day:not(.other-month)', { hasText: /^20$/ }).first().click();

    // Wait for event to appear
    await expect(page.getByText('Delete Me')).toBeVisible({ timeout: 10000 });

    // Delete it
    await page.locator('[aria-label="Delete event: Delete Me"]').click();
    await expect(page.getByText('Delete Me')).not.toBeVisible({ timeout: 10000 });
  });

  test('navigate months forward and back', async ({ authedPage: page }) => {
    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    const monthLabel = page.locator('.calendar-month-label');
    const currentMonth = await monthLabel.textContent();

    // Next month
    await page.locator('[aria-label="Next month"]').click();
    await expect(monthLabel).not.toHaveText(currentMonth, { timeout: 5000 });

    // Previous month
    await page.locator('[aria-label="Previous month"]').click();
    await expect(monthLabel).toHaveText(currentMonth, { timeout: 5000 });
  });
});
