const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

function inDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test.describe('Gifts view', () => {
  test('plans a gift for an occasion and takes care of it', async ({ authedPage: page }) => {
    const name = `E2E Grandma ${Date.now() % 100000}`;
    await navigateTo(page, 'Gifts');
    await expect(page.getByRole('tab', { name: 'Occasions' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Note an idea' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New gift idea' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Gift', { exact: true }).fill('E2E garden book');
    await dialog.getByRole('radio', { name: 'Someone else' }).click();
    await dialog.getByLabel('Someone else').fill(name);
    await dialog.getByRole('radio', { name: 'Birthday' }).click();
    await dialog.locator('input[type=date]').fill(inDays(10));
    await dialog.getByLabel('Price').fill('24.90');
    await dialog.getByRole('button', { name: 'Note an idea', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    const occasion = page.getByRole('region', { name: `${name} · Birthday` });
    await expect(occasion).toContainText('E2E garden book', { timeout: 10000 });
    await expect(occasion).toContainText('Nothing planned yet');
    await occasion.getByRole('button', { name: "I'll take care of it" }).click();
    await expect(occasion).toContainText("You're on it", { timeout: 10000 });
    await expect(occasion).not.toContainText('Nothing planned yet');

    const hasHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('keeps my own wishes on my wish list', async ({ authedPage: page }) => {
    const title = `E2E headphones ${Date.now() % 100000}`;
    await navigateTo(page, 'Gifts');
    await page.getByRole('button', { name: 'Add a wish' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New wish' });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await dialog.getByLabel('Gift', { exact: true }).fill(title);
    await dialog.getByRole('button', { name: 'Add a wish', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    await page.getByRole('tab', { name: /My wishes/ }).click();
    const card = page.locator('.gifts-card', { hasText: title });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByRole('button', { name: "I'll take care of it" })).toHaveCount(0);
  });
});
