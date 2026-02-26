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
});
