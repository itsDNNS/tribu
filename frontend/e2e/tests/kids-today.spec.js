const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedTask } = require('../helpers/api-setup');

// Today for children (Tribu 2.0, F5): only their own day, and ticking off
// cheers them on.
test('a child sees only their own day and is cheered on', async ({ apiCtx, browser }) => {
  const familyId = await getFamilyId(apiCtx);
  const context = await browser.newContext({ baseURL: process.env.BASE_URL, serviceWorkers: 'block' });
  const taskIds = [];
  let childId, invite;
  try {
    const invitation = await apiCtx.post(`/api/families/${familyId}/invitations`, {
      data: { role_preset: 'member', is_adult_preset: false, max_uses: 1 },
    });
    expect(invitation.ok()).toBeTruthy();
    invite = await invitation.json();
    const registered = await context.request.post('/api/auth/register-with-invite', {
      data: {
        token: invite.token,
        email: `kids-today-${Date.now()}@example.com`,
        password: 'KidsToday1234',
        display_name: 'Kiddo Example',
      },
    });
    expect(registered.ok(), await registered.text()).toBeTruthy();
    childId = (await (await context.request.get('/api/auth/me')).json()).user_id;
    expect((await context.request.post('/api/auth/me/complete-onboarding')).ok()).toBeTruthy();

    const today = new Date().toLocaleDateString('en-CA');
    for (const task of [
      { title: 'Kiddo tidies the room', assigned_to_user_id: childId },
      { title: 'Grown-up tax return' },
    ]) {
      taskIds.push((await seedTask(apiCtx, familyId, { ...task, due_date: `${today}T00:00:00`, due_is_date: true })).id);
    }

    const child = await context.newPage();
    await child.goto('/');
    const day = child.getByRole('region', { name: 'Your day' });
    await expect(day.getByText('Kiddo tidies the room')).toBeVisible({ timeout: 15000 });
    await expect(child.getByText('Grown-up tax return')).toHaveCount(0);
    await expect(child.getByRole('button', { name: 'Suggest something' })).toBeVisible();

    const box = day.getByRole('checkbox', { name: /Kiddo tidies the room/ });
    await box.click();
    await expect(child.getByText('Well done!')).toBeVisible();
    await expect(box).toHaveAttribute('aria-checked', 'true');
  } finally {
    await context.close();
    for (const id of taskIds) await apiCtx.delete(`/api/tasks/${id}`);
    if (childId) expect((await apiCtx.delete(`/api/families/${familyId}/members/${childId}`)).ok()).toBeTruthy();
    if (invite) expect((await apiCtx.delete(`/api/families/${familyId}/invitations/${invite.id}`)).ok()).toBeTruthy();
  }
});
