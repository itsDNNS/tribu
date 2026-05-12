const { expect } = require('@playwright/test');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shoppingListCard(page, name) {
  return page.locator('.shopping-list-card').filter({
    has: page.locator('.shopping-list-name', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }),
  }).first();
}

async function selectShoppingList(page, name) {
  const card = shoppingListCard(page, name);
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
}

module.exports = { shoppingListCard, selectShoppingList };
