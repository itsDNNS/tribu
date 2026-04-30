const { test, expect } = require('../helpers/fixtures');
const { getFamilyId } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

async function seedContact(request, familyId, fullName, month, day) {
  const res = await request.post('/api/contacts', {
    data: {
      family_id: familyId,
      full_name: fullName,
      birthday_month: month,
      birthday_day: day,
    },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/contacts failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

async function openCalendarDay(page, day) {
  const calendarDay = page.locator('.calendar-day:not(.other-month)', { hasText: new RegExp(`^${day}$`) }).first();
  await calendarDay.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }));
  await calendarDay.focus();
  await page.keyboard.press('Enter');
}

test.describe('Birthday identity regression', () => {
  test('calendar keeps duplicate-name contact birthdays separate and tracks rename/delete correctly', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const name = `E2E Twin ${Date.now()}`;
    const month = new Date().getMonth() + 1;
    const day = 3;

    const first = await seedContact(apiCtx, familyId, name, month, day);
    const second = await seedContact(apiCtx, familyId, name, month, day);

    await page.reload();
    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
    await openCalendarDay(page, day);

    await expect(page.locator('.day-detail-events .event-card-title', { hasText: name })).toHaveCount(2);

    const renamed = `Renamed Twin ${Date.now()}`;
    const renameRes = await apiCtx.patch(`/api/contacts/${second.id}`, {
      data: { full_name: renamed },
    });
    expect(renameRes.ok()).toBeTruthy();

    await page.reload();
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
    await openCalendarDay(page, day);

    await expect(page.locator('.day-detail-events .event-card-title', { hasText: name })).toHaveCount(1);
    await expect(page.locator('.day-detail-events .event-card-title', { hasText: renamed })).toHaveCount(1);

    const deleteRes = await apiCtx.delete(`/api/contacts/${first.id}`);
    expect(deleteRes.ok()).toBeTruthy();

    await page.reload();
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
    await openCalendarDay(page, day);

    await expect(page.locator('.day-detail-events .event-card-title', { hasText: name })).toHaveCount(0);
    await expect(page.locator('.day-detail-events .event-card-title', { hasText: renamed })).toHaveCount(1);
  });
});
