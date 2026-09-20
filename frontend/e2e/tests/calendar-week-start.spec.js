const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

async function openAccountSettings(page) {
  await navigateTo(page, 'Settings');

  const accountItem = page.getByRole('button', { name: 'Account', exact: true });
  const weekStartGroup = page.getByRole('group', { name: 'Week starts on' });
  await expect(accountItem.or(weekStartGroup).first()).toBeVisible({ timeout: 10000 });
  if (await accountItem.isVisible().catch(() => false)) {
    await accountItem.click();
  }
  await expect(weekStartGroup).toBeVisible({ timeout: 10000 });
  return weekStartGroup;
}

test.describe('Calendar week-start preference', () => {
  test('switches at runtime, persists across reload, and restores Monday', async ({ authedPage: page }) => {
    await page.evaluate(() => localStorage.removeItem('tribu_week_start'));
    await page.reload();

    await navigateTo(page, 'Calendar');
    await expect(page.locator('.tc-weekday').first()).toHaveText('Monday');

    let group = await openAccountSettings(page);
    const sundayButton = group.getByRole('button', { name: 'Sunday' });
    await sundayButton.click();
    await expect(sundayButton).toHaveAttribute('aria-pressed', 'true');

    await navigateTo(page, 'Calendar');
    await expect(page.locator('.tc-weekday').first()).toHaveText('Sunday');
    const sundayMonthAlignment = await page.locator('.tc-calendar-grid').evaluate((grid) => {
      const cells = Array.from(grid.querySelectorAll('.tc-calendar-day'));
      return cells.findIndex((cell) => !cell.classList.contains('outside'));
    });
    const expectedSundayOffset = await page.evaluate(() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    });
    expect(sundayMonthAlignment).toBe(expectedSundayOffset);

    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('.tc-week-heading').first()).toContainText(/^Sunday/);

    await page.reload();
    await expect(page.locator('.tc-weekday').first()).toHaveText('Sunday');

    group = await openAccountSettings(page);
    const mondayButton = group.getByRole('button', { name: 'Monday' });
    await mondayButton.click();
    await expect(mondayButton).toHaveAttribute('aria-pressed', 'true');

    await navigateTo(page, 'Calendar');
    await expect(page.locator('.tc-weekday').first()).toHaveText('Monday');
  });
});
