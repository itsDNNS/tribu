const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

function wall(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`;
}

test.describe('Family hub', () => {
  test('shows everyone\'s day, birthdays with gift ideas and opens a person\'s day', async ({ authedPage: page, apiCtx, testUser }) => {
    const familyId = await getFamilyId(apiCtx);
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    await seedCalendarEvent(apiCtx, familyId, {
      title: 'E2E Family Picnic',
      starts_at: wall(today),
      ends_at: wall(tomorrow),
      all_day: true,
    });
    const birthday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5);
    const res = await apiCtx.post('/api/birthdays', {
      data: { family_id: familyId, person_name: 'Grandpa E2E', month: birthday.getMonth() + 1, day: birthday.getDate() },
    });
    expect(res.ok()).toBeTruthy();

    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 15000 });
    await navigateTo(page, 'Family');

    const name = testUser.displayName.split(' ')[0];
    const card = page.getByRole('button', { name: `See ${name}'s day` });
    // The worker's user shares its family with other specs: the picnic is
    // either next or among the further events of the day.
    await expect(card).toContainText(/E2E Family Picnic|and \d+ more/, { timeout: 10000 });
    await expect(card).not.toContainText('Nothing else today');

    const birthdays = page.getByRole('region', { name: 'Birthdays' });
    await expect(birthdays).toContainText('Grandpa E2E');
    await expect(birthdays).toContainText('in 5 days');
    await birthdays.getByRole('button', { name: 'Note an idea' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByLabel('Or name (grandma, colleague...)')).toHaveValue('Grandpa E2E');
    await dialog.getByPlaceholder('What should be gifted?').fill('Garden gloves');
    await dialog.getByRole('button', { name: 'Add gift', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    await navigateTo(page, 'Family');
    await expect(page.getByRole('region', { name: 'Birthdays' }).getByRole('button', { name: '1 gift idea' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: `See ${name}'s day` }).click();
    await expect(page.locator('#main-content').getByRole('region', { name: 'Today' })).toBeVisible({ timeout: 10000 });
  });

  test('is the first page of Family and holds the activity history', async ({ authedPage: page }) => {
    await navigateTo(page, 'Activity');
    await expect(page.getByRole('heading', { name: 'Activity history', level: 1 })).toBeVisible({ timeout: 10000 });
    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 768) {
      const pages = page.getByRole('navigation', { name: 'Pages in Family' });
      await expect(pages.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
      await expect(pages.getByRole('button', { name: /Activit/ })).toHaveCount(0);
      await expect(page.locator('.ui-bottom-nav').getByRole('button', { name: 'Family', exact: true })).toHaveAttribute('aria-current', 'page');
    } else {
      const family = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('region', { name: 'Family' });
      await expect(family.getByRole('button').first()).toHaveText('Overview');
      await expect(family.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    }
  });
});
