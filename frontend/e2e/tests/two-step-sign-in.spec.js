const crypto = require('crypto');
const { test, expect } = require('../helpers/fixtures');
const { createTestUser } = require('../helpers/auth');
const { navigateTo } = require('../helpers/navigation');

function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of text.replace(/[\s=]/g, '')) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, stepOffset = 0) {
  const step = Math.floor(Date.now() / 30000) + stepOffset;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

test.describe('Two-step sign-in', () => {
  test('turn it on in settings, then sign in with a code', async ({ page }) => {
    // A fresh account: the shared worker user must keep signing in with its password only.
    const user = createTestUser();
    const register = await page.request.post('/api/auth/register', {
      data: { email: user.email, password: user.password, display_name: user.displayName, family_name: user.familyName },
    });
    expect(register.ok()).toBeTruthy();
    await page.goto('/');
    await page.locator('#main-content').waitFor({ timeout: 15000 });

    await navigateTo(page, 'Settings');
    const accountItem = page.getByRole('button', { name: 'Account', exact: true });
    if (await accountItem.isVisible({ timeout: 2000 }).catch(() => false)) await accountItem.click();

    const section = page.getByTestId('two-step-section');
    await expect(section.locator('.two-step-state')).toHaveText('Off', { timeout: 10000 });
    await section.getByRole('button', { name: 'Turn on' }).click();
    await section.locator('#two-step-password').fill(user.password);
    await section.getByRole('button', { name: 'Continue' }).click();

    await expect(section.getByTestId('display-pairing-qr')).toBeVisible();
    const secret = (await section.locator('.two-step-secret').textContent()).replace(/\s/g, '');
    await section.locator('#two-step-code').fill(totp(secret));
    await section.getByRole('button', { name: 'Turn on' }).click();

    const codes = section.getByTestId('two-step-recovery-codes').locator('li');
    await expect(codes).toHaveCount(10);
    const done = section.getByRole('button', { name: 'Done' });
    await expect(done).toBeDisabled();
    await section.getByLabel('I have saved my recovery codes').check();
    await done.click();
    await expect(section.locator('.two-step-state')).toHaveText('On');
    await expect(section).toContainText('10 recovery codes left.');

    await page.context().clearCookies();
    await page.goto('/');
    await page.locator('#tab-login').waitFor({ timeout: 10000 });
    await page.locator('#login-email').fill(user.email);
    await page.locator('#login-password').fill(user.password);
    await page.locator('#panel-login button[type="submit"]').click();

    const code = page.locator('#login-mfa-code');
    await expect(code).toBeVisible({ timeout: 10000 });
    // The setup already used the current time step; the next one is accepted for clock drift.
    await code.fill(totp(secret, 1));
    await page.getByTestId('mfa-login-form').getByRole('button', { name: 'Sign in' }).click();

    await page.locator('#main-content').waitFor({ timeout: 15000 });
  });
});
