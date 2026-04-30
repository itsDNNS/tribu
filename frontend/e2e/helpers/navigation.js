// Mobile bottom-nav uses mobileLabel which differs from the sidebar label
const MOBILE_ALIASES = {
  Dashboard: 'Home',
};

const VIEW_KEYS = {
  Dashboard: 'dashboard',
  Home: 'dashboard',
  Calendar: 'calendar',
  Shopping: 'shopping',
  Tasks: 'tasks',
  Activity: 'activity',
  Templates: 'templates',
  'Meal plan': 'meal_plans',
  Recipes: 'recipes',
  Rewards: 'rewards',
  Gifts: 'gifts',
  Contacts: 'contacts',
  Notifications: 'notifications',
  Settings: 'settings',
  Admin: 'admin',
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

  const desktopName = Object.entries(MOBILE_ALIASES)
    .find(([, mobile]) => mobile === viewName)?.[0] || viewName;
  const mobileName = MOBILE_ALIASES[viewName] || viewName;

  if (!isMobile) {
    const desktopItem = page.locator('.nav-item', { hasText: desktopName }).first();
    if (await desktopItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await desktopItem.click();
      return;
    }
    await navigateByHash(page, desktopName);
    return;
  }

  // Mobile: prefer the user-visible bottom nav when the target is pinned there.
  if (!ALWAYS_OVERFLOW.has(viewName)) {
    const bottomNavItem = page.locator('.bottom-nav-item', { hasText: mobileName });
    if (await bottomNavItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      try {
        await bottomNavItem.click({ timeout: 2000 });
        return;
      } catch {
        await navigateByHash(page, desktopName);
        return;
      }
    }
  }

  // Then try the mobile drawer opened via the header button.
  const openMenu = page.getByRole('button', { name: 'Open menu' });
  if (await openMenu.isVisible({ timeout: 1000 }).catch(() => false)) {
    await openMenu.click();
    const drawerItem = page.locator('.nav-item', { hasText: desktopName }).first();
    if (await drawerItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await drawerItem.click();
      return;
    }
  }

  // Then try bottom-nav overflow when present.
  const moreBtn = page.locator('.bottom-nav-item', { hasText: 'More' })
    .or(page.locator('.bottom-nav .bottom-nav-overflow > button'));
  if (await moreBtn.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    await moreBtn.first().click();
    const overflowItem = page.locator('.bottom-nav-overflow-item', { hasText: mobileName });
    if (await overflowItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await overflowItem.click();
      return;
    }
  }

  // Last-resort test navigation: Tribu treats the hash/session value as
  // the canonical in-app route. This avoids mobile flakiness where hidden
  // sidebars are present in the DOM but outside the viewport.
  await navigateByHash(page, desktopName);
}

async function navigateByHash(page, label) {
  const key = VIEW_KEYS[label];
  if (!key) throw new Error(`Unknown navigation target: ${label}`);
  await page.evaluate((view) => {
    sessionStorage.setItem('tribu_view', view);
    history.pushState(null, '', `#${view}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, key);
}

module.exports = { navigateTo };
