let counter = 0;

/**
 * Returns a unique test-user payload.
 * Password satisfies Tribu rules: ≥8 chars, 1 uppercase, 1 digit.
 */
function createTestUser() {
  counter++;
  const id = `${Date.now()}-${counter}`;
  return {
    email: `test-${id}@example.com`,
    password: 'Test1234',
    displayName: `Tester ${counter}`,
    familyName: `Family ${counter}`,
  };
}

/**
 * Register & log in a test user via API, then navigate to the dashboard.
 * Uses page.request so the auth cookie lands in the browser context.
 */
async function loginAsUser(page, user) {
  const res = await page.request.post('/api/auth/register', {
    data: {
      email: user.email,
      password: user.password,
      display_name: user.displayName,
      family_name: user.familyName,
    },
  });

  if (!res.ok()) {
    // User might already exist — try login instead
    const loginRes = await page.request.post('/api/auth/login', {
      data: { email: user.email, password: user.password },
    });
    if (!loginRes.ok()) {
      throw new Error(`Auth failed for ${user.email}: ${loginRes.status()}`);
    }
  }

  await page.goto('/');
  await page.locator('#main-content').waitFor({ timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

module.exports = { createTestUser, loginAsUser };
