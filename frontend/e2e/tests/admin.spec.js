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

  test('backup section explains backup readiness without exposing secrets', async ({ authedPage: page }) => {
    await page.context().route(/.*backup\/status.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          database_backend: 'sqlite',
          backup_dir: 'configured_backup_volume',
          has_backups: false,
          latest_backup: null,
          included_domains: ['calendar', 'tasks', 'contacts', 'shopping_lists'],
          excluded_domains: ['jwt_secret', 'oidc_client_secrets', 'reverse_proxy_configuration'],
          restore_supported: 'setup_wizard',
          restore_runbook: 'self_hosting_backup_restore',
        }),
      });
    });

    await navigateTo(page, 'Admin');

    const adminSections = page.getByRole('navigation', { name: 'Admin sections' });
    await adminSections.getByRole('button', { name: 'Members' }).click();
    await adminSections.getByRole('button', { name: 'Backups' }).click();

    await expect(page.getByRole('heading', { name: 'Backups' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Backup confidence')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Database backend')).toBeVisible();
    await expect(page.getByText('Latest export')).toBeVisible();
    await expect(page.getByText('Included data')).toBeVisible();
    await expect(page.getByText('Not included')).toBeVisible();
    await expect(page.getByText('Restore guidance')).toBeVisible();
    await expect(page.getByText(/No export has been created yet\./)).toBeVisible();
    await expect(page.getByText(/OIDC client secrets/i)).toBeVisible();
    await expect(page.getByText('Configured backup volume', { exact: true })).toBeVisible();
    await expect(page.getByText(/JWT_SECRET|DATABASE_URL|tribu_pat_|\/backups|docker-compose\.yml/)).toHaveCount(0);
  });
});
