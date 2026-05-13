const { test, expect } = require('../helpers/fixtures');
const { navigateTo } = require('../helpers/navigation');

test.describe('Gifts view', () => {
  test('keeps the redesigned gift cards and filters usable without horizontal overflow', async ({ authedPage: page }) => {
    await navigateTo(page, 'Gifts');
    await expect(page.locator('.gift-page')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.gift-toolbar')).toBeVisible();

    await page.locator('.gift-add-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Gift title').fill('E2E birthday book');
    await page.getByLabel('Choose occasion').selectOption('birthday');
    await page.locator('.gift-form-actions .btn-primary').click();

    const card = page.locator('.gift-card', { hasText: 'E2E birthday book' });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.locator('.gift-card-visual')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Idea' })).toHaveAttribute('aria-pressed', 'true');

    const hasHorizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
