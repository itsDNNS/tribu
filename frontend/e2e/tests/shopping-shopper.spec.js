const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingItem, seedShoppingList } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

// "Anna is shopping right now" (Tribu 2.0, L4): shopping mode on one
// device shows on everyone else's Today and shopping list.
test('the family sees who is out shopping', async ({ authedPage: page, apiCtx, browser }) => {
  const familyId = await getFamilyId(apiCtx);
  const list = await seedShoppingList(apiCtx, familyId, 'Shopper groceries');
  await seedShoppingItem(apiCtx, list.id, 'Shopper bread');
  const context = await browser.newContext({ baseURL: process.env.BASE_URL, serviceWorkers: 'block' });
  let memberId, invite;
  try {
    const invitation = await apiCtx.post(`/api/families/${familyId}/invitations`, {
      data: { role_preset: 'member', is_adult_preset: true, max_uses: 1 },
    });
    expect(invitation.ok()).toBeTruthy();
    invite = await invitation.json();
    const registered = await context.request.post('/api/auth/register-with-invite', {
      data: { token: invite.token, email: `shopper-${Date.now()}@example.com`, password: 'Shopper1234', display_name: 'Annika Shopper' },
    });
    expect(registered.ok(), await registered.text()).toBeTruthy();
    memberId = (await (await context.request.get('/api/auth/me')).json()).user_id;

    const started = await context.request.post(`/api/shopping/lists/${list.id}/trip`, { data: { active: true } });
    expect(started.ok()).toBeTruthy();

    await page.goto('/');
    const hint = page.getByRole('region', { name: 'Shopping' });
    await expect(hint).toContainText('Annika is shopping right now', { timeout: 15000 });
    await hint.getByRole('button', { name: 'See the list' }).click();
    await page.getByRole('button', { name: /Shopper groceries/ }).first().click();
    await expect(page.locator('.shop-shopper')).toHaveText('Annika is shopping right now');

    // Done shopping: the note goes away without reloading.
    await context.request.post(`/api/shopping/lists/${list.id}/trip`, { data: { active: false } });
    await expect(page.locator('.shop-shopper')).toHaveCount(0, { timeout: 10000 });
  } finally {
    await context.close();
    await apiCtx.delete(`/api/shopping/lists/${list.id}`);
    if (memberId) await apiCtx.delete(`/api/families/${familyId}/members/${memberId}`);
    if (invite) await apiCtx.delete(`/api/families/${familyId}/invitations/${invite.id}`);
  }
});
