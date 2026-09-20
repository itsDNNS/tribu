const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function openSettings(page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const responses = {
      '/auth/me': { id: 1, email: 'dennis@example.com', display_name: 'Dennis', has_completed_onboarding: true, must_change_password: false },
      '/families/me': [{ family_id: 7, family_name: 'Familie Braun', role: 'admin', is_adult: true }],
      '/families/7/members': [{ id: 1, display_name: 'Dennis', role: 'admin', is_adult: true, color: '#73518d' }],
      '/dashboard/summary': { next_events: [], upcoming_birthdays: [] },
      '/calendar/events': { items: [] }, '/tasks': { items: [] },
      '/contacts': [], '/birthdays': [], '/shopping/lists': [], '/notifications': [],
      '/notifications/unread-count': { count: 3 }, '/nav/order': { nav_order: ['dashboard', 'calendar', 'settings'] },
      '/admin/settings/time-format': { time_format: '24h' },
    };
    if (path === '/notifications/stream') return route.fulfill({ status:200, contentType:'text/event-stream',body:'' });
    return route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify(responses[path] ?? {}) });
  });
  await page.goto('/#settings');
  await expect(page.getByRole('heading', { name:'Just the way you like it.' })).toBeVisible();
}

for (const width of [320, 390, 1024, 1440]) {
  test(`settings controls and detail navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:1000 });
    await openSettings(page);
    await expect(page.locator('.ms-card')).toHaveCount(4);
    await expect(page.locator('.dashboard-action-badge')).toHaveText('3');
    await page.getByRole('switch', { name:'Notification badge' }).click();
    await expect(page.locator('.dashboard-action-badge')).toHaveCount(0);
    await page.getByRole('switch', { name:'Compact view' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-dashboard-density','compact');
    await page.getByRole('combobox', { name:'Week starts on' }).selectOption('sunday');
    await page.getByRole('button', { name:'Colour scheme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.reload();
    await expect(page.getByRole('switch', { name:'Compact view' })).toBeChecked();
    await expect(page.getByRole('switch', { name:'Notification badge' })).not.toBeChecked();
    await expect(page.getByRole('combobox', { name:'Week starts on' })).toHaveValue('sunday');
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name:'Account',exact:true }).click();
    await expect(page.getByLabel('Date of birth')).toBeVisible();
    await expect(page.getByRole('combobox', {name:'Settings section'}).locator('option')).toHaveCount(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', {name:'All settings'}).click();
    await expect(page.getByRole('heading', { name:'Just the way you like it.' })).toBeFocused();
    await page.getByRole('combobox', {name:'Language',exact:true}).selectOption('de');
    await expect(page.getByRole('heading', {name:'So, wie es zu euch passt.'})).toBeVisible();
    await page.getByRole('button', {name:'Farbschema',exact:true}).click();
    await page.screenshot({path:test.info().outputPath(`settings-${width}-light.png`), fullPage:true, animations:'disabled'});
    await page.getByRole('button', {name:'Farbschema',exact:true}).click();
    await page.screenshot({path:test.info().outputPath(`settings-${width}-dark.png`), fullPage:true, animations:'disabled'});
    if (width < 768) await page.locator('.mobile-hamburger').click();
    await page.locator('.sidebar .nav-item').filter({hasText:'Dashboard'}).click();
    await expect(page.locator('.bento-grid')).toHaveCSS('gap','12px');
    await expect(page.locator('.dashboard-action-badge')).toHaveCount(0);
  });
}
