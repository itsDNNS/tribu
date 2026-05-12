const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent, seedTask } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Unsupported color value: ${value}`);
  return match.slice(1, 4).map(Number);
}

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * rs) + (0.7152 * gs) + (0.0722 * bs);
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('Dashboard', () => {
  test('shows greeting with username', async ({ authedPage: page, testUser }) => {
    const greeting = page.locator('.view-title');
    await expect(greeting).toBeVisible({ timeout: 10000 });
    await expect(greeting).toContainText(testUser.displayName);
  });

  test('keeps duplicate summary counts out of the dashboard header', async ({ authedPage: page }) => {
    await expect(page.getByRole('group', { name: 'Quick actions' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('group', { name: 'Family at a glance' })).toHaveCount(0);
    await expect(page.getByTestId('hero-chip-members')).toHaveCount(0);
    await expect(page.getByTestId('hero-chip-events')).toHaveCount(0);
    await expect(page.getByTestId('hero-chip-tasks')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Next events' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Open tasks' })).toBeVisible();
  });

  test('moves search into the dashboard header and removes the duplicate date chip', async ({ authedPage: page }) => {
    await expect(page.getByRole('group', { name: 'Quick actions' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.dashboard-header-actions .view-date')).toHaveCount(0);
    await expect(page.locator('.sidebar-search-btn')).toHaveCount(0);

    const dashboardSearch = page.locator('.dashboard-header-actions .dashboard-search-btn');
    await expect(dashboardSearch).toBeVisible();
    await dashboardSearch.click();
    await expect(page.locator('.search-overlay')).toBeVisible();
    await expect(page.getByPlaceholder(/Search/i)).toBeFocused();
  });

  test('keeps dashboard header search usable on narrow desktop widths', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(page.getByRole('group', { name: 'Quick actions' })).toBeVisible({ timeout: 10000 });

    const header = page.locator('.today-command-header');
    const dashboardSearch = header.locator('.dashboard-search-btn');
    await expect(dashboardSearch).toBeVisible();

    const headerBox = await header.boundingBox();
    const searchBox = await dashboardSearch.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
    expect(searchBox.width).toBeGreaterThanOrEqual(280);
  });

  test('keeps mobile dashboard header and cards tightly stacked', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 485, height: 873 });
    await expect(page.getByRole('group', { name: 'Quick actions' })).toBeVisible({ timeout: 10000 });

    const dateLine = page.locator('.today-command-family');
    const dashboardSearch = page.locator('.dashboard-search-btn');
    const layoutToggle = page.locator('.dashboard-layout-toggle');
    const nextUp = page.locator('.next-up-card');
    const statusCard = page.locator('.today-status-card');

    const boxes = await Promise.all([
      dateLine.boundingBox(),
      dashboardSearch.boundingBox(),
      layoutToggle.boundingBox(),
      nextUp.boundingBox(),
      statusCard.boundingBox(),
    ]);
    for (const box of boxes) expect(box).not.toBeNull();

    const [dateBox, searchBox, layoutBox, nextUpBox, statusBox] = boxes;
    const firstActionTop = Math.min(searchBox.y, layoutBox.y);
    const lastActionBottom = Math.max(searchBox.y + searchBox.height, layoutBox.y + layoutBox.height);
    const dateToActionsGap = firstActionTop - (dateBox.y + dateBox.height);
    const actionsToNextUpGap = nextUpBox.y - lastActionBottom;
    const nextUpToStatusGap = statusBox.y - (nextUpBox.y + nextUpBox.height);

    expect(dateToActionsGap).toBeLessThanOrEqual(32);
    expect(actionsToNextUpGap).toBeLessThanOrEqual(32);
    expect(nextUpToStatusGap).toBeLessThanOrEqual(32);
  });

  test('quick-action pills navigate to correct views', async ({ authedPage: page }) => {
    const quickActions = page.getByRole('group', { name: 'Quick actions' });
    await quickActions.waitFor({ timeout: 10000 });

    // Event → Calendar
    await page.getByTestId('quick-action-event').click();
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard
    await navigateTo(page, 'Home');
    await page.getByRole('group', { name: 'Quick actions' }).waitFor({ timeout: 10000 });

    // Task → Tasks
    await page.getByTestId('quick-action-task').click();
    await expect(page.locator('.tasks-filter-tabs')).toBeVisible({ timeout: 10000 });

    // Back to Dashboard
    await navigateTo(page, 'Home');
    await page.getByRole('group', { name: 'Quick actions' }).waitFor({ timeout: 10000 });

    // Weekly plan → print-ready weekly view
    await page.getByTestId('quick-action-weekly-plan').click();
    await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Print' })).toHaveClass(/no-print/);
    await expect(page.getByRole('group', { name: 'Filters' })).toHaveClass(/no-print/);
    await expect(page.getByRole('region', { name: 'Events' })).toBeVisible();

    // Back to Dashboard
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByRole('group', { name: 'Quick actions' }).waitFor({ timeout: 10000 });

    // Invite → Admin
    await page.getByTestId('quick-action-invite').click();
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible({ timeout: 10000 });
  });

  test('daily check-in tiles navigate without separate pill buttons', async ({ authedPage: page }) => {
    const dailyLoop = page.getByRole('region', { name: 'Today in motion' });
    await expect(dailyLoop).toBeVisible({ timeout: 10000 });
    await expect(dailyLoop.locator('.daily-loop-action')).toHaveCount(0);

    await dailyLoop.getByRole('button', { name: 'Plan meals' }).click();
    await expect(page.getByRole('heading', { name: 'Meal plan' })).toBeVisible({ timeout: 10000 });

    await navigateTo(page, 'Home');
    await page.getByRole('region', { name: 'Today in motion' }).waitFor({ timeout: 10000 });
    await page.getByRole('region', { name: 'Today in motion' }).getByRole('button', { name: 'Open shopping' }).click();
    await expect(page.locator('.shopping-lists-panel')).toBeVisible({ timeout: 10000 });

    await navigateTo(page, 'Home');
    await page.getByRole('region', { name: 'Today in motion' }).waitFor({ timeout: 10000 });
    await page.getByRole('region', { name: 'Today in motion' }).getByRole('button', { name: 'Open routines' }).click();
    await expect(page.locator('.tasks-filter-tabs')).toBeVisible({ timeout: 10000 });
  });

  test('shows and dismisses the first-week setup checklist', async ({ authedPage: page }) => {
    const checklist = page.getByRole('region', { name: 'Set up your first week' });
    await expect(checklist).toBeVisible({ timeout: 10000 });
    await expect(checklist).toContainText('Invite your family');
    await expect(checklist).toContainText('Create a shared shopping list');
    await checklist.getByRole('button', { name: 'Hide for later' }).click();
    await expect(checklist).not.toBeVisible({ timeout: 10000 });
  });

  test('moves household activity to a dedicated history view', async ({ authedPage: page, apiCtx, testUser }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedTask(apiCtx, familyId, {
      title: 'E2E Activity Task',
      description: 'private detail should stay out of the activity feed',
    });
    await seedCalendarEvent(apiCtx, familyId, {
      title: 'E2E Calendar Activity',
      description: 'calendar private detail should stay out',
      location: 'calendar private location should stay out',
    });

    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 15000 });

    await expect(page.getByRole('region', { name: 'Recent activity' })).toHaveCount(0);

    await navigateTo(page, 'Activity');
    await expect(page.getByRole('heading', { name: 'Activity history' })).toBeVisible({ timeout: 10000 });
    const activityFeed = page.getByRole('region', { name: 'Recent activity' });
    await expect(activityFeed).toContainText(`${testUser.displayName} created task "E2E Activity Task"`, { timeout: 10000 });
    await expect(activityFeed).toContainText(`${testUser.displayName} created calendar event "E2E Calendar Activity"`, { timeout: 10000 });
    await expect(activityFeed).not.toContainText('private detail');
    await expect(activityFeed).not.toContainText('calendar private location');
  });

  test('captures a quick note and triages it from the dashboard inbox', async ({ authedPage: page }) => {
    const quickCapture = page.getByRole('region', { name: 'Quick capture' });
    await expect(quickCapture).toBeVisible({ timeout: 10000 });

    await quickCapture.getByPlaceholder('Note an event, task, or shopping thought…').fill('Buy apples from market');
    await quickCapture.getByRole('button', { name: 'Save to inbox' }).click();

    await expect(quickCapture).toContainText('Buy apples from market', { timeout: 10000 });
    await quickCapture.locator('.quick-capture-item-actions').getByRole('button', { name: 'Shopping' }).click();
    await expect(quickCapture).not.toContainText('Buy apples from market', { timeout: 10000 });
  });

  test('customizes dashboard module order and keeps it after reload', async ({ authedPage: page }) => {
    const tasksModule = page.locator('[data-dashboard-module="tasks"]');
    const eventsModule = page.locator('[data-dashboard-module="events"]');
    await expect(tasksModule).toBeVisible({ timeout: 10000 });
    await expect(eventsModule).toHaveCSS('order', '2');
    await expect(tasksModule).toHaveCSS('order', '3');

    await page.getByRole('button', { name: 'Customize layout' }).click();
    await page.getByRole('button', { name: 'Move Open tasks up' }).click();

    await expect(tasksModule).toHaveCSS('order', '2');
    await expect(eventsModule).toHaveCSS('order', '3');

    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 15000 });
    await expect(page.locator('[data-dashboard-module="tasks"]')).toHaveCSS('order', '2');
    await expect(page.locator('[data-dashboard-module="events"]')).toHaveCSS('order', '3');

    await page.getByRole('button', { name: 'Customize layout' }).click();
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await expect(page.locator('[data-dashboard-module="events"]')).toHaveCSS('order', '2');
    await expect(page.locator('[data-dashboard-module="tasks"]')).toHaveCSS('order', '3');
  });

  test('keeps weekly plan cards and filters readable in all themes', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    await seedCalendarEvent(apiCtx, familyId, { title: 'Weekly contrast event' });
    await seedTask(apiCtx, familyId, { title: 'Weekly contrast task' });

    for (const theme of ['light', 'dark', 'midnight-glass']) {
      await page.evaluate((themeKey) => {
        window.localStorage.setItem('tribu_theme', themeKey);
      }, theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 10000 });
      await page.locator('#main-content').waitFor({ timeout: 15000 });
      await page.getByTestId('quick-action-weekly-plan').click();
      await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible({ timeout: 10000 });

      const checks = await page.evaluate(() => {
        const selectors = [
          '.weekly-plan-header h1',
          '.weekly-plan-header p',
          '.weekly-plan-member-filter span',
          '.weekly-plan-member-filter select',
          '.weekly-plan-section-filters label',
          '.weekly-plan-section h2',
          '.weekly-plan-section li strong',
          '.weekly-plan-section li span',
        ];
        return selectors.map((selector) => {
          const element = document.querySelector(selector);
          const surface = element?.closest('.weekly-plan-header, .weekly-plan-section li, .weekly-plan-section, .weekly-plan-filters') || element;
          const elementStyle = window.getComputedStyle(element);
          const surfaceStyle = window.getComputedStyle(surface);
          return {
            selector,
            color: elementStyle.color,
            backgroundColor: surfaceStyle.backgroundColor,
          };
        });
      });

      for (const check of checks) {
        expect(check.color, `${theme} ${check.selector} color`).toBeTruthy();
        expect(check.backgroundColor, `${theme} ${check.selector} background`).toBeTruthy();
        const ratio = contrastRatio(parseRgb(check.color), parseRgb(check.backgroundColor));
        expect(ratio, `${theme} ${check.selector} contrast`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
