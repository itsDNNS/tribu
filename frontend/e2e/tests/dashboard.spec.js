const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedTask } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Dashboard', () => {
  test('shows greeting with username', async ({ authedPage: page, testUser }) => {
    const greeting = page.locator('.view-title');
    await expect(greeting).toBeVisible({ timeout: 10000 });
    await expect(greeting).toContainText(testUser.displayName);
  });

  test('quick-action pills navigate to correct views', async ({ authedPage: page }) => {
    const quickActions = page.getByRole('group', { name: 'Quick actions' });
    await quickActions.waitFor({ timeout: 10000 });

    // Event → Calendar
    await page.getByTestId('quick-action-event').click();
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard
    await navigateTo(page, 'Home');
    await page.getByRole('group', { name: 'Quick actions' }).waitFor({ timeout: 10000 });

    // Task → Tasks
    await page.getByTestId('quick-action-task').click();
    await expect(page.locator('.tasks-filter-tabs')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard
    await navigateTo(page, 'Home');
    await page.getByRole('group', { name: 'Quick actions' }).waitFor({ timeout: 10000 });

    // Invite → Admin
    await page.getByTestId('quick-action-invite').click();
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible({ timeout: 10000 });
  });

  test('shows household activity from recent task changes', async ({ authedPage: page, apiCtx, testUser }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, {
      title: 'E2E Activity Task',
      description: 'private detail should stay out of the dashboard feed',
    });

    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 15000 });

    const activityCard = page.getByRole('region', { name: 'Recent activity' });
    await expect(activityCard).toBeVisible({ timeout: 10000 });
    await expect(activityCard).toContainText(`${testUser.displayName} created task "E2E Activity Task"`, { timeout: 10000 });
    await expect(activityCard).not.toContainText('private detail');
  });
});
