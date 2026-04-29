const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedHouseholdTemplate } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Household templates', () => {
  test.setTimeout(90000);

  test('shows built-in and custom household templates', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedHouseholdTemplate(apiCtx, familyId, {
      name: 'E2E weekend reset',
      task_items: [{ title: 'Reset backpacks', days_offset: 1 }],
      shopping_items: [{ name: 'Lunch snacks', spec: '5 packs' }],
    });

    await navigateTo(page, 'Templates');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Templates');

    await expect(page.getByRole('heading', { name: 'Built-in gallery' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'School morning routine' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'E2E weekend reset' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Reset backpacks')).toBeVisible();
    await expect(page.getByText('Lunch snacks · 5 packs')).toBeVisible();
  });

  test('creates and applies a household template', async ({ authedPage: page }) => {
    await navigateTo(page, 'Templates');
    await page.getByRole('button', { name: 'New template' }).click();

    await page.locator('.template-editor input').nth(0).fill('E2E prep plan');
    await page.locator('.template-editor input').nth(1).fill('Sunday prep for the family');
    await page.locator('.template-editor input').nth(2).fill('Pack sports bag');
    await page.getByRole('button', { name: 'Add task' }).click();
    await page.locator('.template-editor input').nth(4).fill('Granola bars');
    await page.locator('.template-editor input').nth(5).fill('Box');
    await page.getByRole('button', { name: 'Add shopping item' }).click();
    await page.getByRole('button', { name: 'Save template' }).click();

    await expect(page.getByRole('heading', { name: 'E2E prep plan' })).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder('e.g. Weekly groceries').fill('E2E prep shopping');
    await page.getByRole('button', { name: 'Use template E2E prep plan' }).click();
    await expect(page.getByText('Template applied')).toBeVisible({ timeout: 10000 });

    await navigateTo(page, 'Tasks');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Tasks');
    await expect(page.getByText('Pack sports bag')).toBeVisible({ timeout: 10000 });

    await navigateTo(page, 'Shopping');
    await page.reload();
    await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
    await navigateTo(page, 'Shopping');
    await page.getByText('E2E prep shopping').click();
    await expect(page.locator('[role="checkbox"][aria-label="Granola bars"]')).toBeVisible({ timeout: 10000 });
  });
});
