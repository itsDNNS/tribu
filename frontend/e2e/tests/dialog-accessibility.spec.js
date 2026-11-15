const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

// Requests from a service worker would bypass page.route.
test.use({ serviceWorkers: 'block' });

async function openContactForm(page) {
  await page.getByRole('button', { name: 'Add Contact' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add Contact' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Dialogs, toasts and theme', () => {
  test('a form dialog keeps typed input from a stray drag, outside click or Escape', async ({ authedPage: page }) => {
    await navigateTo(page, 'Contacts');
    let dialog = await openContactForm(page);

    // Untouched, a click on the backdrop closes it at once.
    await page.mouse.click(4, 4);
    await expect(dialog).toHaveCount(0);

    dialog = await openContactForm(page);
    const name = dialog.getByRole('textbox', { name: /Name/ });
    await name.fill('Oma Hannelore');

    // Selecting text inside and letting go on the backdrop is not an outside click.
    const box = await name.boundingBox();
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(4, 4, { steps: 6 });
    await page.mouse.up();
    await expect(dialog).toBeVisible();

    // A real outside click asks first and starts on the safe choice.
    await page.mouse.click(4, 4);
    const ask = page.getByRole('dialog', { name: 'Discard changes?' });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(ask).toHaveCount(0);
    await expect(name).toHaveValue('Oma Hannelore');

    // Escape asks as well; discarding closes the form.
    await name.click();
    await page.keyboard.press('Escape');
    await expect(ask).toBeVisible();
    await expect(dialog).toBeVisible();
    await ask.getByRole('button', { name: 'Discard' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('an error toast shows above the dialog that stays open', async ({ authedPage: page }, testInfo) => {
    await navigateTo(page, 'Contacts');
    await page.route('**/api/contacts', (route) => (
      route.request().method() === 'POST'
        ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'Could not save this contact' }) })
        : route.fallback()
    ));
    const dialog = await openContactForm(page);
    await dialog.getByRole('textbox', { name: /Name/ }).fill('Opa');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const region = page.getByRole('region', { name: 'Notifications' });
    await expect(region.getByText('Could not save this contact')).toBeVisible();
    await expect(dialog).toBeVisible();
    // The toasts move into the open dialog, which keeps the rest of the page inert, and show in the top layer.
    expect(await region.evaluate((el) => el.matches(':popover-open') && Boolean(el.closest('dialog:modal')))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('toast-over-dialog.png') });
    // Its dismiss button can be used while the dialog stays open.
    await region.getByRole('button', { name: 'Dismiss' }).click();
    await expect(region.getByText('Could not save this contact')).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });

  test('collapsed sidebar buttons keep their names and show the tooltip on focus', async ({ authedPage: page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'The sidebar is a desktop layout.');
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: /^Shopping/ })).toBeVisible();

    await page.getByRole('button', { name: 'Expand sidebar' }).focus();
    await page.keyboard.press('Tab');
    const focused = page.locator('.sidebar .nav-item:focus-visible');
    await expect(focused).toHaveCount(1);
    const tooltip = await focused.evaluate((el) => getComputedStyle(el, '::after').display);
    expect(tooltip).toBe('block');
  });

  test('a stored dark theme applies before the first paint, with no light frame', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('tribu_theme', 'dark');
      window.__themes = [];
      new MutationObserver(() => {
        const theme = document.documentElement?.dataset.theme;
        if (theme && window.__themes.at(-1) !== theme) window.__themes.push(theme);
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.__themes)).toEqual(['dark']);
  });
});
