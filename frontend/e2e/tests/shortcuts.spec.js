const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingItem, seedShoppingList } = require('../helpers/api-setup');

// Home screen shortcuts (Tribu 2.0, N-3) open straight into the action.
test.describe('Home screen shortcuts', () => {
  test('"New shopping item" opens "+" on shopping', async ({ authedPage: page }) => {
    await page.goto('/?action=new-shopping');
    const sheet = page.getByRole('dialog', { name: 'What would you like to add?' });
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await sheet.getByRole('textbox', { name: 'Quick capture' }).fill('Oat milk');
    await expect(sheet.getByRole('group', { name: 'Type of Oat milk' }).getByRole('button', { name: 'Shopping' })).toHaveAttribute('aria-pressed', 'true');
    // The action leaves the address, so a reload does not reopen it.
    expect(new URL(page.url()).search).toBe('');
  });

  test('"New event" opens "+" on an event', async ({ authedPage: page }) => {
    await page.goto('/?action=new-event');
    const sheet = page.getByRole('dialog', { name: 'What would you like to add?' });
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await sheet.getByRole('textbox', { name: 'Quick capture' }).fill('Parents evening');
    await expect(sheet.getByRole('group', { name: 'Type of Parents evening' }).getByRole('button', { name: 'Event' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('"Start shopping" opens the list in shopping mode', async ({ authedPage: page, apiCtx }) => {
    // Shopping mode needs a list; the worker's family is shared with other specs.
    const list = await seedShoppingList(apiCtx, await getFamilyId(apiCtx), 'Shortcut groceries');
    await seedShoppingItem(apiCtx, list.id, 'Shortcut bread');
    await page.goto('/?action=shopping-trip');
    await expect(page.locator('.shop-trip-banner')).toBeVisible({ timeout: 15000 });
  });
});
