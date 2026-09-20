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
    const shopping = nav.getByRole('button', { name: 'Shopping', exact: true });
    const more = nav.getByRole('button', { name: 'More', exact: true });
    const header = page.getByRole('button', { name: 'Open menu', exact: true });
    await expect(shopping).toHaveAccessibleDescription(`Shopping: ${shoppingCount}`);
    await expect(shopping.locator('.ui-count-badge')).toHaveText(String(shoppingCount));
    await expect(header).toHaveAccessibleDescription('7 unread');
    await expect(more).toHaveAccessibleDescription('7 unread');
    await expect(more).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await header.click();
    const menu = page.getByRole('dialog');
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('button', { name: 'Tasks', exact: true })).toHaveAccessibleDescription(`Tasks: ${taskCount}`);
    await expect(menu.getByRole('button', { name: 'Shopping', exact: true })).toHaveAccessibleDescription(`Shopping: ${shoppingCount}`);
    await expect(menu.getByRole('button', { name: 'Notifications', exact: true })).toHaveAccessibleDescription('7 unread');
    await menu.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(more).toHaveAttribute('aria-current', 'page');
    await expect(more).toHaveClass(/active/);
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(header).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
    await expect(header.locator('.ui-count-badge')).toHaveCount(0);
    await expect(more.locator('.ui-count-badge')).toHaveCount(0);
    await expect(header).toHaveAccessibleDescription('');
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Notification badge', exact: true })).not.toBeChecked();
    await more.click();
    await expect(menu.getByRole('button', { name: 'Notifications', exact: true }).locator('.ui-count-badge')).toHaveCount(0);
    await expect(menu.getByRole('button', { name: 'Tasks', exact: true })).toHaveAccessibleDescription(`Tasks: ${taskCount}`);
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
    await expect(header).toHaveAccessibleDescription('7 unread');
    await expect(shopping).toHaveAccessibleDescription(`Shopping: ${shoppingCount}`);

    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await more.click();
      const notifications = menu.getByRole('button', { name: 'Notifications', exact: true });
      await notifications.scrollIntoViewIfNeeded();
      await expect(notifications.locator('.ui-count-badge')).toBeVisible();
      expect(await menu.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(header.locator('.ui-count-badge')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await more.click();
    await menu.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Notifications', exact: true })).toBeVisible();
    unreadCount = 0;
    await page.reload();
    await expect(header.locator('.ui-count-badge')).toHaveCount(0);
    await expect(more.locator('.ui-count-badge')).toHaveCount(0);
    await expect(shopping).toHaveAccessibleDescription(`Shopping: ${shoppingCount}`);
  });
}
