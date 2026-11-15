const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedShoppingList } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

test.describe('Form accessibility', () => {
  test('sign-up fields are labelled and the password rule is checked before sending', async ({ page }) => {
    await page.goto('/');
    const mode = page.getByRole('group', { name: 'Authentication mode' });
    await expect(mode.getByRole('button', { name: 'Sign in' })).toHaveAttribute('aria-pressed', 'true');
    await mode.getByRole('button', { name: 'Sign up' }).click();
    await expect(mode.getByRole('button', { name: 'Sign up' })).toHaveAttribute('aria-pressed', 'true');

    const password = page.getByLabel('Password', { exact: true });
    await expect(password).toHaveAttribute('autocomplete', 'new-password');
    await expect(password).toHaveAccessibleDescription('Min. 8 characters, 1 uppercase letter, 1 number');

    let registered = false;
    page.on('request', (request) => { if (request.url().includes('/auth/register')) registered = true; });
    await page.getByLabel('Email').fill('rule-check@example.com');
    await password.fill('lowercase1');
    await page.getByLabel('Your name').fill('Rule Check');
    await page.getByLabel('Family name').fill('Rule Family');
    await page.locator('form:has(#register-email) button[type="submit"]').click();

    await expect(password).toHaveAttribute('aria-invalid', 'true');
    await expect(password).toBeFocused();
    expect(registered).toBe(false);
  });

  test('the skip link reaches the sign-in page content', async ({ page }) => {
    await page.goto('/');
    await page.locator('#login-email').waitFor();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  test('the password change fields are reachable by their labels', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');
    const current = page.getByLabel('Current password');
    if (!await current.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByRole('button', { name: 'Account', exact: true }).click();
    }
    await current.fill('Test1234');
    const next = page.getByLabel('New password', { exact: true });
    await next.fill('lowercase1');
    await page.getByLabel('Confirm new password').fill('lowercase1');
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(next).toHaveAttribute('aria-invalid', 'true');
    await expect(next).toBeFocused();
    await expect(page.getByLabel('Current password')).toHaveValue('Test1234');
  });

  test('the invite form is labelled for screen readers and password managers', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const res = await apiCtx.post(`/api/families/${familyId}/invitations`, { data: { role_preset: 'member', is_adult_preset: true } });
    expect(res.ok()).toBeTruthy();
    const { token } = await res.json();

    await page.context().clearCookies();
    await page.goto(`/invite/${token}`);
    await expect(page.getByLabel('Email')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.getByLabel('Password')).toHaveAccessibleDescription('Min. 8 characters, 1 uppercase letter, 1 number');
    await expect(page.getByLabel('Your name')).toHaveAttribute('autocomplete', 'name');
    await expect(page.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  test('the shopping quick-add shows a focus ring and avoids iOS zoom on touch', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedShoppingList(apiCtx, familyId, 'Focus ring list');
    await page.reload();
    await navigateTo(page, 'Shopping');
    const input = page.locator('.shop-add-form input');
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.focus();

    const styles = await page.evaluate(() => {
      const form = document.querySelector('.shop-add-form');
      const field = form.querySelector('input');
      return {
        outline: getComputedStyle(form).outlineStyle,
        fontSize: parseFloat(getComputedStyle(field).fontSize),
        coarse: matchMedia('(pointer: coarse)').matches,
      };
    });
    expect(styles.outline).toBe('solid');
    if (styles.coarse) expect(styles.fontSize).toBeGreaterThanOrEqual(16);
  });
});
