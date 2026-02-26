const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingList, seedShoppingItem } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Shopping', () => {
  test('create a shopping list', async ({ authedPage: page }) => {
    await navigateTo(page, 'Shopping');

    await page.getByText('New list').click();
    await page.locator('input[placeholder="e.g. Grocery Store"]').fill('E2E Groceries');
    await page.locator('.shopping-new-list-form .btn-sm').first().click();

    await expect(page.getByText('E2E Groceries')).toBeVisible({ timeout: 10000 });
  });

  test('add an item to a list', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Item Test List');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 10000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Item Test List').click();
    await page.locator('input[placeholder="Add an item..."]').fill('Bread');
    await page.locator('.shopping-spec-input').fill('whole wheat');
    await page.locator('[aria-label="Add item"]').click();

    await expect(page.getByText('Bread')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('whole wheat')).toBeVisible();
  });

  test('toggle an item checked / unchecked', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, familyId, 'Toggle List');
    await seedShoppingItem(apiCtx, list.id, 'Apples');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 10000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Toggle List').click();

    const item = page.locator('[role="checkbox"][aria-label="Apples"]');
    await expect(item).toBeVisible({ timeout: 10000 });
    await expect(item).toHaveAttribute('aria-checked', 'false');

    await item.click();
    await expect(item).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });

    await item.click();
    await expect(item).toHaveAttribute('aria-checked', 'false', { timeout: 5000 });
  });

  test('delete a shopping list', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Delete This List');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 10000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Delete This List').click();

    // deleteList() uses window.confirm() — accept it
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[aria-label="Delete list: Delete This List"]').click();

    await expect(page.getByText('Delete This List')).not.toBeVisible({ timeout: 10000 });
  });
});
