const VIEW_KEYS = {
  Dashboard: 'dashboard',
  Home: 'dashboard',
  Calendar: 'calendar',
  Shopping: 'shopping',
  Tasks: 'tasks',
  Activity: 'activity',
  Templates: 'templates',
  'Weekly plan': 'weekly_plan',
  'Meal plan': 'meal_plans',
  Recipes: 'recipes',
  Rewards: 'rewards',
  Gifts: 'gifts',
  Contacts: 'contacts',
  'School timetables': 'school_timetables',
  Notifications: 'notifications',
  Settings: 'settings',
  Admin: 'admin',
};

/**
 * Put tests directly into a view without exercising navigation UI.
 * Dedicated navigation specs should exercise user-visible navigation controls.
 */
async function navigateTo(page, viewName) {
  const key = VIEW_KEYS[viewName];
  if (!key) throw new Error(`Unknown navigation target: ${viewName}`);

  await page.locator('#main-content').waitFor({ state: 'attached', timeout: 30000 });
  await page.evaluate((view) => {
    sessionStorage.setItem('tribu_view', view);
    history.pushState(null, '', `#${view}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, key);
  await page.waitForURL(new RegExp(`#${key}$`), { timeout: 5000 });
}

module.exports = { navigateTo };
