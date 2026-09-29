const { test, expect } = require('../helpers/fixtures');
const { getFamilyId } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

// Tribu 2.0: the timetable page shows the plan first; the editor opens
// behind "Edit" and goes away again on save or cancel.
test('the timetable comes first, editing is one tap away', async ({ authedPage: page, apiCtx }) => {
  const familyId = await getFamilyId(apiCtx);
  const created = await apiCtx.post('/api/school-timetables', {
    data: {
      family_id: familyId,
      name: 'E2E class 3a',
      class_label: '3a',
      include_saturday: false,
      assigned_member_user_ids: [],
      periods: [
        { position: 1, label: '1', start_time: '08:00', end_time: '08:45', kind: 'lesson' },
        { position: 2, label: '2', start_time: '08:45', end_time: '09:00', kind: 'break', break_label: 'Break' },
        { position: 3, label: '3', start_time: '09:00', end_time: '09:45', kind: 'lesson' },
      ],
      lessons: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, period_position: 1, subject: 'E2E Maths' })),
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const timetable = await created.json();
  try {
    await page.reload();
    await navigateTo(page, 'School timetables');
    await expect(page.locator('.school-view')).toBeVisible({ timeout: 10000 });
    // With several plans, chips pick one; a single plan shows right away.
    const chip = page.locator('.school-plan-picker').getByRole('button', { name: 'E2E class 3a' });
    if (await chip.count()) await chip.click();
    await expect(page.locator('.school-view')).toContainText('E2E class 3a', { timeout: 10000 });
    await expect(page.locator('.school-view').getByText('E2E Maths').locator('visible=true').first()).toBeVisible();
    // No form until someone edits.
    await expect(page.locator('.school-editor-card')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit timetable' })).toBeVisible();
    await page.locator('.school-editor-card').getByLabel('Class').fill('3b');
    await page.getByRole('button', { name: 'Save timetable' }).click();

    await expect(page.locator('.school-editor-card')).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator('.school-view-class')).toHaveText('3b');
  } finally {
    await apiCtx.delete(`/api/school-timetables/${timetable.id}`);
  }
});
