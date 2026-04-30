const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedTask } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Dashboard', () => {
  test('shows greeting with username', async ({ authedPage: page, testUser }) => {
    const greeting = page.locator('.view-title');
    await expect(greeting).toBeVisible({ timeout: 10000 });
    await expect(greeting).toContainText(testUser.displayName);
  });

  test('keeps duplicate summary counts out of the dashboard header', async ({ authedPage: page }) => {
    await expect(page.getByRole('group', { name: 'Quick actions' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('group', { name: 'Family at a glance' })).toHaveCount(0);
    await expect(page.getByTestId('hero-chip-members')).toHaveCount(0);
    await expect(page.getByTestId('hero-chip-events')).toHaveCount(0);
    await expect(page.getByTestId('hero-chip-tasks')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Next events' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Open tasks' })).toBeVisible();
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

    // Weekly plan → print-ready weekly view
    await page.getByTestId('quick-action-weekly-plan').click();
    await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Print' })).toHaveClass(/no-print/);
    await expect(page.getByRole('group', { name: 'Filters' })).toHaveClass(/no-print/);
    await expect(page.getByRole('region', { name: 'Events' })).toBeVisible();

    // Back to Dashboard
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByRole('group', { name: 'Quick actions' }).waitFor({ timeout: 10000 });

    // Invite → Admin
    await page.getByTestId('quick-action-invite').click();
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible({ timeout: 10000 });
  });

  test('daily check-in tiles navigate without separate pill buttons', async ({ authedPage: page }) => {
    const dailyLoop = page.getByRole('region', { name: 'Today in motion' });
    await expect(dailyLoop).toBeVisible({ timeout: 10000 });
    await expect(dailyLoop.locator('.daily-loop-action')).toHaveCount(0);

    await dailyLoop.getByRole('button', { name: 'Plan meals' }).click();
    await expect(page.getByRole('heading', { name: 'Meal plan' })).toBeVisible({ timeout: 10000 });

    await navigateTo(page, 'Home');
    await page.getByRole('region', { name: 'Today in motion' }).waitFor({ timeout: 10000 });
    await page.getByRole('region', { name: 'Today in motion' }).getByRole('button', { name: 'Open shopping' }).click();
    await expect(page.locator('.shopping-lists-panel')).toBeVisible({ timeout: 10000 });

    await navigateTo(page, 'Home');
    await page.getByRole('region', { name: 'Today in motion' }).waitFor({ timeout: 10000 });
    await page.getByRole('region', { name: 'Today in motion' }).getByRole('button', { name: 'Open routines' }).click();
    await expect(page.locator('.tasks-filter-tabs')).toBeVisible({ timeout: 10000 });
  });

  test('shows and dismisses the first-week setup checklist', async ({ authedPage: page }) => {
    const checklist = page.getByRole('region', { name: 'Set up your first week' });
    await expect(checklist).toBeVisible({ timeout: 10000 });
    await expect(checklist).toContainText('Invite your family');
    await expect(checklist).toContainText('Create a shared shopping list');
    await checklist.getByRole('button', { name: 'Hide for later' }).click();
    await expect(checklist).not.toBeVisible({ timeout: 10000 });
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

  test('captures a quick note and triages it from the dashboard inbox', async ({ authedPage: page }) => {
    const quickCapture = page.getByRole('region', { name: 'Quick capture' });
    await expect(quickCapture).toBeVisible({ timeout: 10000 });

    await quickCapture.getByPlaceholder('Note an event, task, or shopping thought…').fill('Buy apples from market');
    await quickCapture.getByRole('button', { name: 'Save to inbox' }).click();

    await expect(quickCapture).toContainText('Buy apples from market', { timeout: 10000 });
    await quickCapture.locator('.quick-capture-item-actions').getByRole('button', { name: 'Shopping' }).click();
    await expect(quickCapture).not.toContainText('Buy apples from market', { timeout: 10000 });
  });

  test('customizes dashboard module order and keeps it after reload', async ({ authedPage: page }) => {
    const tasksModule = page.locator('[data-dashboard-module="tasks"]');
    const eventsModule = page.locator('[data-dashboard-module="events"]');
    await expect(tasksModule).toBeVisible({ timeout: 10000 });
    await expect(eventsModule).toHaveCSS('order', '2');
    await expect(tasksModule).toHaveCSS('order', '3');

    await page.getByRole('button', { name: 'Customize layout' }).click();
    await page.getByRole('button', { name: 'Move Open tasks up' }).click();

    await expect(tasksModule).toHaveCSS('order', '2');
    await expect(eventsModule).toHaveCSS('order', '3');

    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 15000 });
    await expect(page.locator('[data-dashboard-module="tasks"]')).toHaveCSS('order', '2');
    await expect(page.locator('[data-dashboard-module="events"]')).toHaveCSS('order', '3');

    await page.getByRole('button', { name: 'Customize layout' }).click();
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await expect(page.locator('[data-dashboard-module="events"]')).toHaveCSS('order', '2');
    await expect(page.locator('[data-dashboard-module="tasks"]')).toHaveCSS('order', '3');
  });
});
