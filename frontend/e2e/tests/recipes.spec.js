const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingList } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');
const { selectShoppingList } = require('../helpers/shopping');

test.describe('Recipes', () => {
  async function expectRecipeDialogInViewport(page) {
    const metrics = await page.locator('.recipe-dialog').evaluate((dialog) => {
      const dialogRect = dialog.getBoundingClientRect();
      const backdropRect = document.querySelector('.cal-dialog-backdrop').getBoundingClientRect();
      return {
        dialogTop: dialogRect.top,
        dialogBottom: dialogRect.bottom,
        backdropTop: backdropRect.top,
        backdropLeft: backdropRect.left,
        backdropRight: backdropRect.right,
        backdropBottom: backdropRect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(metrics.backdropTop).toBe(0);
    expect(metrics.backdropLeft).toBe(0);
    expect(metrics.backdropRight).toBe(metrics.viewportWidth);
    expect(metrics.backdropBottom).toBe(metrics.viewportHeight);
    expect(metrics.dialogTop).toBeGreaterThanOrEqual(0);
    expect(metrics.dialogBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  }

  test('create a recipe, push ingredients to shopping, and copy it into a meal plan', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Recipe Shopping List');
    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 15000 });

    await navigateTo(page, 'Recipes');
    await page.getByRole('button', { name: 'Add recipe' }).click();
    await expectRecipeDialogInViewport(page);

    await page.getByRole('dialog', { name: 'Add recipe' }).getByPlaceholder('e.g. Tomato pasta').fill('Playwright Pancakes');
    await page.getByPlaceholder('Servings').fill('4');
    await page.getByPlaceholder('quick, vegetarian, weekday').fill('breakfast, test');
    await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.locator('.recipe-ingredient-name').first().fill('Flour');
    await page.locator('.recipe-ingredient-amount').first().fill('200');
    await page.locator('.recipe-ingredient-unit').first().fill('g');
    await page.getByRole('button', { name: 'Add ingredient' }).click();
    await page.locator('.recipe-ingredient-name').nth(1).fill('Milk');
    await page.locator('.recipe-ingredient-amount').nth(1).fill('300');
    await page.locator('.recipe-ingredient-unit').nth(1).fill('ml');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: 'Playwright Pancakes' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('2 ingredients')).toBeVisible();

    await page.getByRole('button', { name: 'Add Playwright Pancakes to favorites' }).click();
    await expect(page.getByText('Favorite')).toBeVisible({ timeout: 10000 });

    // The recipe opens to cook from; servings scale there (discussion #511).
    await page.getByRole('button', { name: 'Playwright Pancakes', exact: true }).click();
    const detail = page.locator('.recipe-detail');
    await expect(detail.getByRole('heading', { name: 'Playwright Pancakes' })).toBeVisible();
    for (let i = 0; i < 4; i += 1) await detail.getByRole('button', { name: 'More servings' }).click();
    await expect(detail.getByText('400 g')).toBeVisible();
    await expect(detail.getByText('600 ml')).toBeVisible();
    await detail.locator('.recipe-detail-push select').selectOption({ label: 'Recipe Shopping List' });
    await detail.getByRole('button', { name: 'To shopping list (2)' }).click();
    await expect(page.getByLabel('Notifications').getByText('2 ingredients pushed to the shopping list')).toBeVisible({ timeout: 10000 });
    await detail.getByRole('button', { name: 'All recipes' }).click();

    await navigateTo(page, 'Shopping');
    await selectShoppingList(page, 'Recipe Shopping List');
    await expect(page.getByRole('checkbox', { name: 'Flour' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();
    // Each ingredient says which recipe it is for (Tribu 2.0, L5).
    await expect(page.locator('.shop-tile').filter({ hasText: 'Flour' })).toContainText('for Playwright Pancakes');

    await navigateTo(page, 'Meal plan');
    // New meals start from an empty slot of the week.
    await page.locator('.meal-grid-cell-empty, .meal-slot.empty').first().click();
    await expect(page.getByRole('dialog', { name: 'Plan a meal' })).toBeVisible();
    await page.getByLabel('Recipe', { exact: true }).selectOption({ label: 'Playwright Pancakes' });
    await expect(page.getByPlaceholder('e.g. Spaghetti Bolognese')).toHaveValue('Playwright Pancakes');
    await expect(page.locator('.meal-ingredient-name').first()).toHaveValue('Flour');
    await expect(page.locator('.meal-ingredient-name').nth(1)).toHaveValue('Milk');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('dialog', { name: 'Plan a meal' })).toBeHidden();
    const savedMeal = page.locator('.meal-plans-page').getByRole('button', { name: /Playwright Pancakes/ });
    // The wide grid also exposes a move button; target the actual meal title.
    const mealCard = savedMeal.filter({ hasText: 'Playwright Pancakes' });
    await expect(mealCard).toBeVisible({ timeout: 10000 });
    if (await page.locator('.meal-plans-page').getAttribute('data-density') === 'wide') {
      await expect(mealCard.locator('.meal-cell-meta')).toHaveText('2 ingredients');
    }
    await mealCard.click();
    const mealDialog = page.getByRole('dialog', { name: 'Edit meal' });
    await expect(mealDialog.locator('.meal-ingredient-name')).toHaveCount(2);
    await expect(mealDialog.locator('.meal-ingredient-name').nth(0)).toHaveValue('Flour');
    await expect(mealDialog.locator('.meal-ingredient-amount').nth(0)).toHaveValue('200');
    await expect(mealDialog.locator('.meal-ingredient-unit').nth(0)).toHaveValue('g');
    await expect(mealDialog.locator('.meal-ingredient-name').nth(1)).toHaveValue('Milk');
    await expect(mealDialog.locator('.meal-ingredient-amount').nth(1)).toHaveValue('300');
    await expect(mealDialog.locator('.meal-ingredient-unit').nth(1)).toHaveValue('ml');
  });
});
