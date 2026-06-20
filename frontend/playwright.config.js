const { defineConfig, devices } = require('@playwright/test');

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const webServerCommand = process.env.E2E_WEB_SERVER_COMMAND;
const webServerURL = process.env.E2E_WEB_SERVER_URL || baseURL;

module.exports = defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'html' : 'list',

  globalSetup: './e2e/global-setup.js',

  ...(webServerCommand
    ? {
        webServer: {
          command: webServerCommand,
          url: webServerURL,
          timeout: 300 * 1000,
          reuseExistingServer: !process.env.CI,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }
    : {}),

  use: {
    baseURL,
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
