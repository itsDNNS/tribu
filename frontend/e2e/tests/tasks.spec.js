const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedTask, completeTask } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Tasks', () => {
  test('create a task via quick-add', async ({ authedPage: page }) => {
    await navigateTo(page, 'Tasks');
    await page.locator('.tasks-filter-tabs').waitFor({ timeout: 10000 });

    await page.locator('.quick-add-input').first().fill('E2E Quick Task');
    await page.locator('[aria-label="Add task"]').click();

    await expect(page.getByText('E2E Quick Task')).toBeVisible({ timeout: 10000 });
  });

  test('toggle a task open → done', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, { title: 'Toggle Me' });

    // Navigate to tasks — the view fetches fresh data from API
    await navigateTo(page, 'Tasks');
    await page.locator('.tasks-filter-tabs').waitFor({ timeout: 10000 });

    // If the task isn't visible yet, reload to pick up seeded data
    const checkbox = page.locator('[role="checkbox"][aria-label="Mark task: Toggle Me"]');
    if (!await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.reload();
      await page.locator('#main-content').waitFor({ timeout: 10000 });
      await navigateTo(page, 'Tasks');
      await page.locator('.tasks-filter-tabs').waitFor({ timeout: 10000 });
    }

    // Switch to "All" tab so the task stays visible after toggling to done
    await page.locator('.tasks-filter-btn', { hasText: 'All' }).click();

    await expect(checkbox).toBeVisible({ timeout: 10000 });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
  });

  test('delete a task', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, { title: 'Delete This Task' });

    await navigateTo(page, 'Tasks');
    await page.locator('.tasks-filter-tabs').waitFor({ timeout: 10000 });

    if (!await page.getByText('Delete This Task').isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.reload();
      await page.locator('#main-content').waitFor({ timeout: 10000 });
      await navigateTo(page, 'Tasks');
      await page.locator('.tasks-filter-tabs').waitFor({ timeout: 10000 });
    }

    await expect(page.getByText('Delete This Task')).toBeVisible({ timeout: 10000 });
    await page.locator('[aria-label="Delete task: Delete This Task"]').click();
    await expect(page.getByText('Delete This Task')).not.toBeVisible({ timeout: 10000 });
  });

  test('filter tabs work (All / Open / Done)', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, { title: 'Still Open' });
    const doneTask = await seedTask(apiCtx, familyId, { title: 'Already Done' });
    await completeTask(apiCtx, doneTask.id);

    await navigateTo(page, 'Tasks');
    await page.locator('.tasks-filter-tabs').waitFor({ timeout: 10000 });

    if (!await page.getByText('Still Open').isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.reload();
      await page.locator('#main-content').waitFor({ timeout: 10000 });
      await navigateTo(page, 'Tasks');
      await page.locator('.tasks-filter-tabs').waitFor({ timeout: 10000 });
    }

    // "All" tab — wait for both tasks to confirm data is loaded
    await page.locator('.tasks-filter-btn', { hasText: 'All' }).click();
    await expect(page.getByText('Still Open')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Already Done')).toBeVisible({ timeout: 5000 });

    // "Open" tab
    await page.locator('.tasks-filter-btn', { hasText: 'Open' }).click();
    await expect(page.getByText('Still Open')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Already Done')).not.toBeVisible({ timeout: 3000 });

    // "Done" tab
    await page.locator('.tasks-filter-btn', { hasText: 'Done' }).click();
    await expect(page.getByText('Already Done')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Still Open')).not.toBeVisible({ timeout: 3000 });
  });
});
