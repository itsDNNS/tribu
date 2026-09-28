const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

async function openAccountSettings(page) {
  await navigateTo(page, 'Settings');

  const birthdateInput = page.getByLabel('Date of birth');
  if (await birthdateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    return birthdateInput;
  }

  const accountItem = page.getByRole('button', { name: 'Account', exact: true });
  if (await accountItem.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
    await accountItem.click();
  }

  await expect(birthdateInput).toBeVisible({ timeout: 10000 });
  return birthdateInput;
}

async function openPhoneSyncSettings(page) {
  await navigateTo(page, 'Settings');

  const mobileItem = page.getByRole('button', { name: 'Phone sync', exact: true });
  if (await mobileItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mobileItem.click();
  } else {
    await page.getByRole('button', { name: 'Phone sync', exact: true }).click();
  }

  await expect(page.locator('.settings-section-title', { hasText: 'Phone Sync' })).toBeVisible({ timeout: 10000 });
}

test.describe('Settings', () => {
  test('open settings and see account tab', async ({ authedPage: page, testUser }) => {
    await navigateTo(page, 'Settings');

    // Open the account detail from the settings overview.
    const accountItem = page.getByRole('button', { name: 'Account', exact: true });
    if (await accountItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await accountItem.click();
    }

    await expect(page.locator('.profile-name')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.profile-name')).toContainText(testUser.displayName);
    await expect(page.locator('.profile-email')).toContainText(testUser.email);
  });

  test('lets Account users type and clear a birthdate without using the calendar picker', async ({ authedPage: page }) => {
    const birthdateInput = await openAccountSettings(page);

    await birthdateInput.fill('1990-05-12');
    const saveBirthdate = page.waitForResponse((response) => (
      response.request().method() === 'PATCH'
      && response.url().includes('/birthdate')
      && response.ok()
    ));
    await birthdateInput.blur();
    await saveBirthdate;
    await expect(birthdateInput).toHaveValue('1990-05-12');

    await page.reload();
    const reloadedBirthdateInput = await openAccountSettings(page);
    await expect(reloadedBirthdateInput).toHaveValue('1990-05-12', { timeout: 10000 });

    await reloadedBirthdateInput.fill('');
    const clearBirthdate = page.waitForResponse((response) => (
      response.request().method() === 'PATCH'
      && response.url().includes('/birthdate')
      && response.ok()
    ));
    await reloadedBirthdateInput.blur();
    await clearBirthdate;
    await expect(reloadedBirthdateInput).toHaveValue('');
  });

  test('shows the explicit task opt-in and separate iOS/Android setup', async ({ authedPage: page }) => {
    await openPhoneSyncSettings(page);

    await expect(page.getByText('Optional task sync')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable task sync' })).toBeVisible();
    await expect(page.getByText(/wildcard, calendar, and contact tokens do not enable task sync/i)).toBeVisible();
    await expect(page.getByText(/separate CalDAV account.*Reminders/i)).toBeVisible();
    await expect(page.getByText(/Tasks\.org or OpenTasks/i)).toBeVisible();
    const limits = page.locator('.sync-limits');
    await expect(limits).toContainText('RRULE');
    await expect(limits).toContainText('each next occurrence');
  });

  test('offers every language and the appearance on this device', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');

    const device = page.getByRole('region', { name: 'This device' });
    const language = device.getByRole('combobox', { name: 'Language', exact: true });
    await expect(language.locator('option')).toHaveText([
      'Deutsch',
      'English',
      'Español',
      'Français',
      'Italiano',
      'Nederlands',
      'Polski',
      'Português',
      'Svenska',
      'Dansk',
      'Norsk bokmål',
      'Suomi',
      'Čeština',
      'Slovenčina',
      'Magyar',
      'Română',
      'Ελληνικά',
      'Български',
      'Hrvatski',
      'Slovenščina',
      'Lietuvių',
      'Latviešu',
      'Eesti',
      'Gaeilge',
    ]);

    const html = page.locator('html');
    const appearance = device.getByRole('combobox', { name: 'Appearance' });
    await expect(appearance).toHaveValue('system');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await appearance.selectOption('midnight-glass');
    await expect(html).toHaveAttribute('data-theme', 'midnight-glass');
    await appearance.selectOption('system');
    await expect(html).toHaveAttribute('data-theme', 'light');

    await language.selectOption('sv');
    await expect(page.getByRole('region', { name: 'Den här enheten' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('opens family administration on the chosen section', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');
    await page.getByRole('region', { name: 'Family' }).getByRole('button', { name: 'Backups', exact: true }).click();
    await expect(page.locator('.admin-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.fam-tab[aria-current="page"]')).toHaveText(/Backups/);
  });

  test('shows push diagnostics when server push is not configured', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');

    await page.getByRole('region', { name: 'My account' })
      .getByRole('button', { name: 'Notifications', exact: true }).click();

    await expect(page.getByText('Server push is not configured')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Ask an admin to add VAPID keys on the server and restart Tribu.')).toBeVisible();
    await expect(page.getByText('Push me for')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calendar & appointments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Family' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(page.getByLabel(/Calendar reminders/i)).toBeVisible();
    await expect(page.getByLabel(/Event assignments/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable push notifications' })).toBeDisabled();
  });

  test('creates an automation webhook without exposing URL tokens', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');

    await page.getByRole('button', { name: 'Automation Webhooks', exact: true }).click();

    await page.getByLabel('Name').fill('Home Assistant');
    await page.getByLabel('Webhook URL').fill('https://ha.example/api/webhook/placeholder-token');
    await page.getByLabel('Optional secret header').fill('X-Tribu-Secret');
    await page.getByPlaceholder('Secret value').fill('placeholder-secret');
    await page.getByRole('button', { name: 'Add webhook' }).click();

    await expect(page.getByText('https://ha.example/[redacted]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Secret header: X-Tribu-Secret')).toBeVisible();
    await expect(page.getByText(/placeholder-token/)).toHaveCount(0);
    await expect(page.getByText(/placeholder-secret/)).toHaveCount(0);
  });

  test('creates a store search link', async ({ authedPage: page, apiCtx }) => {
    let createdId = null;
    let primaryError = null;
    try {
      await navigateTo(page, 'Settings');
      const storeLinksItem = page.getByRole('button', { name: 'Store searches', exact: true });
      if (await storeLinksItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await storeLinksItem.click();
      } else {
        await page.getByRole('button', { name: 'Store searches', exact: true }).click();
      }

      await page.getByLabel('Store name').fill('Settings E2E Store');
      await page.getByLabel('Search address').fill('https://www.example.com/search?q={query}');
      const createResponsePromise = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/api/shopping/store-links')
      ));
      await page.getByRole('button', { name: 'Add store' }).click();
      const createResponse = await createResponsePromise;
      expect(createResponse.ok()).toBeTruthy();
      const created = await createResponse.json();
      createdId = created.id;

      await expect(page.getByText('Settings E2E Store')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('www.example.com')).toBeVisible();
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      if (createdId !== null) {
        const cleanup = await apiCtx.delete(`/api/shopping/store-links/${createdId}`);
        if (!cleanup.ok() && !primaryError) {
          throw new Error(`DELETE /api/shopping/store-links/${createdId} failed (${cleanup.status()})`);
        }
      }
    }
  });

  test('creates a household notification destination without exposing the Apprise URL', async ({ authedPage: page }) => {
    await navigateTo(page, 'Settings');

    await page.getByRole('button', { name: 'Household notifications', exact: true }).click();

    await expect(page.getByText(/Destination URLs may contain passwords or tokens/)).toBeVisible();
    await page.getByLabel('Name').fill('Kitchen ntfy');
    await page.getByLabel('Apprise URL').fill('ntfy://ntfy.sh/tribu-e2e-placeholder');
    await page.getByRole('button', { name: 'Add destination' }).click();

    await expect(page.getByText('Kitchen ntfy')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('ntfy://[redacted]')).toBeVisible();
    await expect(page.getByText(/tribu-e2e-placeholder/)).toHaveCount(0);
  });

});
