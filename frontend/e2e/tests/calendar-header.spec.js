const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test('calendar header contains wrapped content above month and week headings', async ({
  authedPage: page,
}) => {
  test.setTimeout(120000);
  await navigateTo(page, 'Calendar');
  for (const width of [820, 320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const theme of ['light', 'dark', 'midnight-glass']) {
      await page.evaluate(
        (value) => localStorage.setItem('tribu_theme', value),
        theme,
      );
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const view of ['Month', 'Week']) {
        await page.getByRole('button', { name: view, exact: true }).click();
        await expect(
          page.locator(
            view === 'Month' ? '.tc-calendar-grid, .ui-month-grid' : '.tc-week-grid, .ui-day-strip',
          ),
        ).toBeVisible();
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          );
        });
        const geometry = await page.evaluate(() => {
          const header = [...document.querySelectorAll('.tc-topbar, .ui-mobile-header')].find(el=>el.getBoundingClientRect().height>0);
          const visible = [...header.querySelectorAll('*')].filter((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return (
              style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
            );
          });
          return {
            contentBottom: Math.max(
              ...visible.map((el) => el.getBoundingClientRect().bottom),
            ),
            headerBottom: header.getBoundingClientRect().bottom,
            headingTop: document
              .querySelector('.tc-view-header')
              .getBoundingClientRect().top,
          };
        });
        expect(
          geometry.headingTop,
          `${width}px ${theme} ${view}: ${JSON.stringify(geometry)}`,
        ).toBeGreaterThanOrEqual(geometry.contentBottom);
        expect(geometry.headerBottom).toBeGreaterThanOrEqual(
          geometry.contentBottom,
        );
      }
    }
  }
});
