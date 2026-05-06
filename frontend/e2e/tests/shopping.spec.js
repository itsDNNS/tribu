const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingList, seedShoppingItem, seedShoppingTemplate } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Shopping', () => {
  test.setTimeout(90000);

  async function expandTemplatesIfCollapsed(page) {
    const showTemplates = page.getByRole('button', { name: 'Show templates' });
    if (await showTemplates.isVisible({ timeout: 1000 }).catch(() => false)) {
      await showTemplates.click();
    }
  }

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
    await page.locator('.shopping-category-input').fill('Bakery');
    await page.locator('[aria-label="Add item"]').click();

    await expect(page.getByRole('button', { name: /Bakery/ })).toBeVisible({ timeout: 10000 });
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
    await seedShoppingItem(apiCtx, list.id, 'Apples', '', 'Produce');
    await seedShoppingItem(apiCtx, list.id, 'Pasta', '', 'Pantry');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await page.getByText('Toggle List').click();

    const produceGroup = page.getByRole('button', { name: /Produce/ });
    await expect(produceGroup).toBeVisible({ timeout: 10000 });
    await produceGroup.click();
    await expect(page.locator('[role="checkbox"][aria-label="Apples"]')).not.toBeVisible({ timeout: 5000 });
    await produceGroup.click();

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
    await expandTemplatesIfCollapsed(page);
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
    await expandTemplatesIfCollapsed(page);
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

  test('mobile in-store layout prioritizes active items and keeps keyboard focus out of the checklist', async ({ authedPage: page, apiCtx }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 768, 'Mobile-only shopping layout check');

    const familyId = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, familyId, 'Mobile Market List');
    await seedShoppingItem(apiCtx, list.id, 'Apples', '6', 'Produce');
    await seedShoppingItem(apiCtx, list.id, 'Milk', '2 L', 'Dairy');
    await seedShoppingTemplate(apiCtx, familyId, 'Mobile breakfast plan', [
      { name: 'Eggs', spec: '12', category: 'Dairy' },
    ]);

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');
    await page.getByText('Mobile Market List').click();

    const itemsPanel = page.locator('.shopping-items-panel');
    const templatesPanel = page.locator('.shopping-templates-panel');
    await expect(itemsPanel).toBeVisible({ timeout: 10000 });
    await expect(templatesPanel).toBeVisible({ timeout: 10000 });

    const [itemsBox, templatesBox] = await Promise.all([
      itemsPanel.boundingBox(),
      templatesPanel.boundingBox(),
    ]);
    expect(itemsBox.y).toBeLessThan(templatesBox.y);

    await expect(page.getByText('Mobile breakfast plan')).not.toBeVisible();
    await page.getByRole('button', { name: 'Show templates' }).click();
    await expect(page.getByText('Mobile breakfast plan')).toBeVisible({ timeout: 10000 });

    const quickAdd = page.locator('input[placeholder="Add an item..."]');
    await quickAdd.focus();
    await expect(quickAdd).toBeFocused();
    await expect(quickAdd).not.toHaveAttribute('list', 'shopping-item-suggestions');

    await quickAdd.fill('Mi');
    await expect(quickAdd).not.toHaveAttribute('list', 'shopping-item-suggestions');
    const suggestionList = page.locator('#shopping-item-suggestions');
    await expect(suggestionList).toBeVisible();
    await expect.poll(async () => suggestionList.getByRole('option').evaluateAll((options) => options.map((option) => option.textContent))).toEqual(['Milk']);
    await expect.poll(async () => suggestionList.evaluate((element) => {
      const color = getComputedStyle(element).backgroundColor;
      const alpha = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(',').map((part) => Number(part.trim()))[3] ?? 1;
      return alpha;
    })).toBe(1);

    await quickAdd.clear();
    await expect(suggestionList).toBeHidden();
    await quickAdd.fill('Mi');
    await expect(suggestionList).toBeVisible();
    await expect.poll(async () => suggestionList.evaluate((element) => {
      const color = getComputedStyle(element).backgroundColor;
      const alpha = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(',').map((part) => Number(part.trim()))[3] ?? 1;
      return alpha;
    })).toBe(1);
    await quickAdd.clear();
    await page.locator('[role="checkbox"][aria-label="Apples"]').click();
    await expect(quickAdd).not.toBeFocused();

    await quickAdd.fill('Bananas');
    await expect(quickAdd).toBeFocused();
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(quickAdd).not.toBeFocused();
    await expect(page.locator('[role="checkbox"][aria-label="Bananas"]')).toBeVisible({ timeout: 10000 });
  });

  test('mobile shopping menu stays opaque while quick add is focused and reopened', async ({ authedPage: page, apiCtx }) => {
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 768, 'Mobile-only shopping menu opacity check');

    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Opaque Menu Market List');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');
    await page.getByText('Opaque Menu Market List').click();

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      document.documentElement.removeAttribute('data-display-mode');
    });

    const quickAdd = page.locator('input[placeholder="Add an item..."]');
    await quickAdd.focus();
    await expect(quickAdd).toBeFocused();

    const sidebar = page.locator('.sidebar.mobile-open');
    const assertOpaqueSidebar = async () => {
      const sidebarBackground = await sidebar.evaluate((element) => getComputedStyle(element).backgroundColor);
      const alphaMatch = sidebarBackground.match(/rgba?\(([^)]+)\)/);
      const alpha = alphaMatch?.[1]?.split(',').map((part) => Number(part.trim()))[3] ?? 1;
      expect(alpha).toBe(1);
    };

    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(sidebar).toBeVisible();
    await assertOpaqueSidebar();

    await page.mouse.click(350, 120);
    await expect(sidebar).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(sidebar).toBeVisible();
    await assertOpaqueSidebar();
  });

  test('768px shopping breakpoint keeps items before templates in DOM order', async ({ authedPage: page, apiCtx }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    const familyId = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, familyId, 'Breakpoint Market List');
    await seedShoppingItem(apiCtx, list.id, 'Tea', '1 box', 'Pantry');
    await seedShoppingTemplate(apiCtx, familyId, 'Breakpoint planning template', [
      { name: 'Coffee', spec: '1 bag', category: 'Pantry' },
    ]);

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');
    await page.getByText('Breakpoint Market List').click();

    await expect(page.locator('.shopping-items-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.shopping-templates-panel')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Breakpoint planning template')).not.toBeVisible();

    const ordering = await page.evaluate(() => {
      const items = document.querySelector('.shopping-items-panel');
      const templates = document.querySelector('.shopping-templates-panel');
      return Boolean(items && templates && (items.compareDocumentPosition(templates) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(ordering).toBe(true);
  });

});
