const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test.describe('Admin', () => {
  test('admin panel shows member list with own user', async ({ authedPage: page, testUser }) => {
    await navigateTo(page, 'Admin');

    await expect(page.locator('.profile-name', { hasText: testUser.displayName })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.profile-email', { hasText: testUser.email })).toBeVisible();
  });

  test('admin sections switch through the submenu', async ({ authedPage: page }) => {
    await navigateTo(page, 'Admin');

    const adminSections = page.getByRole('navigation', { name: 'Admin sections' });
    await expect(adminSections.getByRole('button', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Invitations' })).toBeHidden();

    await adminSections.getByRole('button', { name: 'Invitations' }).click();
    await expect(page.getByRole('heading', { name: 'Invitations' })).toBeVisible({ timeout: 10000 });

    await adminSections.getByRole('button', { name: 'Audit Log' }).click();
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Invitations' })).toBeHidden();
  });
});
