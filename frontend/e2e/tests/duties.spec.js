const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function openDuties(page) {
  await navigateTo(page, 'Tasks');
  await page.getByRole('heading', { name: 'Tasks', level: 1 }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Weekly duties' }).click();
  await page.getByRole('heading', { name: 'Weekly duties', level: 1 }).waitFor({ timeout: 10000 });
}

test.describe('Weekly duties', () => {
  test('a duty creates assigned tasks, and one date can be skipped and given back', async ({ authedPage: page, testUser }) => {
    await openDuties(page);
    await page.getByRole('button', { name: 'New duty' }).click();
    const dialog = page.getByRole('dialog', { name: 'New duty' });
    await dialog.getByLabel('What needs doing').fill('Water the plants');
    for (const day of WEEKDAYS) {
      await dialog.getByRole('checkbox', { name: day }).check();
      await dialog.getByLabel(`Who does it on ${day}`).selectOption({ label: testUser.displayName });
    }
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    const todayRegion = page.getByRole('region', { name: today });
    const todayEntry = todayRegion.getByRole('button', { name: `Change Water the plants on ${today}` });
    await expect(todayEntry).toContainText(testUser.displayName);
    await expect(page.getByRole('region', { name: 'All duties' }).getByText('Water the plants')).toBeVisible();

    // Today's task is already there, marked as a weekly duty; so are the
    // other six days of the coming week.
    await navigateTo(page, 'Tasks');
    const todayTask = page.getByRole('region', { name: 'Today' }).locator('.task-row-shell', { hasText: 'Water the plants' });
    await expect(todayTask).toHaveCount(1, { timeout: 10000 });
    await expect(todayTask).toContainText('Weekly duty');
    await expect(page.locator('.task-row-shell', { hasText: 'Water the plants' })).toHaveCount(7);

    await openDuties(page);
    await todayEntry.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Skip this date' }).click();
    await expect(todayEntry).toContainText('Skipped');
    await navigateTo(page, 'Tasks');
    await expect(page.locator('.task-row-shell', { hasText: 'Water the plants' })).toHaveCount(6, { timeout: 10000 });
    await expect(todayTask).toHaveCount(0);

    await openDuties(page);
    await todayEntry.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Back to the usual person' }).click();
    await expect(todayEntry).toContainText(testUser.displayName);
    await expect(todayEntry).not.toContainText('Skipped');
    await navigateTo(page, 'Tasks');
    await expect(todayTask).toHaveCount(1, { timeout: 10000 });
  });
});
