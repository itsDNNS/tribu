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

  test('a duty can take turns every other week', async ({ authedPage: page, testUser }) => {
    await openDuties(page);
    await page.getByRole('button', { name: 'New duty' }).click();
    const dialog = page.getByRole('dialog', { name: 'New duty' });
    await dialog.getByLabel('What needs doing').fill('Cook dinner');
    await dialog.getByRole('checkbox', { name: 'Take turns every other week' }).check();
    await expect(dialog.getByLabel('This week is')).toHaveValue('a');
    for (const day of WEEKDAYS) {
      await dialog.getByRole('checkbox', { name: day }).check();
      await dialog.getByLabel(`Who does it on ${day} (Week A)`).selectOption({ label: testUser.displayName });
    }
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByRole('region', { name: 'All duties' })).toContainText(`${testUser.displayName}/Nobody`);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    await expect(page.getByRole('button', { name: `Change Cook dinner on ${today}` })).toContainText(testUser.displayName);

    // Next week is week B, where nobody is set.
    await page.getByRole('button', { name: 'Next week' }).click();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const sameDayNextWeek = nextWeek.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    await expect(page.getByRole('button', { name: `Change Cook dinner on ${sameDayNextWeek}` })).toContainText('Nobody');
  });

  test('a weekday can have its own time', async ({ authedPage: page, testUser }) => {
    await openDuties(page);
    await page.getByRole('button', { name: 'New duty' }).click();
    const dialog = page.getByRole('dialog', { name: 'New duty' });
    await dialog.getByLabel('What needs doing').fill('School pickup');
    await dialog.getByLabel('Time', { exact: true }).fill('15:30');
    for (const day of ['Monday', 'Wednesday']) {
      await dialog.getByRole('checkbox', { name: day }).check();
      await dialog.getByLabel(`Who does it on ${day}`).selectOption({ label: testUser.displayName });
    }
    await dialog.getByRole('button', { name: 'Time on Wednesday: 15:30' }).click();
    await dialog.getByLabel('Time on Wednesday').fill('12:00');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByRole('region', { name: 'All duties' })).toContainText(`Mon ${testUser.displayName} · Wed 12:00 ${testUser.displayName}`);
    // Next week's Wednesday is ahead on any day this test runs.
    await page.getByRole('button', { name: 'Next week' }).click();
    const wednesday = page.getByRole('button', { name: /^Change School pickup on Wednesday/ });
    await expect(wednesday).toContainText('12:00');

    // Opening the duty again shows the Wednesday time and the usual time for Monday.
    await page.getByRole('button', { name: 'Edit School pickup' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit duty' });
    await expect(edit.getByLabel('Time on Wednesday')).toHaveValue('12:00');
    await expect(edit.getByRole('button', { name: 'Time on Monday: 15:30' })).toBeVisible();
  });

  test('a duty can pause for a while and come back', async ({ authedPage: page, testUser }) => {
    await openDuties(page);
    await page.getByRole('button', { name: 'New duty' }).click();
    const dialog = page.getByRole('dialog', { name: 'New duty' });
    await dialog.getByLabel('What needs doing').fill('Feed the cat');
    for (const day of WEEKDAYS) {
      await dialog.getByRole('checkbox', { name: day }).check();
      await dialog.getByLabel(`Who does it on ${day}`).selectOption({ label: testUser.displayName });
    }
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.getByRole('button', { name: 'Pause Feed the cat' }).click();
    const pause = page.getByRole('dialog', { name: 'Pause Feed the cat' });
    await pause.getByLabel('From').fill(iso(new Date()));
    await pause.getByLabel('To').fill(iso(tomorrow));
    await pause.getByRole('button', { name: 'Save' }).click();
    await expect(pause).toHaveCount(0);

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    const todayEntry = page.getByRole('button', { name: `Change Feed the cat on ${today}` });
    await expect(todayEntry).toContainText('Paused');
    const endPause = page.getByRole('button', { name: /^End pause / });
    await expect(endPause).toBeVisible();

    await navigateTo(page, 'Tasks');
    const todayTask = page.getByRole('region', { name: 'Today' }).locator('.task-row-shell', { hasText: 'Feed the cat' });
    await expect(todayTask).toHaveCount(0, { timeout: 10000 });

    await openDuties(page);
    await endPause.click();
    await expect(endPause).toHaveCount(0);
    await expect(todayEntry).toContainText(testUser.displayName);
    await navigateTo(page, 'Tasks');
    await expect(todayTask).toHaveCount(1, { timeout: 10000 });
  });
});
