const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'html' : 'list',

  globalSetup: './e2e/global-setup.js',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    locale: 'en-US',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
