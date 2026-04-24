const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

function json(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

test.describe('Bootstrap', () => {
  test('renders the app shell before slow secondary loaders finish', async ({ page }) => {
    let slowTasksRequested = false;
    const startedAt = Date.now();

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
      if (path === '/dashboard/summary') return json(route, { next_events: [], upcoming_birthdays: [] });
      if (path === '/calendar/events') return json(route, { items: [] });
      if (path === '/families/7/members') return json(route, []);
      if (path === '/contacts') return json(route, []);
      if (path === '/birthdays') return json(route, []);
      if (path === '/shopping/lists') return json(route, []);
      if (path === '/nav/order') return json(route, { nav_order: ['dashboard'] });
      if (path === '/admin/settings/time-format') return json(route, { time_format: '24h' });
      if (path === '/notifications/unread-count') return json(route, { count: 0 });
      if (path === '/notifications') return json(route, []);
      if (path === '/notifications/stream') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
      }
      if (path === '/tasks') {
        slowTasksRequested = true;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(json(route, { items: [] }));
          }, 10000);
        });
      }
      return json(route, {});
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Tester/ })).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveTitle('Tribu');

    expect(slowTasksRequested).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(6000);
  });
});
