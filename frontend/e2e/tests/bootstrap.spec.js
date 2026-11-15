const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

function json(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

function mockSignedInApi(page, { onTasks, meRequests = [] } = {}) {
  return page.route(/\/api\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');

    if (path === '/auth/me') {
      meRequests.push(url.pathname);
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
    if (path === '/tasks') return onTasks ? onTasks(route) : json(route, { items: [] });
    return json(route, {});
  });
}

test.describe('Bootstrap', () => {
  test('renders the app shell before slow secondary loaders finish', async ({ page }) => {
    let slowTasksRequested = false;
    const startedAt = Date.now();

    await mockSignedInApi(page, {
      onTasks: (route) => {
        slowTasksRequested = true;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(json(route, { items: [] }));
          }, 10000);
        });
      },
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Tester/ })).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveTitle('Tribu');

    expect(slowTasksRequested).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(6000);
  });

  test('asks for the account once and opens in the stored language without English first', async ({ page }) => {
    const meRequests = [];
    await mockSignedInApi(page, { meRequests });
    await page.addInitScript(() => {
      window.localStorage.setItem('tribu_lang', 'de');
      window.__englishShown = false;
      new MutationObserver(() => {
        if (document.body?.innerText.includes('Shopping')) window.__englishShown = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Tester/ })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByText('Einkauf').first()).toBeAttached();

    expect(await page.evaluate(() => window.__englishShown)).toBe(false);
    expect(meRequests).toHaveLength(1);
  });

  test('keeps the background still for reduced motion and hides it behind the app', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(/\/api\//, (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      if (path === '/auth/me') return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      return json(route, { needs_setup: false });
    });
    await page.goto('/');
    await page.locator('.auth-tab[aria-pressed="true"]').waitFor({ timeout: 10000 });
    const drift = () => page.locator('.mesh-bg').evaluate((el) => getComputedStyle(el, '::before').animationName);
    expect(await drift()).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await drift()).toBe('meshDrift1');

    await page.unroute(/\/api\//);
    await mockSignedInApi(page);
    await page.reload();
    await expect(page.locator('.app-shell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.mesh-bg')).toBeHidden();
  });
});
