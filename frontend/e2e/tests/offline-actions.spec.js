const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingItem, seedShoppingList, seedTask } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');
const { selectShoppingList } = require('../helpers/shopping');

// Offline per action (Tribu 2.0, D6): checking off without a network stays
// done on screen, is marked as waiting and reaches the server once the
// network is back. A short dropout shows no offline banner.
test.use({ serviceWorkers: 'block' });

// The undo window (hooks/useTasks.js) before a completion is sent.
const UNDO_WINDOW_MS = 6000;

test('a shopping check-off waits for the network', async ({ authedPage: page, apiCtx }) => {
  const familyId = await getFamilyId(apiCtx);
  const list = await seedShoppingList(apiCtx, familyId, 'Offline groceries');
  await seedShoppingItem(apiCtx, list.id, 'Offline apples');
  try {
    await page.reload();
    await navigateTo(page, 'Shopping');
    await selectShoppingList(page, 'Offline groceries');
    const tile = page.getByRole('checkbox', { name: /^Offline apples,/ });
    await expect(tile).toHaveAttribute('aria-checked', 'false');

    await page.context().setOffline(true);
    await tile.click();
    await page.getByText('Already in the basket').click();
    await expect(tile).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.shop-waiting')).toHaveText('Waiting for network');
    await expect(page.locator('.pwa-banner--offline')).toHaveCount(0);

    await page.context().setOffline(false);
    await expect(page.locator('.shop-waiting')).toHaveCount(0, { timeout: 10000 });
    await expect(tile).toHaveAttribute('aria-checked', 'true');
    const items = await (await apiCtx.get(`/api/shopping/lists/${list.id}/items`)).json();
    expect(items.find((item) => item.name === 'Offline apples').checked).toBe(true);
  } finally {
    await page.context().setOffline(false);
    await apiCtx.delete(`/api/shopping/lists/${list.id}`);
  }
});

test('a task finished offline is sent once the network is back', async ({ authedPage: page, apiCtx }) => {
  const familyId = await getFamilyId(apiCtx);
  const task = await seedTask(apiCtx, familyId, { title: 'Offline chore' });
  try {
    await page.reload();
    await navigateTo(page, 'Tasks');
    const check = page.getByRole('checkbox', { name: 'Mark task: Offline chore' });
    await expect(check).toBeVisible({ timeout: 10000 });

    await page.context().setOffline(true);
    await check.click();
    await page.waitForTimeout(UNDO_WINDOW_MS + 1000);
    await expect(page.locator('.pwa-banner--offline')).toBeVisible();
    await page.getByRole('region', { name: 'Done' }).getByRole('button', { name: /Done/ }).click();
    const row = page.locator('.task-row').filter({ hasText: 'Offline chore' });
    await expect(row).toContainText('Waiting for network');

    await page.context().setOffline(false);
    await expect(row).not.toContainText('Waiting for network', { timeout: 10000 });
    await expect.poll(async () => {
      const tasks = await (await apiCtx.get(`/api/tasks?family_id=${familyId}`)).json();
      return (Array.isArray(tasks) ? tasks : tasks.items).find((entry) => entry.id === task.id)?.status;
    }).toBe('done');
  } finally {
    await page.context().setOffline(false);
    await apiCtx.delete(`/api/tasks/${task.id}`);
  }
});
