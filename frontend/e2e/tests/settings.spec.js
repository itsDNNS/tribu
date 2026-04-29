const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test.describe('Settings', () => {
  test('open settings and see account tab', async ({ authedPage: page, testUser }) => {
    await navigateTo(page, 'Settings');

    // On mobile, settings shows a list of tabs — click "Account" first
    const accountItem = page.locator('.settings-mobile-item', { hasText: 'Account' });
    if (await accountItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await accountItem.click();
    }

    await expect(page.locator('.profile-name')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.profile-name')).toContainText(testUser.displayName);
    await expect(page.locator('.profile-email')).toContainText(testUser.email);
  });

  test('switch theme and verify data-theme attribute', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');

    // On mobile, click Account tab first
    const accountItem = page.locator('.settings-mobile-item', { hasText: 'Account' });
    if (await accountItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await accountItem.click();
    }

    await page.locator('.profile-name').waitFor({ timeout: 10000 });

    const html = page.locator('html');
    const initialTheme = await html.getAttribute('data-theme');

    const inactiveTheme = page.locator('.theme-item:not(.active)').first();
    if (await inactiveTheme.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inactiveTheme.click();
      const newTheme = await html.getAttribute('data-theme');
      expect(newTheme).not.toBe(initialTheme);
    }
  });

  test('shows push diagnostics when server push is not configured', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');

    const notificationsItem = page.locator('.settings-mobile-item', { hasText: 'Notifications' });
    if (await notificationsItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await notificationsItem.click();
    } else {
      await page.locator('.settings-sidebar-item', { hasText: 'Notifications' }).click();
    }

    await expect(page.getByText('Server push is not configured')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Ask an admin to add VAPID keys on the server and restart Tribu.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable push notifications' })).toBeDisabled();
  });

  test('creates an automation webhook without exposing URL tokens', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');

    const webhooksItem = page.locator('.settings-mobile-item', { hasText: 'Automation Webhooks' });
    if (await webhooksItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await webhooksItem.click();
    } else {
      await page.locator('.settings-sidebar-item', { hasText: 'Automation Webhooks' }).click();
    }

    await page.getByLabel('Name').fill('Home Assistant');
    await page.getByLabel('Webhook URL').fill('https://ha.example/api/webhook/private-token?secret=private');
    await page.getByLabel('Optionaler Secret Header').fill('X-Tribu-Secret');
    await page.getByPlaceholder('Secret Wert').fill('super-secret');
    await page.getByRole('button', { name: 'Webhook hinzufügen' }).click();

    await expect(page.getByText('https://ha.example/[redacted]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Secret Header: X-Tribu-Secret')).toBeVisible();
    await expect(page.getByText(/private-token/)).toHaveCount(0);
    await expect(page.getByText(/super-secret/)).toHaveCount(0);
  });

});
