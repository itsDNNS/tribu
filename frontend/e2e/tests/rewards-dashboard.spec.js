const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

function json(route, data) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

test.describe('Rewards dashboard widget', () => {
  test('renders translated view-all action', async ({ page }) => {
    await page.route(/\/api\//, async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^\/api/, '');

      if (path === '/auth/me') {
        return json(route, {
          id: 1,
          user_id: 1,
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
      if (path === '/families/7/members') {
        return json(route, [
          { user_id: 1, display_name: 'Tester', role: 'admin', is_adult: true },
          { user_id: 2, display_name: 'Mia', role: 'member', is_adult: false },
        ]);
      }
      if (path === '/dashboard/summary') return json(route, { next_events: [], upcoming_birthdays: [] });
      if (path === '/calendar/events') return json(route, { items: [] });
      if (path === '/contacts') return json(route, []);
      if (path === '/birthdays') return json(route, []);
      if (path === '/tasks') return json(route, { items: [] });
      if (path === '/shopping/lists') return json(route, []);
      if (path === '/nav/order') return json(route, { nav_order: ['dashboard'] });
      if (path === '/admin/settings/time-format') return json(route, { time_format: '24h' });
      if (path === '/notifications/unread-count') return json(route, { count: 0 });
      if (path === '/notifications') return json(route, []);
      if (path === '/notifications/stream') {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
      }
      if (path === '/rewards/currency') return json(route, { id: 1, family_id: 7, name: 'Stars', icon: 'star' });
      if (path === '/rewards/balances') return json(route, { balances: [{ user_id: 2, display_name: 'Mia', balance: 7, pending: 0 }] });
      if (path === '/rewards/catalog') return json(route, []);
      if (path === '/rewards/rules') return json(route, []);
      if (path === '/rewards/transactions') return json(route, { items: [] });

      return json(route, {});
    });

    await page.goto('/');

    const rewardsCard = page.locator('.bento-rewards');
    await expect(rewardsCard).toContainText('Rewards');
    await expect(rewardsCard.getByRole('button', { name: 'View all' })).toBeVisible();
    await expect(rewardsCard).not.toContainText('view_all');
  });
});
