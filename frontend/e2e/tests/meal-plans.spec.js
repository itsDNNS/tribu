const { test, expect, request } = require('@playwright/test');
const { getFamilyId, seedShoppingList, seedMealPlan } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

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
  test('pushes the current week ingredients to a shopping list', async ({ page, baseURL, browserName }) => {
    const workerUser = await registerWorkerUser(baseURL, browserName);
    await page.context().addCookies(workerUser.cookies);

    try {
      const familyId = await getFamilyId(workerUser.api);
      await seedShoppingList(workerUser.api, familyId, 'Weekly Groceries');
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
      await page
        .getByRole('button', { name: 'Push all ingredients from this week to a shopping list' })
        .click();

      await navigateTo(page, 'Shopping');

      await expect(page.getByText('Weekly Groceries')).toBeVisible({ timeout: 90000 });
      await page.locator('.shopping-list-card', { hasText: 'Weekly Groceries' }).click();
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
