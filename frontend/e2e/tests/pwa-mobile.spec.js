const { test, expect } = require('@playwright/test');

test.use({
  serviceWorkers: 'block',
  viewport: { width: 390, height: 844 },
});

function json(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

async function mockAuthenticatedFamily(page) {
  await page.route(/\/api\//, async (route) => {
    const url = new URL(route.request().url());
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
    if (path === '/tasks') return json(route, { items: [] });
    if (path === '/shopping/lists') return json(route, []);
    if (path === '/shopping/categories') return json(route, []);
    if (path === '/shopping/templates') return json(route, []);
    if (path === '/shopping/store-links') return json(route, []);
    if (path === '/activity') return json(route, { items: [] });
    if (path === '/quick-capture') return json(route, { items: [] });
    if (path === '/nav/order') return json(route, { nav_order: ['dashboard', 'calendar', 'shopping', 'tasks', 'activity', 'settings', 'admin'] });
    if (path === '/admin/settings/time-format') return json(route, { time_format: '24h' });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications') return json(route, []);
    if (path === '/notifications/stream') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    }
    return json(route, {});
  });
}

test.describe('PWA mobile app shell', () => {
  test('manifest shortcut query opens the requested mobile destination', async ({ page }) => {
    await mockAuthenticatedFamily(page);

    await page.goto('/?view=shopping', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Shopping', level: 1 })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.shop-mobile-dock')).toBeVisible();
    // Shopping belongs to Lists: the tab and the page chip are current.
    await expect(page.locator('.ui-bottom-nav').getByRole('button', { name: /Lists/ })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: 'Pages in Lists' }).getByRole('button', { name: /Shopping/ })).toHaveAttribute('aria-current', 'page');
  });

  test('manifest exposes install identity and daily shortcuts', async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
      '/?view=dashboard',
      '/?view=calendar',
      '/?view=tasks',
      '/?view=shopping',
    ]);
  });
});
