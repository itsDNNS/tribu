// Mobile bottom-nav uses mobileLabel which differs from the sidebar label
const MOBILE_ALIASES = {
  Dashboard: 'Home',
};

// Items pinned to overflow on mobile - skip bottom-nav check
const ALWAYS_OVERFLOW = new Set(['Settings', 'Admin']);

/**
 * Navigate to a view in the app.
 * On desktop: clicks sidebar .nav-item
 * On mobile: uses bottom-nav items or the "More" overflow popup
 */
async function navigateTo(page, viewName) {
  const viewport = page.viewportSize();
  const isMobile = viewport ? viewport.width < 768 : false;

  if (!isMobile) {
    // Desktop sidebar: use the viewName directly (e.g. "Dashboard", "Calendar")
    // Handle reverse alias: "Home" → "Dashboard" for desktop
    const desktopName = Object.entries(MOBILE_ALIASES)
      .find(([, mobile]) => mobile === viewName)?.[0] || viewName;
    await page.locator('.nav-item', { hasText: desktopName }).first().click();
    return;
  }

  // Mobile: resolve alias (e.g. "Dashboard" → "Home")
  const mobileName = MOBILE_ALIASES[viewName] || viewName;

  // Skip bottom-nav check for items that are always in overflow
  if (!ALWAYS_OVERFLOW.has(viewName)) {
    const bottomNavItem = page.locator('.bottom-nav-item', { hasText: mobileName });
    if (await bottomNavItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await bottomNavItem.click();
      return;
    }
  }

  // Open "More" overflow, then click the item
  const moreBtn = page.locator('.bottom-nav-item', { hasText: 'More' })
    .or(page.locator('.bottom-nav .bottom-nav-overflow > button'));
  await moreBtn.first().click();

  const overflowItem = page.locator('.bottom-nav-overflow-item', { hasText: mobileName });
  await overflowItem.waitFor({ timeout: 3000 });
  await overflowItem.click();
}

module.exports = { navigateTo };
