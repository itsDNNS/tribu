const {
  test,
  expect
} = require('../helpers/fixtures');
const {
  getFamilyId,
  seedShoppingList,
  seedShoppingItem,
  seedShoppingTemplate,
  seedShoppingStoreLink,
  seedMealPlan
} = require('../helpers/api-setup');
const {
  navigateTo
} = require('../helpers/navigation');
const {
  shoppingListCard,
  selectShoppingList
} = require('../helpers/shopping');
test.use({
  serviceWorkers: 'block'
});
const tile = (page, name) => page.getByRole('checkbox', {
  name: new RegExp(`^${name},`)
});
const search = page => page.getByRole('combobox', {
  name: 'Search products or add with a quantity'
});
async function openList(page, name) {
  await page.reload();
  await navigateTo(page, 'Shopping');
  await selectShoppingList(page, name);
}
async function discovery(page) {
  await expect(page.locator('.shop-board')).toBeVisible();
  if (await page.locator('.shop-rail').isVisible()) return page.locator('.shop-rail');
  await page.getByRole('button', {
    name: 'Open product catalogue'
  }).click();
  return page.getByRole('dialog');
}
async function menu(page) {
  await page.locator('.shop-page').getByRole('button', {
    name: 'List options',
    exact: true
  }).first().click();
}
async function templates(page) {
  await menu(page);
  await page.getByRole('dialog').getByRole('button', {
    name: 'Shopping templates',
    exact: true
  }).click();
}
test.describe('Shopping with the backend', () => {
  test.setTimeout(60000);
  test('create a shopping list', async ({
    authedPage: page
  }) => {
    await navigateTo(page, 'Shopping');
    await page.getByRole('button', {
      name: 'New shopping list',
      exact: true
    }).click();
    await page.getByRole('dialog').getByLabel('List name').fill('E2E Groceries');
    await page.getByRole('dialog').getByRole('button', {
      name: 'Save',
      exact: true
    }).click();
    await expect(shoppingListCard(page, 'E2E Groceries')).toBeVisible();
  });
  test('add quantity and notes, rename a list and move the product', async ({
    authedPage: page,
    apiCtx
  }) => {
    const family = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, family, 'Source Store');
    await seedShoppingList(apiCtx, family, 'Target Store');
    await openList(page, 'Source Store');
    await search(page).fill('2 kg Bread');
    await search(page).press('Enter');
    await expect(tile(page, 'Bread')).toBeVisible();
    await page.getByRole('button', {
      name: 'Details for Bread'
    }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Details for the family').fill('Whole wheat');
    await d.getByRole('combobox', {
      name: 'Category',
      exact: true
    }).selectOption('__custom__');
    await d.getByRole('textbox', {
      name: 'Custom category',
      exact: true
    }).fill('Bakery aisle');
    await d.getByRole('button', {
      name: 'Save',
      exact: true
    }).click();
    await expect(tile(page, 'Bread')).toContainText('Whole wheat');
    await menu(page);
    await page.getByRole('button', {
      name: 'Edit list',
      exact: true
    }).click();
    await page.getByRole('dialog').getByLabel('List name').fill('Renamed Source');
    await page.getByRole('dialog').getByRole('button', {
      name: 'Save',
      exact: true
    }).click();
    await expect(shoppingListCard(page, 'Renamed Source')).toBeVisible();
    await page.getByRole('button', {
      name: 'Details for Bread'
    }).click();
    await page.getByRole('dialog').getByRole('combobox', {
      name: 'Shopping list',
      exact: true
    }).selectOption({
      label: 'Target Store'
    });
    await page.getByRole('dialog').getByRole('button', {
      name: 'Save',
      exact: true
    }).click();
    await expect(tile(page, 'Bread')).toHaveCount(0);
    await selectShoppingList(page, 'Target Store');
    await expect(tile(page, 'Bread')).toContainText('2 kg');
    await expect(page.getByRole('region', {
      name: 'Bakery aisle',
      exact: true
    })).toBeVisible();
  });
  test('check, Undo, archive and restore retain a single product', async ({
    authedPage: page,
    apiCtx
  }) => {
    const family = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, family, 'Trip History');
    const original = await seedShoppingItem(apiCtx, list.id, 'Milk', '2 l', 'Dairy');
    await apiCtx.patch(`/api/shopping/items/${original.id}`, {
      data: {
        notes: 'Brand',
        priority: 'urgent'
      }
    });
    await openList(page, 'Trip History');
    await tile(page, 'Milk').click();
    await page.getByRole('button', {
      name: 'Undo',
      exact: true
    }).click();
    await expect(tile(page, 'Milk')).not.toBeChecked();
    await tile(page, 'Milk').click();
    await page.locator('.shop-done summary').click();
    await page.getByRole('button', {
      name: 'Complete shopping',
      exact: true
    }).click();
    await page.getByRole('dialog').getByRole('button', {
      name: 'Complete shopping',
      exact: true
    }).click();
    await expect(tile(page, 'Milk')).toHaveCount(0);
    await page.reload();
    await selectShoppingList(page, 'Trip History');
    const recent = await discovery(page);
    await recent.getByRole('button', {
      name: 'Recent',
      exact: true
    }).click();
    await recent.getByRole('button', {
      name: 'Milk, add',
      exact: true
    }).click();
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    await expect(tile(page, 'Milk')).toHaveCount(1);
    await expect(tile(page, 'Milk')).not.toBeChecked();
    const rows = await (await apiCtx.get(`/api/shopping/lists/${list.id}/items?include_archived=true`)).json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: original.id,
      spec: '2 l',
      notes: 'Brand',
      priority: 'urgent',
      checked: false,
      archived: false
    });
  });
  test('department order is persisted for the selected list', async ({
    authedPage: page,
    apiCtx
  }) => {
    const family = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, family, 'Department Order');
    await seedShoppingItem(apiCtx, list.id, 'Bread', '1', 'Bakery');
    const original = await seedShoppingItem(apiCtx, list.id, 'Milk', '2 l', 'Dairy');
    await apiCtx.patch(`/api/shopping/items/${original.id}`, {
      data: {
        notes: 'Brand',
        priority: 'urgent'
      }
    });
    await openList(page, 'Department Order');
    await menu(page);
    await page.getByRole('button', {
      name: 'Department order',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'Dairy move up',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'Save order',
      exact: true
    }).click();
    await page.reload();
    await selectShoppingList(page, 'Department Order');
    await expect(page.locator('.shop-category-title').first()).toContainText('Dairy');
  });
  test('create, edit and apply a shopping template', async ({
    authedPage: page,
    apiCtx
  }) => {
    const family = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, family, 'Template Target');
    await openList(page, 'Template Target');
    await templates(page);
    await page.getByRole('button', {
      name: 'New template',
      exact: true
    }).click();
    await page.getByPlaceholder('e.g. Weekly groceries').fill('Weekly basics');
    await page.getByPlaceholder('Template item', {
      exact: true
    }).fill('Milk');
    await page.getByPlaceholder('Amount/details').fill('2 L');
    await page.getByPlaceholder('Category', {
      exact: true
    }).fill('Dairy');
    await page.getByRole('button', {
      name: 'Save template'
    }).click();
    await page.getByRole('button', {
      name: 'Edit template: Weekly basics'
    }).click();
    await page.getByPlaceholder('e.g. Weekly groceries').fill('Breakfast');
    await page.getByRole('button', {
      name: 'Save template'
    }).click();
    await page.getByRole('button', {
      name: 'Add to list: Breakfast'
    }).click();
    await expect(tile(page, 'Milk')).toContainText('2 L');
  });
  test('apply a saved template', async ({
    authedPage: page,
    apiCtx
  }) => {
    const family = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, family, 'Saved Template Target');
    await seedShoppingTemplate(apiCtx, family, 'Saved basics', [{
      name: 'Oats',
      spec: '1 kg',
      category: 'Pantry'
    }]);
    await openList(page, 'Saved Template Target');
    await templates(page);
    await page.getByRole('button', {
      name: 'Add to list: Saved basics'
    }).click();
    await expect(tile(page, 'Oats')).toBeVisible();
  });
  test('store search opens a native link without checking the product', async ({
    authedPage: page,
    apiCtx
  }) => {
    const family = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, family, 'Store Search');
    await seedShoppingItem(apiCtx, list.id, 'Bread');
    const base = process.env.BASE_URL || 'http://localhost:3000';
    const store = await seedShoppingStoreLink(apiCtx, family, 'E2E Store', `${base}/?q={query}`);
    try {
      await openList(page, 'Store Search');
      await page.getByRole('button', {
        name: 'Details for Bread'
      }).click();
      await page.getByRole('dialog').getByRole('button', {
        name: 'Search online'
      }).click();
      const link = page.getByRole('link', {
        name: /E2E Store/
      });
      const [popup] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
      await popup.waitForLoadState('domcontentloaded');
      expect(popup.url()).toContain('q=Bread');
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      expect(await popup.evaluate(() => document.referrer)).toBe('');
      await popup.close();
      await expect(tile(page, 'Bread')).not.toBeChecked();
    } finally {
      await apiCtx.delete(`/api/shopping/store-links/${store.id}`);
    }
  });
  test('delete a list only after confirmation', async ({
    authedPage: page,
    apiCtx
  }) => {
    const family = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, family, 'Delete This List');
    await openList(page, 'Delete This List');
    await menu(page);
    await page.getByRole('button', {
      name: 'Delete list',
      exact: true
    }).click();
    await page.getByRole('dialog').getByRole('button', {
      name: 'Delete',
      exact: true
    }).click();
    await expect(shoppingListCard(page, 'Delete This List')).toHaveCount(0);
    await expect(page.getByRole('heading', {
      name: 'For everything you need.'
    })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  test('mobile trip mode has a clear checklist and hides navigation', async ({
    authedPage: page,
    apiCtx
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844
    });
    const family = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, family, 'Mobile Market');
    await seedShoppingItem(apiCtx, list.id, 'Apples', '6', 'Produce');
    await openList(page, 'Mobile Market');
    await search(page).focus();
    await tile(page, 'Apples').click();
    await expect(search(page)).not.toBeFocused();
    await page.locator('.shop-mobile-dock .shop-mode-button').click();
    await expect(page.getByText('Shopping mode', {
      exact: true
    })).toBeVisible();
    await expect(page.locator('.sidebar')).not.toBeVisible();
    await expect(page.locator('.bottom-nav')).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test('mobile shopping navigation stays opaque while quick add is focused and reopened', async ({ authedPage: page, apiCtx }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const family = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, family, 'Opaque Menu Market List');
    await openList(page, 'Opaque Menu Market List');

    const sidebar = page.locator('.sidebar.mobile-open');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      await search(page).focus();
      await expect(search(page)).toBeFocused();
      await expect(page.locator('.shop-mobile-dock')).toBeVisible();
      await expect(page.locator('.ui-bottom-nav')).toBeHidden();
      await expect(page.locator('.ui-mobile-header')).toBeHidden();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
        await expect(sidebar).toBeVisible();
        const background = await sidebar.evaluate(element => getComputedStyle(element).backgroundColor);
        const channels = background.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
        expect(channels[3] ?? 1).toBe(1);
        await page.mouse.click(370, 120);
        await expect(sidebar).toBeHidden();
      }
    }
  });
});
test('custom favorites reuse checked products but leave archived history intact', async ({authedPage: page, apiCtx}) => {
  const family = await getFamilyId(apiCtx);
  const list = await seedShoppingList(apiCtx, family, 'Custom favorites');
  const readRows = async () => {
    const response = await apiCtx.get(`/api/shopping/lists/${list.id}/items?include_archived=true`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const addFavorite = async () => {
    const surface = await discovery(page);
    await surface.getByRole('button', {name: 'Favourites', exact: true}).click();
    await surface.getByRole('button', {name: 'Windeln, add', exact: true}).click();
    await expect(surface.getByRole('button', {name: 'Windeln, already on the list', exact: true})).toBeVisible();
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    await expect(tile(page, 'Windeln')).not.toBeChecked();
    await expect(page.locator('.shop-page').getByRole('alert')).toHaveCount(0);
  };

  await openList(page, 'Custom favorites');
  await search(page).fill('Windeln');
  await search(page).press('Enter');
  await expect(tile(page, 'Windeln')).toBeVisible();
  await page.getByRole('button', {name: 'Details for Windeln'}).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Details for the family').fill('Size 4');
  await editor.getByLabel('Priority').selectOption('urgent');
  await editor.getByRole('button', {name: 'Save favourite', exact: true}).click();
  await editor.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(editor).toHaveCount(0);
  const initial = await readRows();
  expect(initial).toHaveLength(1);
  const original = initial[0];
  expect(original).toMatchObject({name: 'Windeln', spec: '1', notes: 'Size 4', priority: 'urgent', checked: false});

  await tile(page, 'Windeln').click();
  await expect.poll(async () => (await readRows())[0].checked).toBe(true);
  await addFavorite();
  const reused = await readRows();
  expect(reused).toHaveLength(1);
  expect(reused[0]).toMatchObject({id: original.id, checked: false, archived: false, notes: 'Size 4', priority: 'urgent'});

  await tile(page, 'Windeln').click();
  await expect.poll(async () => (await readRows())[0].checked).toBe(true);
  await menu(page);
  await page.getByRole('dialog').getByRole('button', {name: 'Complete shopping', exact: true}).click();
  await page.getByRole('dialog').getByRole('button', {name: 'Complete shopping', exact: true}).click();
  await expect(tile(page, 'Windeln')).toHaveCount(0);
  const history = await readRows();
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({id: original.id, checked: true, archived: true, notes: 'Size 4', priority: 'urgent'});

  await page.reload();
  await selectShoppingList(page, 'Custom favorites');
  await addFavorite();
  const rows = await readRows();
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.id === original.id)).toEqual(history[0]);
  const live = rows.find(row => row.id !== original.id);
  expect(live).toMatchObject({name: 'Windeln', spec: '1', category: 'Sonstiges', checked: false, archived: false, notes: null, photo: null, priority: 'normal'});
});

test('real backend persists photo/details through atomic move, finish and explicit history restore', async ({
  authedPage: page,
  apiCtx
}) => {
  const family = await getFamilyId(apiCtx);
  const source = await seedShoppingList(apiCtx, family, 'Photo source');
  const target = await seedShoppingList(apiCtx, family, 'Photo target');
  const item = await seedShoppingItem(apiCtx, source.id, 'Oat drink', '2 l', 'Dairy');
  await openList(page, 'Photo source');
  await page.getByRole('button', {
    name: 'Details for Oat drink'
  }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Details for the family').fill('Unsweetened');
  await editor.getByLabel('Priority').selectOption('urgent');
  await editor.locator('input[type=file]').setInputFiles(require('path').join(__dirname, '../../public/illustrations/meal-lunch.jpg'));
  await expect(editor.getByAltText('Product photo')).toBeVisible();
  await editor.getByRole('combobox', {
    name: 'Shopping list',
    exact: true
  }).selectOption(String(target.id));
  await editor.getByRole('button', {
    name: 'Save',
    exact: true
  }).click();
  await expect(tile(page, 'Oat drink')).toHaveCount(0);
  await selectShoppingList(page, 'Photo target');
  await page.reload();
  await selectShoppingList(page, 'Photo target');
  await expect(tile(page, 'Oat drink')).toContainText('Unsweetened');
  const before = await (await apiCtx.get(`/api/shopping/lists/${target.id}/items`)).json();
  expect(before).toHaveLength(1);
  expect(before[0]).toMatchObject({
    id: item.id,
    spec: '2 l',
    notes: 'Unsweetened',
    priority: 'urgent'
  });
  expect(before[0].photo).toMatch(/^data:image\/jpeg;base64,/);
  await tile(page, 'Oat drink').click();
  await menu(page);
  await page.getByRole('dialog').getByRole('button', {
    name: 'Complete shopping',
    exact: true
  }).click();
  await page.getByRole('dialog').getByRole('button', {
    name: 'Complete shopping',
    exact: true
  }).click();
  await expect(tile(page, 'Oat drink')).toHaveCount(0);
  expect(await (await apiCtx.get(`/api/shopping/lists/${target.id}/items`)).json()).toEqual([]);
  await page.reload();
  await selectShoppingList(page, 'Photo target');
  const recent = await discovery(page);
  await recent.getByRole('button', {
    name: 'Recent',
    exact: true
  }).click();
  await recent.getByRole('button', {
    name: 'Oat drink, add',
    exact: true
  }).click();
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
  await expect(tile(page, 'Oat drink')).toBeVisible();
  const restored = await (await apiCtx.get(`/api/shopping/lists/${target.id}/items?include_archived=true`)).json();
  expect(restored).toHaveLength(1);
  expect(restored[0]).toMatchObject({
    id: item.id,
    photo: before[0].photo,
    notes: 'Unsweetened',
    priority: 'urgent',
    archived: false,
    checked: false
  });
  await page.getByRole('button', {
    name: 'Details for Oat drink'
  }).click();
  await page.getByRole('dialog').getByLabel('Details for the family').fill('');
  await page.getByRole('button', {
    name: 'Remove photo',
    exact: true
  }).click();
  await page.getByRole('dialog').getByRole('button', {
    name: 'Save',
    exact: true
  }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const cleared = await (await apiCtx.get(`/api/shopping/lists/${target.id}/items`)).json();
  expect(cleared[0].notes).toBeNull();
  expect(cleared[0].photo).toBeNull();
});
test('real meal plan selects its recipe and only selected missing ingredients reach the list', async ({
  authedPage: page,
  apiCtx
}) => {
  // The shared worker family retains other specs' plans. Give this case its own
  // browser day so the meal card has exactly one planned recipe to select.
  await page.clock.setFixedTime(new Date('2031-06-12T12:00:00'));
  const family = await getFamilyId(apiCtx);
  const list = await seedShoppingList(apiCtx, family, 'Recipe ingredients');
  await seedShoppingItem(apiCtx, list.id, 'Pasta', '500 g');
  const salt = await seedShoppingItem(apiCtx, list.id, 'Salt', '1 g');
  await apiCtx.patch(`/api/shopping/items/${salt.id}`, {
    data: {
      checked: true
    }
  });
  const recipeResponse = await apiCtx.post('/api/recipes', {
    data: {
      family_id: family,
      title: 'E2E Supper',
      servings: 4,
      ingredients: [{
        name: 'Pasta',
        amount: 500,
        unit: 'g'
      }, {
        name: 'Salt',
        amount: 1,
        unit: 'g'
      }, {
        name: 'Basil',
        amount: 1,
        unit: 'bunch'
      }, {
        name: 'Cheese',
        amount: 50,
        unit: 'g'
      }]
    }
  });
  expect(recipeResponse.ok()).toBe(true);
  const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
  await seedMealPlan(apiCtx, family, {
    plan_date: today,
    slot: 'evening',
    meal_name: 'E2E Supper'
  });
  await openList(page, 'Recipe ingredients');
  if (await page.locator('.shop-rail').isVisible()) {
    await expect(page.locator('.shop-recipe-card')).toContainText('E2E Supper');
    await page.getByRole('button', {
      name: 'Choose ingredients',
      exact: true
    }).click();
  } else {
    await menu(page);
    await page.getByRole('button', {
      name: 'Ingredients from recipes',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'E2E Supper'
    }).click();
  }
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('checkbox', {
    name: /Pasta/
  })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', {
    name: /Salt/
  })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', {
    name: /Basil/
  })).toBeChecked();
  await dialog.getByRole('checkbox', {
    name: /Cheese/
  }).uncheck();
  await dialog.getByRole('button', {
    name: 'Add selected ingredients'
  }).click();
  await expect(tile(page, 'Basil')).toBeVisible();
  const rows = await (await apiCtx.get(`/api/shopping/lists/${list.id}/items`)).json();
  expect(rows.map(row => row.name).sort()).toEqual(['Basil', 'Pasta', 'Salt']);
  expect(rows.find(row => row.name === 'Pasta').spec).toBe('500 g');
  expect(rows.find(row => row.name === 'Salt').checked).toBe(true);
});

for (const width of [390, 768]) test(`quick-add suggestions stay opaque and reopen at ${width}px`, async ({authedPage:page,apiCtx}) => {
  await page.setViewportSize({width,height:844});
  const family = await getFamilyId(apiCtx);
  const list = await seedShoppingList(apiCtx,family,`Suggestions ${width}`);
  await seedShoppingItem(apiCtx,list.id,'Milk','1 l','Dairy');
  await openList(page,`Suggestions ${width}`);
  for (const theme of ['light','dark']) {
    await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),theme);
    await search(page).fill('');
    await search(page).fill('Mil');
    const suggestions=page.getByRole('listbox',{name:'Product suggestions'});
    await expect(suggestions).toBeVisible();
    const alpha=await suggestions.evaluate(node=>{
      const color=getComputedStyle(node).backgroundColor;
      return color.startsWith('rgba')?Number(color.match(/,\s*([\d.]+)\)$/)[1]):1;
    });
    expect(alpha).toBe(1);
    await search(page).fill('');await expect(suggestions).toHaveCount(0);
    await search(page).fill('Mil');await expect(suggestions).toBeVisible();
    await search(page).press('Escape');await expect(suggestions).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await tile(page,'Milk').click();await expect(search(page)).not.toBeFocused();
  await menu(page);await page.getByRole('button',{name:'Shopping templates',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Your shopping templates'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
