const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test('settings preferences persist for a real account and all ten sections open', async ({ authedPage: page }) => {
  await navigateTo(page, 'Settings');
  await page.getByRole('switch', { name: 'Compact view', exact: true }).click();
  await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
  await page.getByRole('combobox', { name: 'Week starts on' }).selectOption('sunday');
  await page.getByRole('button', { name: 'Colour scheme' }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-dashboard-density', 'compact');
  // New overview copy uses the explicit English fallback in French.
  await expect(page.getByRole('switch', { name: 'Compact view', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Notification badge', exact: true })).not.toBeChecked();
  await expect(page.locator('.ms-grid select').last()).toHaveValue('sunday');
  await page.locator('.ms-grid select').first().selectOption('en');

  await navigateTo(page, 'Dashboard');
  await expect(page.locator('.bento-grid')).toHaveCSS('gap', '12px');
  await expect(page.locator('.bento-card').first()).toHaveCSS('padding', '8px 12px');
  await navigateTo(page, 'Calendar');
  await expect(page.locator('.tc-weekday').first()).toHaveText('Sunday');
  await navigateTo(page, 'Settings');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const sections = page.getByRole('combobox', { name: 'Settings section' });
  const expected = [
    ['account', 'Account'], ['navigation', 'Navigation'], ['notifications', 'Notifications'],
    ['phone_sync', 'Phone sync'], ['data', 'Data'], ['tokens', 'API Tokens'],
    ['webhooks', 'Automation Webhooks'], ['notification_destinations', 'Household notifications'],
    ['store_links', 'Store searches'], ['about', 'About & Support'],
  ];
  await expect(sections.locator('option')).toHaveCount(10);
  for (const [key, label] of expected) {
    await sections.selectOption(key);
    await expect(page.locator('.ms-header h1')).toHaveText(label);
    await expect(page.locator('.ms-detail > .settings-grid')).toBeVisible();
  }
  await page.getByRole('button', { name: 'All settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Compact view', exact: true }).click();
  await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Compact view', exact: true })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Notification badge', exact: true })).toBeChecked();
  await navigateTo(page, 'Dashboard');
  await expect(page.locator('.bento-grid')).toHaveCSS('gap', '16px');
});
