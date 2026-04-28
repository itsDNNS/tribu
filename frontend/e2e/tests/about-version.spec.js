const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

function json(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

test.describe('About version', () => {
  test('shows date-based build versions with the product prefix', async ({ page }) => {
    await page.route(/https:\/\/api\.github\.com\/repos\/itsDNNS\/tribu\/releases\/latest.*/, async (route) => {
      return json(route, {
        tag_name: 'v2026-04-27.1',
        html_url: 'https://github.com/itsDNNS/tribu/releases/tag/v2026-04-27.1',
      });
    });

    await page.route(/\/api\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace(/^\/api/, '');

      if (path === '/auth/me') {
        return json(route, {
          id: 1,
          email: 'tester@example.com',
          display_name: 'Tester',
          profile_image: '',
          has_completed_onboarding: true,
          must_change_password: false,
        });
      }
      if (path === '/families/me') {
        return json(route, [{ family_id: 7, family_name: 'Test Family', role: 'admin', is_adult: true }]);
      }
      if (path === '/health') return json(route, { status: 'ok', service: 'tribu-api', version: '2026-04-24.412' });
      if (path === '/dashboard/summary') return json(route, { next_events: [], upcoming_birthdays: [] });
      if (path === '/calendar/events') return json(route, { items: [] });
      if (path === '/families/7/members') return json(route, []);
      if (path === '/contacts') return json(route, []);
      if (path === '/birthdays') return json(route, []);
      if (path === '/shopping/lists') return json(route, []);
      if (path === '/tasks') return json(route, { items: [] });
      if (path === '/nav/order') return json(route, { nav_order: ['settings', 'dashboard'] });
      if (path === '/admin/settings/time-format') return json(route, { time_format: '24h' });
      if (path === '/notifications/unread-count') return json(route, { count: 0 });
      if (path === '/notifications') return json(route, []);
      if (path === '/notifications/stream') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
      }
      return json(route, {});
    });

    await page.goto('/#settings');
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      await page.locator('.settings-mobile-item', { hasText: 'About & Support' }).click();
    } else {
      await page.locator('.settings-sidebar-item', { hasText: 'About & Support' }).click();
    }

    await expect(page.getByText('Version: v2026-04-24.412')).toBeVisible();
    await expect(page.getByText(/v2026-04-27\.1 available/)).toBeVisible();
    await expect(page.getByText(/vv2026-04-27/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /View release notes/ })).toHaveAttribute(
      'href',
      'https://github.com/itsDNNS/tribu/releases/tag/v2026-04-27.1',
    );
    const href = await page.getByRole('link', { name: /Report a bug/ }).getAttribute('href');
    expect(decodeURIComponent(href)).toContain('**Tribu Version:** v2026-04-24.412');
  });
});
