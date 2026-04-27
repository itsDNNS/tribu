const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent } = require('../helpers/api-setup');

async function createDisplayDevice(request, familyId, name = 'Kitchen Display') {
  const res = await request.post(`/api/families/${familyId}/display-devices`, {
    data: { name },
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

    await page.goto(`/display?token=${encodeURIComponent(created.token)}`);

    await expect(page.getByTestId('display-dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('display-device-name')).toContainText('Kitchen Tablet');
    await expect(page.getByText('Dinner Plan')).toBeVisible();
    await expect(page.getByText(testUser.displayName)).toBeVisible();

    await expect(page).toHaveURL(/\/display$/);
    await expect(page.getByText(testUser.email)).toHaveCount(0);
    await expect(page.locator('#main-content')).toHaveCount(0);

    expect(requested.some((url) => url.includes('/api/auth/me'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/families/me'))).toBe(false);
    expect(requested.some((url) => url.includes('/api/display/me'))).toBe(true);
    expect(requested.some((url) => url.includes('/api/display/dashboard'))).toBe(true);
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

    await page.goto(`/display?token=${encodeURIComponent(created.token)}`);

    await expect(page.getByTestId('display-state-revoked')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('This display has been removed by an admin.')).toBeVisible();
    expect(authMeRequests).toHaveLength(0);
  });
});
