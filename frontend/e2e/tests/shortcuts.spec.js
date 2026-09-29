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

// Sharing into Tribu (Tribu 2.0, N-5): the manifest's share_target opens
// "+" with what was shared.
test('text shared from another app opens "+" with it', async ({ authedPage: page }) => {
  const manifest = await (await page.request.get('/manifest.json')).json();
  expect(manifest.share_target).toMatchObject({ action: '/', method: 'GET' });

  await page.goto('/?share_title=Parmesan&share_text=Parmesan%0AOat%20milk');
  const sheet = page.getByRole('dialog', { name: 'What would you like to add?' });
  await expect(sheet).toBeVisible({ timeout: 15000 });
  await expect(sheet.getByRole('textbox', { name: 'Quick capture' })).toHaveValue('Parmesan\nOat milk');
  await expect(sheet.getByRole('group', { name: 'Type of Oat milk' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');

  // Closing it and opening "+" again starts empty.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'New', exact: true }).first().click();
  await expect(sheet.getByRole('textbox', { name: 'Quick capture' })).toHaveValue('');
});
});
