const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent, seedShoppingItem, seedShoppingList } = require('../helpers/api-setup');

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

// Pin every part of the day to "day" so the stage never looks ahead to tomorrow during a CI run.
const ALWAYS_DAY = { morning_start: '00:00', morning_end: '00:00', evening_start: '00:00', night_start: '00:00' };

// An event start that is still today, so it shows in the hero regardless of when the suite runs.
function soonToday() {
  const start = new Date(Date.now() + 10 * 60 * 1000);
  return start.getDate() === new Date().getDate() ? start : new Date(Date.now() - 5 * 60 * 1000);
}

function localDateTimeInputValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

test.describe('Display mode', () => {
  test('renders the paired wall display without normal app bootstrap or personal data', async ({ page, apiCtx, testUser }) => {
    const familyId = await getFamilyId(apiCtx);
    const membersRes = await apiCtx.get(`/api/families/${familyId}/members`);
    expect(membersRes.ok()).toBeTruthy();
    const members = await membersRes.json();
    const currentMember = members.find((member) => member.email === testUser.email);
    expect(currentMember).toBeTruthy();

    const colorRes = await apiCtx.patch(`/api/families/${familyId}/members/me/color`, {
      data: { color: '#7c3aed' },
    });
    expect(colorRes.ok()).toBeTruthy();

    const start = soonToday();
    await seedCalendarEvent(apiCtx, familyId, {
      title: 'Dinner Plan',
      starts_at: localDateTimeInputValue(start),
      ends_at: localDateTimeInputValue(new Date(start.getTime() + 60 * 60 * 1000)),
      assigned_to: [currentMember.user_id],
    });
    const created = await createDisplayDevice(apiCtx, familyId, 'Kitchen Tablet', {
      layout_config: { version: 2, day_parts: ALWAYS_DAY },
    });

    const requested = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/')) requested.push(url);
    });

    await gotoDisplayWithToken(page, created.token);

    const stage = page.getByTestId('display-dashboard');
    await expect(stage).toBeVisible({ timeout: 15000 });
    await expect(stage).toHaveAttribute('data-layout-preset', 'stage');
    await expect(stage).toHaveAttribute('data-day-part', 'day');
    await expect(page.getByTestId('display-focus')).toContainText('Dinner Plan');
    await expect(page.getByTestId('display-event-participants')).toHaveAttribute('aria-label', '1 participants');
    for (const zone of ['a', 'b', 'c', 'd']) await expect(page.getByTestId(`display-zone-${zone}`)).toBeVisible();
    // No weather place is configured, so the header shows no weather.
    await expect(page.getByTestId('display-weather')).toHaveCount(0);

    await expect(page).toHaveURL(/\/display$/);
    await expect(page.getByText(testUser.email)).toHaveCount(0);
    await expect(page.locator('#main-content')).toHaveCount(0);

    expect(requested.some((url) => url.includes('/api/auth/me'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/families/me'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/display/me'))).toBe(true);
    expect(requested.some((url) => url.includes('/api/display/dashboard'))).toBe(true);

    // Glance test: the clock stays legible from across a kitchen.
    const clockFontPx = await page.getByTestId('display-time').evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(clockFontPx).toBeGreaterThanOrEqual(48);

    // Privacy audit: no e-mail-shaped strings or `ID:` labels in the rendered DOM,
    // and the stage fits the screen without horizontal scrolling.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+/i);
    expect(bodyText).not.toMatch(/\bID:\s*\d+/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('shows the cards chosen for a zone', async ({ page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const list = await seedShoppingList(apiCtx, familyId, 'Display groceries');
    await seedShoppingItem(apiCtx, list.id, 'Oat milk');
    const created = await createDisplayDevice(apiCtx, familyId, 'Hall Display', {
      layout_config: { version: 2, day_parts: ALWAYS_DAY, zones: { a: { cards: ['shopping'], interval_seconds: 60 } } },
    });

    await gotoDisplayWithToken(page, created.token);

    const zone = page.getByTestId('display-zone-a');
    await expect(zone).toHaveAttribute('data-card', 'shopping', { timeout: 15000 });
    await expect(zone).toContainText('Oat milk');
  });

  test('renders an e-ink display on the stage layout', async ({ page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedCalendarEvent(apiCtx, familyId, { title: 'Morning Agenda', starts_at: localDateTimeInputValue(soonToday()) });
    const created = await createDisplayDevice(apiCtx, familyId, 'Kitchen E-Ink', {
      display_mode: 'eink',
      refresh_interval_seconds: 900,
      layout_config: { version: 2, day_parts: ALWAYS_DAY },
    });

    await gotoDisplayWithToken(page, created.token);

    const dashboard = page.getByTestId('display-dashboard');
    await expect(dashboard).toBeVisible({ timeout: 15000 });
    await expect(dashboard).toHaveAttribute('data-display-mode', 'eink');
    await expect(dashboard).toHaveAttribute('data-layout-preset', 'stage');
    await expect(page.getByTestId('display-focus')).toContainText('Morning Agenda');
    await expect(page.locator('.stage-progress')).toHaveCount(0);
  });

  test('serves an e-ink picture for frames without a browser', async ({ apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedCalendarEvent(apiCtx, familyId, { title: 'Frame Agenda', starts_at: localDateTimeInputValue(soonToday()) });
    const created = await createDisplayDevice(apiCtx, familyId, 'Hallway Frame', {
      display_mode: 'eink',
      layout_config: { version: 2, eink_format: 'large' },
    });
    const size = (buffer) => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];

    const picture = await apiCtx.get('/display/image.png', { headers: { Authorization: `Bearer ${created.token}` } });
    expect(picture.status()).toBe(200);
    expect(picture.headers()['content-type']).toBe('image/png');
    const body = await picture.body();
    expect(body.subarray(1, 4).toString()).toBe('PNG');
    expect(size(body)).toEqual([1200, 825]);

    const compact = await apiCtx.get(`/display/image.png?token=${encodeURIComponent(created.token)}&format=compact`);
    expect(size(await compact.body())).toEqual([800, 480]);

    expect((await apiCtx.get('/display/image.png')).status()).toBe(401);
    await revokeDisplayDevice(apiCtx, familyId, created.device.id);
    const revoked = await apiCtx.get('/display/image.png', { headers: { Authorization: `Bearer ${created.token}` } });
    expect(revoked.headers()['x-tribu-display-state']).toBe('revoked');
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
