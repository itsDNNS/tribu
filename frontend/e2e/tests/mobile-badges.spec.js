const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedTask, seedShoppingList, seedShoppingItem } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.use({ serviceWorkers: 'block' });

for (const width of [320, 390]) {
  test(`mobile counters and unread preference remain accessible at ${width}px`, async ({ authedPage: page, apiCtx }) => {
    await page.setViewportSize({ width, height: 844 });
    // Unread delivery is controlled here so this UI regression does not wait on
    // the reminder scheduler. Tasks, shopping, authentication and settings use
    // the disposable backend and the real application preference controls.
    let unreadCount = 7;
    await page.route('**/api/notifications/unread-count', route => route.fulfill({ json: { count: unreadCount } }));
    const family = await getFamilyId(apiCtx);
    await seedTask(apiCtx, family, { title: 'Mobile badge task' });
    const list = await seedShoppingList(apiCtx, family, 'Mobile badge groceries');
    await seedShoppingItem(apiCtx, list.id, 'Demo apples');
    await seedShoppingItem(apiCtx, list.id, 'Demo bread');
    const tasks = await (await apiCtx.get(`/api/tasks?family_id=${family}`)).json();
    const taskCount = tasks.items.filter(task => task.status === 'open').length;
    const lists = await (await apiCtx.get(`/api/shopping/lists?family_id=${family}`)).json();
    const shoppingCount = lists.reduce((sum, item) => sum + item.item_count - item.checked_count, 0);
    await page.reload();
    await navigateTo(page, 'Calendar');

    const nav = page.getByRole('navigation', { name: 'Bottom navigation' });
    const listsTab = nav.getByRole('button', { name: /Lists/ });
    const bell = page.locator('.app-header').getByRole('button', { name: 'Notifications', exact: true });
    const avatar = page.locator('.app-header').getByRole('button', { name: 'Account and settings', exact: true });
    await expect(listsTab).toHaveAccessibleDescription(`Shopping: ${shoppingCount}`);
    await expect(listsTab.locator('.ui-count-badge')).toHaveText(String(shoppingCount));
    await expect(bell).toHaveAccessibleDescription('7 unread');
    await expect(bell.locator('.app-header-badge')).toHaveText('7');

    // Lists opens its pages; the task count sits on its chip.
    await listsTab.click();
    const pages = page.getByRole('navigation', { name: 'Pages in Lists' });
    await expect(pages.getByRole('button', { name: /Tasks/ })).toContainText(String(taskCount));

    // Settings sit behind the avatar.
    await expect(avatar).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(avatar).toHaveAttribute('aria-expanded', 'false');
    await avatar.click();
    const menu = page.getByRole('dialog');
    await expect(avatar).toHaveAttribute('aria-expanded', 'true');
    await menu.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(avatar).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
    await expect(bell.locator('.app-header-badge')).toHaveCount(0);
    await expect(bell).toHaveAccessibleDescription('');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Notification badge', exact: true })).not.toBeChecked();
    await expect(bell.locator('.app-header-badge')).toHaveCount(0);
    await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
    await expect(bell).toHaveAccessibleDescription('7 unread');
    await expect(listsTab).toHaveAccessibleDescription(`Shopping: ${shoppingCount}`);

    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await avatar.click();
      expect(await menu.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(avatar).toBeFocused();
      await expect(bell.locator('.app-header-badge')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await bell.click();
    await expect(page.getByRole('dialog', { name: 'Notifications', exact: true })).toBeVisible();
    unreadCount = 0;
    await page.reload();
    await expect(bell.locator('.app-header-badge')).toHaveCount(0);
    await expect(listsTab).toHaveAccessibleDescription(`Shopping: ${shoppingCount}`);
  });
}
