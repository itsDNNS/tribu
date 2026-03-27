const { test: base, expect } = require('@playwright/test');
const { createTestUser } = require('./auth');

/**
 * Custom fixtures:
 *  - workerUser — one user per worker (registered + logged in once)
 *  - testUser   — alias for workerUser
 *  - authedPage — page with auth cookie, on the dashboard (NO API login call)
 *  - apiCtx     — page.request with auth cookie (for seeding data)
 */
const test = base.extend({
  // Register + login once per worker. Store the cookies so we don't
  // hit the 20 req/min login rate limit.
  workerUser: [async ({ playwright }, use) => {
    const user = createTestUser();
    const baseURL = process.env.BASE_URL || 'http://localhost:3000';
    const ctx = await playwright.request.newContext({ baseURL });

    // Register
    const regRes = await ctx.post('/api/auth/register', {
      data: {
        email: user.email,
        password: user.password,
        display_name: user.displayName,
        family_name: user.familyName,
      },
    });
    if (!regRes.ok()) {
      const body = await regRes.text();
      throw new Error(`Register worker user failed (${regRes.status()}): ${body}`);
    }

    // The register call sets the auth cookie. Grab it.
    const state = await ctx.storageState();
    user.cookies = state.cookies;

    await ctx.dispose();
    await use(user);
  }, { scope: 'worker' }],

  testUser: async ({ workerUser }, use) => {
    await use(workerUser);
  },

  // Inject the auth cookie directly — zero API calls per test.
  authedPage: async ({ page, workerUser }, use) => {
    if (workerUser.cookies.length > 0) {
      await page.context().addCookies(workerUser.cookies);
    }
    await page.goto('/');
    await page.locator('#main-content').waitFor({ timeout: 15000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await use(page);
  },

  apiCtx: async ({ authedPage }, use) => {
    await use(authedPage.request);
  },
});

module.exports = { test, expect };
