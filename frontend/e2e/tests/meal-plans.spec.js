const { test, expect, request } = require('@playwright/test');
test.use({viewport:{width:1448,height:1000},serviceWorkers:'block'});
const { getFamilyId, seedShoppingList, seedMealPlan } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');
const { selectShoppingList } = require('../helpers/shopping');

function formatIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function registerWorkerUser(baseURL, browserName) {
  const api = await request.newContext({ baseURL });
  const suffix = `${browserName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await api.post('/api/auth/register', {
    data: {
      email: `weekly-meal-${suffix}@example.com`,
      password: 'Password123!',
      display_name: 'Weekly Meal E2E',
      family_name: 'Weekly Meal Family',
    },
  });

  if (!response.ok()) {
    throw new Error(`Register worker user failed (${response.status()}): ${await response.text()}`);
  }

  const storageState = await api.storageState();
  return { api, cookies: storageState.cookies };
}

test.describe('Meal plan', () => {
  test('is available with demo meals in demo mode', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.getByRole('button', { name: /try demo/i }).first().click();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 90000 });

    await navigateTo(page, 'Meal plan');

    await expect(page.locator('.meal-plans-page')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'Meal plan' })).toBeVisible();
    const firstDayHeader = page.locator('.meal-grid-day-header').first();
    await expect(firstDayHeader.locator('.meal-grid-day-name')).toHaveText('Sunday');
    await expect(firstDayHeader.locator('.meal-grid-day-date')).toHaveText(/\d{1,2}\/\d{1,2}/);
    await expect(page.locator('.meal-week-nav-label')).toHaveText(/\d{1,2}\/\d{1,2}\/\d{4}/);
    await expect(page.getByText(/Porridge with berries|Porridge mit Beeren/)).toBeVisible();
    await expect(page.getByText('Not available in demo mode')).toHaveCount(0);

    // New meals start from an empty slot.
    await page.locator('.meal-grid-cell-empty, .meal-slot.empty').first().click();
    await page.getByPlaceholder(/Spaghetti/).fill('Demo soup');
    await page.getByRole('button', { name: /Save|Speichern/ }).click();
    await expect(page.getByText('Demo soup')).toBeVisible();

    await navigateTo(page, 'Tasks');
    await expect(page.getByRole('heading', { name: /Tasks|Aufgaben/ })).toBeVisible();
    await navigateTo(page, 'Meal plan');
    await expect(page.getByText('Demo soup')).toBeVisible();
  });

  test('moves a demo meal with the native slot picker', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.getByRole('button', { name: /try demo/i }).first().click();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 90000 });

    await navigateTo(page, 'Meal plan');

    const mealCell = page.locator('.meal-grid-cell-filled').first();
    await expect(mealCell).toBeVisible({ timeout: 30000 });
    const mealName = (await mealCell.locator('.meal-cell-title').innerText()).trim();

    await mealCell.locator('.meal-cell-grip-btn').click();
    const moveSelect = mealCell.locator('.meal-cell-move-select');
    await expect(moveSelect).toBeVisible();

    const targetValue = await moveSelect.evaluate((select) => (
      Array.from(select.options).find((option) => option.value !== select.value)?.value
    ));
    expect(targetValue).toBeTruthy();
    const targetSlot = targetValue.split(':')[1];
    await moveSelect.selectOption(targetValue);

    const movedMealCell = page
      .locator(`.meal-grid-cell-filled.meal-grid-slot-${targetSlot}`)
      .filter({ hasText: mealName });
    await expect(movedMealCell).toBeVisible({ timeout: 30000 });
  });

  test('an empty slot suggests what the family cooked lately', async ({ page, baseURL, browserName }) => {
    const workerUser = await registerWorkerUser(baseURL, browserName);
    await page.context().addCookies(workerUser.cookies);
    try {
      const familyId = await getFamilyId(workerUser.api);
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      await seedMealPlan(workerUser.api, familyId, {
        plan_date: formatIsoDate(lastWeek),
        slot: 'evening',
        meal_name: 'Lentil curry',
        ingredients: [{ name: 'Lentils', amount: 250, unit: 'g' }],
      });

      await page.goto('/');
      await navigateTo(page, 'Meal plan');
      await expect(page.locator('.meal-plans-page')).toBeVisible({ timeout: 30000 });
      await page.locator('.meal-grid-cell-empty, .meal-slot.empty').first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Lentil curry, cooked lately' }).click();
      await expect(dialog.getByPlaceholder(/Spaghetti/)).toHaveValue('Lentil curry');
      await expect(dialog.locator('input[value="Lentils"]')).toHaveCount(1);
    } finally {
      await workerUser.api.dispose();
    }
  });

  test('pushes the current week ingredients to a shopping list', async ({ page, baseURL, browserName }) => {
    const workerUser = await registerWorkerUser(baseURL, browserName);
    await page.context().addCookies(workerUser.cookies);

    try {
      const familyId = await getFamilyId(workerUser.api);
      const targetList = await seedShoppingList(workerUser.api, familyId, 'Weekly Groceries');
      const today = formatIsoDate(new Date());

      await seedMealPlan(workerUser.api, familyId, {
        plan_date: today,
        slot: 'morning',
        meal_name: 'Pancakes',
        ingredients: [
          { name: 'Flour', amount: 500, unit: 'g' },
          { name: 'Milk', amount: 1, unit: 'l' },
        ],
      });
      await seedMealPlan(workerUser.api, familyId, {
        plan_date: today,
        slot: 'noon',
        meal_name: 'Pasta',
        ingredients: [
          { name: 'flour', amount: 250, unit: 'g' },
          { name: 'Basil', amount: null, unit: null },
        ],
      });

      await page.goto('/#meal_plans', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((error) => {
        if (!String(error).includes('ERR_ABORTED')) throw error;
      });
      await page.locator('#main-content').waitFor({ state: 'attached', timeout: 90000 });

      await expect(page.getByText('Pancakes')).toBeVisible({ timeout: 90000 });
      await expect(page.getByText('Pasta')).toBeVisible({ timeout: 90000 });
      const pushResponse = page.waitForResponse((response) => (
        response.url().includes('/api/meal-plans/week/add-to-shopping')
        && response.request().method() === 'POST'
      ));
      // M3: the week's ingredients, merged by name, previewed in a sheet.
      await expect(page.locator('.meal-week-shopping')).toContainText('3 ingredients from 2 meals');
      await page.getByRole('button', { name: 'Review and add' }).click();
      const sheet = page.getByRole('dialog', { name: "This week's ingredients" });
      await expect(sheet.locator('.meal-ingredients-preview li')).toHaveCount(3);
      await expect(sheet).toContainText('500 g + 250 g');
      await expect(sheet.getByRole('combobox')).toHaveValue(String(targetList.id));
      await sheet.getByRole('button', { name: 'Add to the list' }).click();
      const response = await pushResponse;
      expect(response.ok()).toBeTruthy();
      await expect(page.getByLabel('Notifications').getByText('3 ingredients pushed to the shopping list')).toBeVisible({ timeout: 30000 });

      await navigateTo(page, 'Shopping');

      await selectShoppingList(page, 'Weekly Groceries');
      await expect(page.getByRole('checkbox', { name: 'Flour' })).toBeVisible({ timeout: 30000 });
      await expect(page.getByText('750 g')).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible({ timeout: 30000 });
      await expect(page.getByText('1 l')).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('checkbox', { name: 'Basil' })).toBeVisible({ timeout: 30000 });
    } finally {
      await workerUser.api.dispose();
    }
  });
});
