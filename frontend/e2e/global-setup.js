const { request } = require('@playwright/test');

/**
 * Registers a throwaway user so the SetupWizard (first-run screen) is bypassed.
 * If the user already exists (e.g. from a previous run), that's fine.
 */
module.exports = async function globalSetup(config) {
  const baseURL =
    config.projects?.[0]?.use?.baseURL ||
    process.env.BASE_URL ||
    'http://localhost:3000';

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
