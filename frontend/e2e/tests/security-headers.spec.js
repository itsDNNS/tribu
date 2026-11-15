const { test, expect } = require('@playwright/test');

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
    expect(headers['content-security-policy']).toBeUndefined();
  });
});
