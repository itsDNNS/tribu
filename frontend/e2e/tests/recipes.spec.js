const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingList } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

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

    await page.getByRole('button', { name: 'Edit recipe "Playwright Pancakes"' }).click();
    await page.getByLabel('Scale to servings').fill('8');
    await expect(page.locator('.recipe-scale-preview').getByText('400 g')).toBeVisible();
    await expect(page.locator('.recipe-scale-preview').getByText('600 ml')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Edit recipe' })).toBeVisible();
    await page.locator('.recipe-push-btn').click();
    await expect(page.getByLabel('Notifications').getByText('2 ingredients pushed to the shopping list')).toBeVisible({ timeout: 10000 });
    await page.locator('.recipe-form-actions-right').getByRole('button', { name: 'Cancel' }).click();

    await navigateTo(page, 'Shopping');
    await page.getByText('Recipe Shopping List').click();
    await expect(page.getByRole('checkbox', { name: 'Flour' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('checkbox', { name: 'Milk' })).toBeVisible();

    await navigateTo(page, 'Meal plan');
    await page.getByRole('button', { name: 'Plan a meal' }).click();
    await expect(page.getByRole('dialog', { name: 'Plan a meal' })).toBeVisible();
    await page.getByLabel('Recipe').selectOption({ label: 'Playwright Pancakes' });
    await expect(page.getByPlaceholder('e.g. Spaghetti Bolognese')).toHaveValue('Playwright Pancakes');
    await expect(page.locator('.meal-ingredient-name').first()).toHaveValue('Flour');
    await expect(page.locator('.meal-ingredient-name').nth(1)).toHaveValue('Milk');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Playwright Pancakes')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.meal-cell-meta', { hasText: '2 ingredients' })).toBeVisible();
  });
});
