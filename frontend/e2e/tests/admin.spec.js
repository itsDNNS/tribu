const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test.describe('Admin', () => {
  test('admin panel shows member list with own user', async ({ authedPage: page, testUser }) => {
    await navigateTo(page, 'Admin');

    await expect(page.locator('.profile-name', { hasText: testUser.displayName })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.profile-email', { hasText: testUser.email })).toBeVisible();
  });

  test('invite section renders', async ({ authedPage: page }) => {
    await navigateTo(page, 'Admin');

    await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible({ timeout: 10000 });
  });

  test('audit log section renders', async ({ authedPage: page }) => {
    await navigateTo(page, 'Admin');

    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 10000 });
  });
});
