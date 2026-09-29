const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedTask, completeTask } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

// The undo window (hooks/useTasks.js) before a completion or deletion is sent.
const UNDO_WINDOW_MS = 6000;

async function openTasks(page, expectedTitle) {
  await navigateTo(page, 'Tasks');
  await page.getByRole('heading', { name: 'Tasks', level: 1 }).waitFor({ timeout: 10000 });
  if (expectedTitle && !await page.getByText(expectedTitle).isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 10000 });
    await navigateTo(page, 'Tasks');
    await page.getByRole('heading', { name: 'Tasks', level: 1 }).waitFor({ timeout: 10000 });
  }
}

function isoDaysFromNow(days, hour = 18) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00:00`;
}

test.describe('Tasks', () => {
  test('create a task from the New task dialog', async ({ authedPage: page }) => {
    await openTasks(page);
    await page.getByRole('button', { name: 'New task' }).click();
    const dialog = page.getByRole('dialog', { name: 'New task' });
    await dialog.getByLabel('Title').fill('E2E Dialog Task');
    await dialog.getByRole('button', { name: 'Create task' }).click();

    await expect(page.getByText('E2E Dialog Task')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.quick-add-input')).toHaveCount(0);
  });

  test('groups open tasks by due date and folds done ones away', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, { title: 'Was due yesterday', due_date: isoDaysFromNow(-1) });
    await seedTask(apiCtx, familyId, { title: 'Due in three days', due_date: isoDaysFromNow(3) });
    await seedTask(apiCtx, familyId, { title: 'Whenever' });
    const done = await seedTask(apiCtx, familyId, { title: 'Finished already' });
    await completeTask(apiCtx, done.id);

    await openTasks(page, 'Whenever');
    await expect(page.getByRole('region', { name: 'Overdue' }).getByText('Was due yesterday')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('region', { name: 'Upcoming' }).getByText('Due in three days')).toBeVisible();
    await expect(page.getByRole('region', { name: 'No date' }).getByText('Whenever')).toBeVisible();
    await expect(page.getByText('Finished already')).toHaveCount(0);

    await page.getByRole('region', { name: 'Done' }).getByRole('button', { name: /Done/ }).click();
    await expect(page.getByText('Finished already')).toBeVisible();
  });

  test('completing a task can be undone and is sent after the undo window', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, { title: 'Undo Me' });
    await seedTask(apiCtx, familyId, { title: 'Finish Me' });
    await openTasks(page, 'Finish Me');

    await page.getByRole('checkbox', { name: 'Mark task: Undo Me' }).click();
    await expect(page.getByText('Undo Me', { exact: true })).toHaveCount(0);
    await page.locator('.toast__action', { hasText: 'Undo' }).first().click();
    await expect(page.getByRole('checkbox', { name: 'Mark task: Undo Me' })).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('checkbox', { name: 'Mark task: Finish Me' }).click();
    await page.waitForTimeout(UNDO_WINDOW_MS + 1500);
    const tasks = await (await apiCtx.get(`/api/tasks?family_id=${familyId}`)).json();
    const items = Array.isArray(tasks) ? tasks : tasks.items;
    expect(items.find((task) => task.title === 'Finish Me').status).toBe('done');
    expect(items.find((task) => task.title === 'Undo Me').status).toBe('open');
  });

  test('postpone and delete from the task actions', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, { title: 'Move Me' });
    await seedTask(apiCtx, familyId, { title: 'Delete This Task' });
    await openTasks(page, 'Delete This Task');

    await page.getByRole('button', { name: 'Actions for Move Me' }).click();
    await page.getByRole('dialog', { name: 'Move Me' }).getByRole('button', { name: 'Tomorrow' }).click();
    await expect(page.getByRole('region', { name: 'Upcoming' }).getByText('Move Me')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Actions for Delete This Task' }).click();
    await page.getByRole('dialog', { name: 'Delete This Task' }).getByRole('button', { name: 'Delete task' }).click();
    await expect(page.getByText('Delete This Task', { exact: true })).toHaveCount(0);
  });
});
