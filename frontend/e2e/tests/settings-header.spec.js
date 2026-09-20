const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test('settings header contains wrapped content above the overview', async ({ authedPage: page }) => {
  await navigateTo(page, 'Settings');
  for (const width of [820, 320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator('.ms-grid')).toBeVisible();
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations()
        .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {})));
    });
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.tc-topbar');
      const visible = [...header.querySelectorAll('*')].filter(element => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      return {
        contentBottom: Math.max(...visible.map(element => element.getBoundingClientRect().bottom)),
        headerBottom: header.getBoundingClientRect().bottom,
        headingTop: document.querySelector('.ms-header').getBoundingClientRect().top,
      };
    });
    expect(geometry.headerBottom, `${width}px: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(geometry.contentBottom);
    expect(geometry.headingTop).toBeGreaterThanOrEqual(geometry.contentBottom);
  }
});
