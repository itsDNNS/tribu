const { test, expect } = require('../helpers/fixtures');
test.use({viewport:{width:1448,height:1000},serviceWorkers:'block'});
const { navigateTo } = require('../helpers/navigation');

// The week start belongs to this device (Settings › This device).
async function openWeekStart(page) {
  await navigateTo(page, 'Settings');
  const weekStart = page.getByRole('region', { name: 'This device' }).getByRole('combobox', { name: 'Week starts on' });
  await expect(weekStart).toBeVisible({ timeout: 10000 });
  return weekStart;
}

test.describe('Calendar week-start preference', () => {
  test('switches at runtime, persists across reload, and restores Monday', async ({ authedPage: page }) => {
    await page.evaluate(() => localStorage.removeItem('tribu_week_start'));
    await page.reload();

    await navigateTo(page, 'Calendar');
    await expect(page.locator('.tc-weekday').first()).toHaveText('Monday');

    let weekStart = await openWeekStart(page);
    await weekStart.selectOption('sunday');
    await expect(weekStart).toHaveValue('sunday');

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

    weekStart = await openWeekStart(page);
    await expect(weekStart).toHaveValue('sunday');
    await weekStart.selectOption('monday');
    await expect(weekStart).toHaveValue('monday');

    await navigateTo(page, 'Calendar');
    await expect(page.locator('.tc-weekday').first()).toHaveText('Monday');
  });
});
