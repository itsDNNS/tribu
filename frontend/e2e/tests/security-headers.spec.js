const { test, expect } = require('@playwright/test');
const { navigateTo } = require('../helpers/navigation');

test.describe('Security headers', () => {
  test('app pages refuse framing and sniffing', async ({ request }) => {
    for (const path of ['/', '/offline.html']) {
      const response = await request.get(path);
      const headers = response.headers();
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe('same-origin');
      expect(headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    }
  });

  test('the wall display can still be embedded', async ({ request }) => {
    const headers = (await request.get('/display')).headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBeUndefined();
    expect(headers['content-security-policy']).toContain('script-src');
    expect(headers['content-security-policy']).not.toContain('frame-ancestors');
  });

  // CI serves the production build, where the strict script policy applies.
  test('the app runs without script policy or Trusted Types reports', async ({ page }) => {
    const reports = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Trusted ?(Types|HTML|Script)/i.test(message.text())) reports.push(message.text());
    });
    await page.goto('/');
    await page.getByRole('button', { name: /try demo/i }).first().click();
    await expect(page.locator('.app-shell')).toBeVisible();
    for (const view of ['Shopping', 'Calendar', 'Recipes']) {
      await navigateTo(page, view);
    }
    await page.goto('/display');
    await expect(page.getByTestId('display-root')).toBeVisible();
    expect(reports).toEqual([]);
  });
});
