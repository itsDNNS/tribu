const { test, expect } = require('../helpers/fixtures');
const { createTestUser } = require('../helpers/auth');

test.describe('Authentication', () => {
  test('register a new user', async ({ page }) => {
    const user = createTestUser();
    await page.goto('/');

    // Switch to register tab
    await page.locator('#tab-register').click();
    await page.locator('#panel-register').waitFor();

    // Fill register form
    await page.locator('#register-email').fill(user.email);
    await page.locator('#register-password').fill(user.password);
    await page.locator('#register-name').fill(user.displayName);
    await page.locator('#register-family').fill(user.familyName);

    // Submit
    await page.locator('#panel-register button[type="submit"]').click();

    // Should land on dashboard
    await page.locator('#main-content').waitFor({ timeout: 15000 });
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('logout', async ({ authedPage: page }) => {
    // On mobile, the sidebar logout is hidden; use the mobile-header one
    const viewport = page.viewportSize();
    const isMobile = viewport ? viewport.width < 768 : false;
    if (isMobile) {
      await page.locator('.mobile-header [aria-label="Log out"]').click();
    } else {
      await page.locator('.sidebar-user [aria-label="Log out"]').click();
    }

    // Should see auth page
    await expect(page.locator('#tab-login')).toBeVisible({ timeout: 10000 });
  });

  test('login with existing user', async ({ page, testUser }) => {
    await page.goto('/');
    await page.locator('#tab-login').waitFor({ timeout: 10000 });

    await page.locator('#login-email').fill(testUser.email);
    await page.locator('#login-password').fill(testUser.password);
    await page.locator('#panel-login button[type="submit"]').click();

    await page.locator('#main-content').waitFor({ timeout: 15000 });
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tab-login').waitFor({ timeout: 10000 });

    await page.locator('#login-email').fill('wrong@example.com');
    await page.locator('#login-password').fill('Wrong1234');
    await page.locator('#panel-login button[type="submit"]').click();

    await expect(page.locator('#panel-login [role="alert"]')).toBeVisible({ timeout: 10000 });
  });
});
