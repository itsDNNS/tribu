const { request } = require('@playwright/test');

async function waitForHealth(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const ctx = await request.newContext();
      try {
        const response = await ctx.get(url, { timeout: 2000 });
        if (response.ok()) {
          return;
        }
        lastError = new Error(`${url} returned ${response.status()}`);
      } finally {
        await ctx.dispose();
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`);
}

/**
 * Registers a throwaway user so the SetupWizard (first-run screen) is bypassed.
 * If the user already exists (e.g. from a previous run), that's fine.
 */
module.exports = async function globalSetup(config) {
  const baseURL =
    config.projects?.[0]?.use?.baseURL ||
    process.env.BASE_URL ||
    'http://localhost:3000';

  if (process.env.E2E_BACKEND_HEALTH_URL) {
    const timeoutMs = Number(process.env.E2E_BACKEND_HEALTH_TIMEOUT_MS || 120000);
    await waitForHealth(process.env.E2E_BACKEND_HEALTH_URL, timeoutMs);
  }

  const ctx = await request.newContext({ baseURL });

  try {
    const status = await ctx.get('/api/setup/status');
    const { needs_setup } = await status.json();

    if (needs_setup) {
      await ctx.post('/api/auth/register', {
        data: {
          email: 'setup@example.com',
          password: 'Setup1234',
          display_name: 'Setup',
          family_name: 'Setup Family',
        },
      });
    }
  } catch {
    // Server might not be running yet during `--list`, ignore
  } finally {
    await ctx.dispose();
  }
};
