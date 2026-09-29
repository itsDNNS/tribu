const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test('settings preferences persist for a real account and all eleven sections open', async ({ authedPage: page }) => {
  await navigateTo(page, 'Settings');
  await page.getByRole('switch', { name: 'Compact view', exact: true }).click();
  await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
  await page.getByRole('combobox', { name: 'Week starts on' }).selectOption('sunday');
  await page.getByRole('combobox', { name: 'Appearance' }).selectOption('dark');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-dashboard-density', 'compact');
  // The overview speaks French now (#550).
  await expect(page.getByRole('switch', { name: 'Vue compacte', exact: true })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Pastille de notification', exact: true })).not.toBeChecked();
  await expect(page.locator('.ms-grid select').last()).toHaveValue('sunday');
  await page.locator('.ms-grid select').nth(1).selectOption('en');

  await navigateTo(page, 'Dashboard');
  await expect(page.locator('.today-main')).toHaveCSS('row-gap', '16px');
  await navigateTo(page, 'Calendar');
  await expect(page.locator('.tc-calendar-grid, .ui-day-strip').first()).toBeVisible();
  const compact = await page.locator('.calendar-page').getAttribute('data-density') === 'compact';
  if (compact) {
    // Phones open on the week strip; the month opens from its toggle.
    await expect(page.locator('.ui-day-strip button').first()).toHaveAttribute('aria-label', /^Sunday,/);
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(page.locator('.ui-weekday').first()).toHaveText('Sun');
    await expect(page.locator('[data-date]').first()).toHaveAttribute('aria-label', /^Sunday,/);
  } else {
    await expect(page.locator('.tc-weekday').first()).toHaveText('Sunday');
    await expect(page.locator('[data-date]').first()).toHaveAttribute('aria-label', /^Sunday,/);
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('.tc-week-heading').first()).toContainText(/^Sunday/);
  }
  await navigateTo(page, 'Settings');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const sections = page.getByRole('combobox', { name: 'Settings section' });
  const expected = [
    ['account', 'Account'], ['navigation', 'Navigation'], ['notifications', 'Notifications'],
    ['phone_sync', 'Phone sync'], ['tokens', 'API Tokens'], ['areas', 'Areas'], ['data', 'Data'],
    ['webhooks', 'Automation Webhooks'], ['notification_destinations', 'Household notifications'],
    ['store_links', 'Store searches'], ['about', 'About & Support'],
  ];
  await expect(sections.locator('option')).toHaveCount(11);
  for (const [key, label] of expected) {
    await sections.selectOption(key);
    await expect(page.locator('.ms-list-header h1')).toHaveText(label);
    await expect(page.locator('.ms-detail > .settings-grid')).toBeVisible();
  }
  await page.getByRole('button', { name: 'All settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Compact view', exact: true }).click();
  await page.getByRole('switch', { name: 'Notification badge', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Compact view', exact: true })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Notification badge', exact: true })).toBeChecked();
  await navigateTo(page, 'Dashboard');
  await expect(page.locator('.today-main')).toHaveCSS('row-gap', '24px');
});
