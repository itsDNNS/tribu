const { test, expect } = require('@playwright/test');
const { mockResponsivePlanner } = require('../helpers/responsive-planner');

test.use({ locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });

// CSS viewports measured on iPhone Duo (iOS 27.2) and Pixel 10 Pro Fold (Chrome 145), in fold order.
const devices = {
  'iPhone Duo': [
    ['cover, Safari', 382, 580],
    ['inner portrait, Safari', 669, 867],
    ['inner landscape, web app', 867, 669],
    ['cover, web app', 382, 678],
    ['inner landscape, Safari', 867, 537],
  ],
  'Pixel Fold': [
    ['outer', 444, 866],
    ['inner', 852, 731],
    ['outer', 444, 866],
  ],
};

async function expectShellFits(page, width) {
  // Polls because the content slides beside the sidebar with a short transition.
  await expect.poll(() => page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    const main = document.querySelector('.main-content').getBoundingClientRect();
    const nav = document.querySelector('.ui-bottom-nav');
    const bottomNav = !!nav && getComputedStyle(nav).display !== 'none';
    const overflow = document.documentElement.scrollWidth > innerWidth;
    if (overflow) return 'overflows sideways';
    if (innerWidth > 768) return !bottomNav && main.left >= sidebar.right - 1 ? 'sidebar beside content' : 'sidebar over content';
    return bottomNav && main.left === 0 ? 'bottom navigation' : 'phone layout broken';
  })).toBe(width > 768 ? 'sidebar beside content' : 'bottom navigation');
}

for (const [device, poses] of Object.entries(devices)) {
  test(`${device}: folding keeps the place and the shell fits every pose`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: poses[0][1], height: poses[0][2] });
    await mockResponsivePlanner(page);
    await page.goto('/#calendar');
    await expect(page.getByRole('heading', { name: 'Kalender', level: 1 })).toBeVisible();
    await page.locator('.ui-agenda-head').first().getByRole('button').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').first().fill('Bleibt beim Falten');

    for (const [pose, width, height] of poses) {
      await test.step(pose, async () => {
        await page.setViewportSize({ width, height });
        await expect(dialog.getByRole('textbox').first()).toHaveValue('Bleibt beim Falten');
        await expectShellFits(page, width);
        expect(new URL(page.url()).hash).toBe('#calendar');
      });
    }
    expect(errors).toEqual([]);
  });
}
