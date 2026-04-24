const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

function json(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

async function mockApi(page) {
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
    if (path === '/recipes') return json(route, []);
    if (path === '/dashboard/summary') return json(route, { next_events: [], upcoming_birthdays: [] });
    if (path === '/calendar/events') return json(route, { items: [] });
    if (path === '/families/7/members') return json(route, []);
    if (path === '/contacts') return json(route, []);
    if (path === '/birthdays') return json(route, []);
    if (path === '/shopping/lists') return json(route, []);
    if (path === '/tasks') return json(route, { items: [] });
    if (path === '/nav/order') return json(route, { nav_order: ['recipes', 'dashboard', 'settings'] });
    if (path === '/admin/settings/time-format') return json(route, { time_format: '24h' });
    if (path === '/notifications/unread-count') return json(route, { count: 0 });
    if (path === '/notifications') return json(route, []);
    if (path === '/notifications/stream') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
    }
    return json(route, {});
  });
}

test.describe('Recipe dialog layout', () => {
  test('keeps the add recipe dialog and backdrop within the viewport', async ({ page }) => {
    await mockApi(page);

    await page.goto('/#recipes');
    await page.getByRole('button', { name: 'Add recipe' }).click();
    await expect(page.getByRole('dialog', { name: 'Add recipe' })).toBeVisible();

    const metrics = await page.locator('.recipe-dialog').evaluate((dialog) => {
      const dialogRect = dialog.getBoundingClientRect();
      const backdropRect = document.querySelector('.cal-dialog-backdrop').getBoundingClientRect();
      return {
        dialogTop: dialogRect.top,
        dialogBottom: dialogRect.bottom,
        backdropTop: backdropRect.top,
        backdropLeft: backdropRect.left,
        backdropRight: backdropRect.right,
        backdropBottom: backdropRect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(metrics.backdropTop).toBe(0);
    expect(metrics.backdropLeft).toBe(0);
    expect(metrics.backdropRight).toBe(metrics.viewportWidth);
    expect(metrics.backdropBottom).toBe(metrics.viewportHeight);
    expect(metrics.dialogTop).toBeGreaterThanOrEqual(0);
    expect(metrics.dialogBottom).toBeLessThanOrEqual(metrics.viewportHeight);
  });
});
