const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingList, seedShoppingItem, seedShoppingTemplate } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Shopping', () => {
  test.setTimeout(90000);

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
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Item Test List').click();
    await page.locator('input[placeholder="Add an item..."]').fill('Bread');
    await page.locator('.shopping-spec-input').fill('whole wheat');
    await page.locator('[aria-label="Add item"]').click();

    await expect(page.locator('[role="checkbox"][aria-label="Bread"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('whole wheat')).toBeVisible();
  });

  test('reactivates checked items and normalizes quick-add names', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, familyId, 'Reuse Checked List');
    const milk = await seedShoppingItem(apiCtx, list.id, 'Milk');
    await apiCtx.patch(`/api/shopping/items/${milk.id}`, { data: { checked: true } });

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Reuse Checked List').click();
    await expect(page.locator('[role="checkbox"][aria-label="Milk"]')).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });

    await page.locator('input[placeholder="Add an item..."]').fill('milch');
    await page.locator('[aria-label="Add item"]').click();
    await expect(page.locator('[role="checkbox"][aria-label="Milch"]')).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });

    await page.locator('input[placeholder="Add an item..."]').fill('milk');
    await page.locator('[aria-label="Add item"]').click();
    const milkRows = page.locator('[role="checkbox"][aria-label="Milk"]');
    await expect(milkRows).toHaveCount(1, { timeout: 10000 });
    await expect(milkRows.first()).toHaveAttribute('aria-checked', 'false');
  });

  test('toggle an item checked / unchecked', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, familyId, 'Toggle List');
    await seedShoppingItem(apiCtx, list.id, 'Apples');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
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

  test('create, edit, and apply a shopping template', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Template Target List');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Template Target List').click();
    await page.getByRole('button', { name: 'New template' }).click();
    await page.locator('input[placeholder="e.g. Weekly groceries"]').fill('Weekly groceries');
    await page.locator('input[placeholder="Template item"]').first().fill('Milk');
    await page.locator('input[placeholder="Amount/details"]').first().fill('2 L');
    await page.locator('input[placeholder="Category"]').first().fill('Dairy');
    await page.getByRole('button', { name: 'Add template item' }).click();
    await page.locator('input[placeholder="Template item"]').nth(1).fill('Bananas');
    await page.locator('input[placeholder="Amount/details"]').nth(1).fill('6');
    await page.locator('input[placeholder="Category"]').nth(1).fill('Produce');
    await page.getByRole('button', { name: 'Save template' }).click();

    await expect(page.getByRole('heading', { name: 'Weekly groceries' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Milk')).toBeVisible();

    await page.getByRole('button', { name: 'Edit template: Weekly groceries' }).click();
    await page.locator('input[placeholder="e.g. Weekly groceries"]').fill('Weekly basics');
    await page.getByRole('button', { name: 'Save template' }).click();
    await expect(page.getByRole('heading', { name: 'Weekly basics' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Add to list: Weekly basics' }).click();
    const milkItem = page.locator('[role="checkbox"][aria-label="Milk"]');
    await expect(milkItem).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="checkbox"][aria-label="Bananas"]')).toBeVisible();
    await expect(milkItem).toContainText('2 L');
    await expect(milkItem).toContainText('Dairy');
  });

  test('apply a seeded shopping template to a list', async ({ authedPage: page, apiCtx }) => {
    test.setTimeout(90000);
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Seeded Template Target');
    await seedShoppingTemplate(apiCtx, familyId, 'Seeded weekly groceries', [
      { name: 'Oats', spec: '1 kg', category: 'Pantry' },
      { name: 'Eggs', spec: '12', category: 'Dairy' },
    ]);

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Seeded Template Target').click();
    await page.getByRole('button', { name: 'Add to list: Seeded weekly groceries' }).click();

    await expect(page.locator('[role="checkbox"][aria-label="Oats"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="checkbox"][aria-label="Eggs"]')).toBeVisible();
  });

  test('delete a shopping list', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Delete This List');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Delete This List').click();

    // deleteList() now uses ConfirmDialog — click the confirm button
    await page.locator('[aria-label="Delete list: Delete This List"]').click();
    await page.locator('.cal-dialog .btn-sm').first().click();

    await expect(page.getByText('Delete This List')).not.toBeVisible({ timeout: 10000 });
  });
});
