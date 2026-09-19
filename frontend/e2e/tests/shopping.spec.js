const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingList, seedShoppingItem, seedShoppingTemplate, seedShoppingStoreLink } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');
const { shoppingListCard, selectShoppingList } = require('../helpers/shopping');

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

    await expect(shoppingListCard(page, 'E2E Groceries')).toBeVisible({ timeout: 10000 });
  });

  test('opens a configured store search safely without checking the item', async ({ authedPage: page, apiCtx }, testInfo) => {
    const familyId = await getFamilyId(apiCtx);
    const existing = await apiCtx.get(`/api/shopping/store-links?family_id=${familyId}`);
    expect(existing.ok()).toBeTruthy();
    for (const link of await existing.json()) {
      const deleted = await apiCtx.delete(`/api/shopping/store-links/${link.id}`);
      expect(deleted.ok()).toBeTruthy();
    }
    const list = await seedShoppingList(apiCtx, familyId, 'Store Search List');
    await seedShoppingItem(apiCtx, list.id, 'Bread');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');
    await selectShoppingList(page, 'Store Search List');
    await expect(page.getByRole('button', { name: 'Search online: Bread' })).toHaveCount(0);

    const base = process.env.BASE_URL || 'http://localhost:3000';
    const store = await seedShoppingStoreLink(apiCtx, familyId, 'E2E Store', `${base}/?q={query}`);
    let primaryError = null;
    try {
      await page.reload();
      await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
      await navigateTo(page, 'Shopping');
      await selectShoppingList(page, 'Store Search List');

      const row = page.getByRole('checkbox', { name: 'Bread' });
      if (testInfo.project.name === 'Desktop Chrome') await row.hover();
      await page.getByRole('button', { name: 'Search online: Bread' }).click();
      const dialog = page.getByRole('dialog', { name: 'Search for Bread' });
      await expect(dialog.getByText('E2E Store')).toBeVisible();
      await expect(dialog.getByText(new URL(base).hostname)).toBeVisible();
      const [popup] = await Promise.all([
        page.context().waitForEvent('page'),
        dialog.getByRole('link', { name: /E2E Store/ }).click(),
      ]);
      await popup.waitForLoadState('domcontentloaded');
      expect(popup.url()).toContain('q=Bread');
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      expect(await popup.evaluate(() => document.referrer)).toBe('');
      await popup.close();
      await expect(dialog).toHaveCount(0);
      await expect(row).toHaveAttribute('aria-checked', 'false');

      if (testInfo.project.name === 'Mobile Chrome') {
        await page.setViewportSize({ width: 360, height: 780 });
        await expect(page.getByRole('button', { name: 'Search online: Bread' })).toBeVisible();
        const widths = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth + 1);
      }
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      const cleanup = await apiCtx.delete(`/api/shopping/store-links/${store.id}`);
      if (!cleanup.ok() && cleanup.status() !== 404 && !primaryError) {
        throw new Error(`DELETE /api/shopping/store-links/${store.id} failed (${cleanup.status()})`);
      }
    }
  });

  test('add an item to a list', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Item Test List');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await selectShoppingList(page, 'Item Test List');
    await page.locator('input[placeholder="Add an item..."]').fill('Bread');
    await page.locator('.shopping-spec-input').fill('whole wheat');
    await page.locator('.shopping-category-input').fill('Bakery');
    await page.locator('[aria-label="Add item"]').click();

    await expect(page.getByRole('button', { name: /Bakery/ })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="checkbox"][aria-label="Bread"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('whole wheat')).toBeVisible();
  });

  test('rename a list, edit item details, and move the item between lists', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const source = await seedShoppingList(apiCtx, familyId, 'StoreA');
    await seedShoppingList(apiCtx, familyId, 'StoreB');
    await seedShoppingItem(apiCtx, source.id, 'Bread', '1 loaf', 'Bakery');

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');

    await selectShoppingList(page, 'StoreA');
    const renameForm = page.locator('.shopping-list-rename-form');
    if ((await renameForm.count()) === 0) {
      await shoppingListCard(page, 'StoreA').locator('button[aria-label="Rename list: StoreA"]').click({ force: true });
    }
    await expect(renameForm).toBeVisible({ timeout: 10000 });
    await page.getByLabel('List name').fill('Store A market');
    await renameForm.getByRole('button', { name: 'Save' }).click();
    await expect(shoppingListCard(page, 'Store A market')).toBeVisible({ timeout: 10000 });

    await page.locator('[role="checkbox"][aria-label="Bread"]').hover();
    await page.getByRole('button', { name: 'Edit item: Bread' }).click();
    const editForm = page.locator('.shopping-item-edit-form');
    await editForm.getByLabel('Item').fill('baguette');
    await editForm.getByLabel('Details').fill('2 loaves');
    await editForm.getByLabel('Category').fill('Bakery aisle');
    await editForm.getByLabel('Move to list').selectOption({ label: 'StoreB' });
    await editForm.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('[role="checkbox"][aria-label="Baguette"]')).not.toBeVisible({ timeout: 10000 });
    await selectShoppingList(page, 'StoreB');
    const movedItem = page.locator('[role="checkbox"][aria-label="Baguette"]');
    await expect(movedItem).toBeVisible({ timeout: 10000 });
    await expect(movedItem.locator('..')).toContainText('2 loaves');
    await expect(movedItem.locator('..')).toContainText('Bakery aisle');
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

    await selectShoppingList(page, 'Reuse Checked List');
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

    await selectShoppingList(page, 'Toggle List');

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

    await selectShoppingList(page, 'Template Target List');
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
    await expect(milkItem.locator('..')).toContainText('2 L');
    await expect(milkItem.locator('..')).toContainText('Dairy');
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

    await selectShoppingList(page, 'Seeded Template Target');
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

    await selectShoppingList(page, 'Delete This List');

    // deleteList() now uses ConfirmDialog — click the confirm button
    await page.locator('[aria-label="Delete list: Delete This List"]').click();
    await page.locator('.cal-dialog .btn-sm').first().click();

    await expect(shoppingListCard(page, 'Delete This List')).not.toBeVisible({ timeout: 10000 });
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
    await selectShoppingList(page, 'Mobile Market List');

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
    await page.locator('.shopping-items-wrapper .quick-add-btn').click();
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
    await selectShoppingList(page, 'Opaque Menu Market List');

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
    await selectShoppingList(page, 'Breakpoint Market List');

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

test('shopping usability: category suggestions, explicit checking, Undo and recent checked order', async ({ authedPage: page, apiCtx }, testInfo) => {
  test.setTimeout(90000);
  const familyId = await getFamilyId(apiCtx);
  const list = await seedShoppingList(apiCtx, familyId, 'Usability Market');
  const vocabularyList = await seedShoppingList(apiCtx, familyId, 'Category Vocabulary');
  await seedShoppingItem(apiCtx, vocabularyList.id, 'Pear', '', 'Fresh produce');
  const apple = await seedShoppingItem(apiCtx, list.id, 'Apple', '', 'Fruit');
  const bread = await seedShoppingItem(apiCtx, list.id, 'Bread', '', 'Bakery');
  await apiCtx.patch(`/api/shopping/items/${bread.id}`, { data: { checked: true } });
  await page.reload();
  await navigateTo(page, 'Shopping');
  await selectShoppingList(page, 'Usability Market');
  const overview = page.locator('#shopping-category-overview');
  await expect(overview).toContainText('Fruit');
  await expect(overview).not.toContainText('Bakery');
  await page.getByRole('button', { name: 'Hide category overview' }).click();
  await expect(overview).toHaveCount(0);
  await page.getByRole('button', { name: 'Show category overview' }).click();
  if (page.viewportSize().width <= 1024) expect((await overview.boundingBox()).height).toBeLessThan(65);

  const category = page.getByRole('combobox', { name: 'Category', exact: true }).first();
  await category.focus();
  await expect(page.getByRole('listbox', { name: 'Category', exact: true })).toHaveCount(0);
  await category.fill('   ');
  await expect(page.getByRole('listbox', { name: 'Category', exact: true })).toHaveCount(0);
  await category.fill('fr');
  const suggestions = page.getByRole('listbox', { name: 'Category', exact: true });
  await expect(suggestions.getByRole('option', { name: 'Fresh produce' })).toBeVisible();
  expect(await suggestions.evaluate((element) => getComputedStyle(element).backgroundColor)).toMatch(/^rgb\(/);
  expect((await suggestions.boundingBox()).width).toBeGreaterThan(150);
  await page.screenshot({ path: testInfo.outputPath('category-suggestions.png'), fullPage: true });
  await category.press('Escape');
  await expect(suggestions).toHaveCount(0);
  await category.clear();
  await category.fill('fresh');
  const freshProduce = suggestions.getByRole('option', { name: 'Fresh produce' });
  if (testInfo.project.name === 'Mobile Chrome') await freshProduce.tap();
  else await freshProduce.click();
  await expect(category).toHaveValue('Fresh produce');
  await page.getByPlaceholder('Add an item...').fill('Peach');
  await page.locator('.quick-add-bar').getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Peach', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit item: Peach' }).click();
  const editCategory = page.locator('.shopping-item-edit-form').getByRole('combobox', { name: 'Category', exact: true });
  await editCategory.fill('fru');
  await editCategory.press('ArrowDown');
  await editCategory.press('Enter');
  await expect(editCategory).toHaveValue('Fruit');
  await page.locator('.shopping-item-edit-form').getByRole('button', { name: 'Save', exact: true }).click();

  const appleCheck = page.getByRole('checkbox', { name: 'Apple', exact: true });
  await page.locator('.shopping-item-name').getByText('Apple', { exact: true }).click();
  await expect(appleCheck).toHaveAttribute('aria-checked', 'false');
  await appleCheck.click();
  await expect(appleCheck).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(appleCheck).toHaveAttribute('aria-checked', 'false');
  await expect(appleCheck).toBeEnabled();
  await appleCheck.focus();
  await appleCheck.press('Space');
  await expect(appleCheck).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.shopping-item.checked .shopping-item-name')).toHaveText(['Apple', 'Bread']);
  await expect(appleCheck.locator('..').locator('.shopping-category-pill')).toBeVisible();
  await page.reload();
  await navigateTo(page, 'Shopping');
  await selectShoppingList(page, 'Usability Market');
  await expect(page.locator('.shopping-item.checked .shopping-item-name')).toHaveText(['Apple', 'Bread']);
  await apiCtx.patch(`/api/shopping/items/${bread.id}`, { data: { checked: false } });
  await expect(page.getByRole('checkbox', { name: 'Bread', exact: true })).toHaveAttribute('aria-checked', 'false');
  await apiCtx.patch(`/api/shopping/items/${bread.id}`, { data: { checked: true } });
  await expect(page.locator('.shopping-item.checked .shopping-item-name')).toHaveText(['Bread', 'Apple']);
  await page.getByRole('checkbox', { name: 'Peach', exact: true }).click();
  await expect(overview.locator('.shopping-category-overview-chip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide category overview' }).click();
  await expect(page.getByRole('button', { name: 'Show category overview' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('shopping-checked.png'), fullPage: true });
});
