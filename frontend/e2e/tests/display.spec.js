const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent } = require('../helpers/api-setup');

async function createDisplayDevice(request, familyId, name = 'Kitchen Display', config = {}) {
  const res = await request.post(`/api/families/${familyId}/display-devices`, {
    data: { name, ...config },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/families/${familyId}/display-devices failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

async function revokeDisplayDevice(request, familyId, deviceId) {
  const res = await request.delete(`/api/families/${familyId}/display-devices/${deviceId}`);
  if (!res.ok()) {
    throw new Error(`DELETE /api/families/${familyId}/display-devices/${deviceId} failed (${res.status()}): ${await res.text()}`);
  }
}

async function gotoDisplayWithToken(page, token) {
  try {
    await page.goto(`/display?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!String(error).includes('ERR_ABORTED')) throw error;
  }
}

test.describe('Display mode', () => {
  test('renders the paired wall display without normal app bootstrap or personal data', async ({ page, apiCtx, testUser }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedCalendarEvent(apiCtx, familyId, { title: 'Dinner Plan' });
    const created = await createDisplayDevice(apiCtx, familyId, 'Kitchen Tablet');

    const requested = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/')) requested.push(url);
    });

    await gotoDisplayWithToken(page, created.token);

    await expect(page.getByTestId('display-dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('display-widget-home_header')).toBeVisible();
    await expect(page.getByTestId('display-home-header')).toBeVisible();
    // The redesign surfaces the next event in two distinct regions — the
    // hero "focus" card and the agenda list — so scope the assertion to
    // each region to avoid strict-mode ambiguity from the duplicate title.
    await expect(page.getByTestId('display-focus')).toContainText('Dinner Plan');
    await expect(page.getByTestId('display-events')).toContainText('Dinner Plan');
    await expect(page.getByText(testUser.displayName)).toBeVisible();

    await expect(page).toHaveURL(/\/display$/);
    await expect(page.getByText(testUser.email)).toHaveCount(0);
    await expect(page.locator('#main-content')).toHaveCount(0);

    expect(requested.some((url) => url.includes('/api/auth/me'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/families/me'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/display/me'))).toBe(true);
    expect(requested.some((url) => url.includes('/api/display/dashboard'))).toBe(true);

    // Glance test: the hero clock is rendered and large enough to be
    // legible from across a kitchen. We allow some leeway (>= 48px)
    // so the assertion stays robust across viewport sizes.
    const clock = page.getByTestId('display-time');
    await expect(clock).toBeVisible();
    const clockFontPx = await clock.evaluate((el) => {
      const v = window.getComputedStyle(el).fontSize;
      return parseFloat(v);
    });
    expect(clockFontPx).toBeGreaterThanOrEqual(48);

    // Privacy audit: no e-mail-shaped strings, no `ID:` labels, and
    // no source URLs leak into the rendered DOM.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+/i);
    expect(bodyText).not.toMatch(/\bID:\s*\d+/i);

    // The redesign keeps the original section testids so a future
    // styling change can't silently drop a privacy-relevant region.
    await expect(page.getByTestId('display-events')).toBeVisible();
    await expect(page.getByTestId('display-birthdays')).toBeVisible();
    await expect(page.getByTestId('display-members')).toBeVisible();
    await expect(page.getByTestId('display-family-name')).toBeVisible();
  });

  test('renders an e-ink display with the configured layout preset', async ({ page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedCalendarEvent(apiCtx, familyId, { title: 'Morning Agenda' });
    const created = await createDisplayDevice(apiCtx, familyId, 'Kitchen E-Ink', {
      display_mode: 'eink',
      layout_preset: 'eink_agenda',
      refresh_interval_seconds: 900,
      layout_config: {
        columns: 4,
        rows: 3,
        widgets: [
          { id: 'identity', type: 'identity', x: 0, y: 0, w: 2, h: 1 },
          { id: 'agenda-large', type: 'agenda', x: 0, y: 1, w: 4, h: 2 },
        ],
      },
    });

    await gotoDisplayWithToken(page, created.token);

    const dashboard = page.getByTestId('display-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });
    await expect(dashboard).toHaveAttribute('data-display-mode', 'eink');
    await expect(dashboard).toHaveAttribute('data-layout-preset', 'eink_agenda');
    await expect(page.getByTestId('display-widget-agenda')).toHaveCSS('grid-column-start', '1');
    await expect(page.getByTestId('display-events')).toContainText('Morning Agenda');
  });

  test('shows a revoked-device state instead of falling back to a user session', async ({ page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const created = await createDisplayDevice(apiCtx, familyId, 'Hallway Display');
    await revokeDisplayDevice(apiCtx, familyId, created.device.id);

    const authMeRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/auth/me')) authMeRequests.push(url);
    });

    await gotoDisplayWithToken(page, created.token);

    await expect(page.getByTestId('display-state-revoked')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('This display has been removed by an admin.')).toBeVisible();
    expect(authMeRequests).toHaveLength(0);
  });
});
