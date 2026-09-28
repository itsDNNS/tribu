const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent, seedTask, seedShoppingList, seedShoppingItem, seedMealPlan } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

function parseRgb(value) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Unsupported color value: ${value}`);
  return match.slice(1, 4).map(Number);
}

function compositeRgb(foreground, background, opacity = 1) {
  const foregroundRgb = parseRgb(foreground);
  const backgroundRgb = Array.isArray(background) ? background : parseRgb(background);
  const alphaMatch = foreground.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
  const alpha = (alphaMatch ? Number(alphaMatch[1]) : 1) * opacity;
  return foregroundRgb.map((channel, index) => (channel * alpha) + (backgroundRgb[index] * (1 - alpha)));
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

function localIsoDaysFromToday(daysFromToday, hour = 9, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  date.setHours(hour, minute, 0, 0);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}:00`;
}

test.describe('Today', () => {
  test('greets once and keeps search in the header', async ({ authedPage: page, testUser }, testInfo) => {
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText(testUser.displayName.split(' ')[0], { timeout: 10000 });
    await expect(page.locator('.today-head p')).toBeVisible();

    // One header on every page; phones name the area and greet on Today.
    if (testInfo.project.name.includes('Mobile')) {
      await expect(page.locator('.app-header-title')).toContainText(testUser.displayName.split(' ')[0]);
    }
    await page.locator('.app-header').getByRole('button', { name: /Search/i }).click();
    await expect(page.locator('.search-overlay')).toBeVisible();
    await expect(page.getByPlaceholder(/Search|suchen/i)).toBeFocused();
  });

  test('shows the day, the week ahead and folds overdue tasks', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const today = localIsoDaysFromToday(0, 0, 0).slice(0, 10);
    await seedTask(apiCtx, familyId, { title: 'E2E today task', due_date: `${today}T00:00:00`, due_is_date: true });
    await seedTask(apiCtx, familyId, { title: 'E2E overdue task', due_date: localIsoDaysFromToday(-3, 0, 0), due_is_date: true });
    await seedCalendarEvent(apiCtx, familyId, {
      title: 'E2E all-day event', starts_at: `${today}T00:00:00`, ends_at: `${localIsoDaysFromToday(1, 0, 0)}`, all_day: true,
    });
    await seedCalendarEvent(apiCtx, familyId, { title: 'E2E tomorrow event', starts_at: localIsoDaysFromToday(1, 9, 0) });
    await seedMealPlan(apiCtx, familyId, { plan_date: today, meal_name: 'E2E pasta', slot: 'noon' });

    await page.reload();
    const day = page.locator('#main-content').getByRole('region', { name: 'Today' });
    await expect(day).toContainText('E2E today task', { timeout: 10000 });
    await expect(day).toContainText('E2E pasta');
    await expect(day.locator('.today-row-meal')).toContainText('Noon');
    const allDay = day.locator('.today-row', { hasText: 'E2E all-day event' });
    await expect(allDay.locator('.today-row-time')).toHaveText('');
    await expect(day).not.toContainText('E2E overdue task');
    await expect(day).not.toContainText('E2E tomorrow event');

    const week = page.getByRole('region', { name: 'This week' });
    await expect(week).toContainText('E2E tomorrow event');
    await expect(week.locator('.today-week-item', { hasText: 'E2E tomorrow event' })).toContainText(/0?9:00/);

    const overdue = page.locator('.today-overdue');
    await expect(overdue.getByText('E2E overdue task')).toBeHidden();
    await overdue.getByText('Still open').click();
    await expect(overdue.getByText('E2E overdue task')).toBeVisible();

    await week.getByRole('button', { name: /E2E tomorrow event/ }).click();
    await expect(page.locator('.tc-calendar-grid, .ui-month-grid, .ui-day-strip').first()).toBeVisible({ timeout: 10000 });
  });

  test('completes a task from Today with undo', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const today = localIsoDaysFromToday(0, 0, 0).slice(0, 10);
    const task = await seedTask(apiCtx, familyId, { title: 'E2E tick me', due_date: `${today}T00:00:00`, due_is_date: true });
    const status = async () => {
      const res = await apiCtx.get(`/api/tasks?family_id=${familyId}`);
      return (await res.json()).items.find((item) => item.id === task.id)?.status;
    };

    await page.reload();
    const check = page.getByRole('checkbox', { name: 'Mark task: E2E tick me' });
    await check.click({ timeout: 10000 });
    await expect(check).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(check).toHaveAttribute('aria-checked', 'false');
    expect(await status()).toBe('open');

    await check.click();
    await expect.poll(status, { timeout: 15000 }).toBe('done');
  });

  test('shows and dismisses the first-week setup checklist', async ({ authedPage: page }) => {
    const hint = page.getByRole('region', { name: 'Set up your first week' }).first();
    await expect(hint).toBeVisible({ timeout: 10000 });
    await hint.getByRole('button', { name: /Continue/ }).click();
    const checklist = page.locator('.setup-checklist-panel');
    await expect(checklist).toContainText('Invite your family');
    await expect(checklist).toContainText('Create a shared shopping list');
    await checklist.getByRole('button', { name: 'Hide for later' }).click();
    await expect(page.getByRole('region', { name: 'Set up your first week' })).toHaveCount(0, { timeout: 10000 });
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
    // Phrased by the client from the entry's action and object name.
    await expect(activityFeed).toContainText(`${testUser.displayName} created “E2E Activity Task”`, { timeout: 10000 });
    await expect(activityFeed).toContainText(`${testUser.displayName} added the event “E2E Calendar Activity”`, { timeout: 10000 });
    await expect(activityFeed).not.toContainText('private detail');
    await expect(activityFeed).not.toContainText('calendar private location');
  });

  test('triages a quick note from Today', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const res = await apiCtx.post('/api/quick-capture', { data: { family_id: familyId, text: 'Buy apples from market', destination: 'inbox' } });
    expect(res.ok()).toBeTruthy();
    await page.reload();

    const hint = page.getByRole('region', { name: 'Inbox' });
    await expect(hint).toContainText('1 quick notes open', { timeout: 10000 });
    await hint.getByRole('button', { name: /Review/ }).click();
    await expect(hint).toContainText('Buy apples from market');
    await hint.getByRole('button', { name: 'Shopping', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Inbox' })).toHaveCount(0, { timeout: 10000 });
  });

  test('keeps the timeline readable in all themes', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const today = localIsoDaysFromToday(0, 0, 0).slice(0, 10);
    await seedTask(apiCtx, familyId, { title: 'E2E contrast task', due_date: `${today}T00:00:00`, due_is_date: true });
    for (const theme of ['light', 'dark', 'midnight-glass']) {
      await page.evaluate((themeKey) => window.localStorage.setItem('tribu_theme', themeKey), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme, { timeout: 10000 });
      const row = page.locator('.today-row', { hasText: 'E2E contrast task' });
      await expect(row).toBeVisible({ timeout: 10000 });
      const colors = await row.evaluate((element) => ({
        title: getComputedStyle(element.querySelector('.today-row-title')).color,
        surface: getComputedStyle(element.closest('.today-list')).backgroundColor,
        page: getComputedStyle(document.body).backgroundColor,
      }));
      const surface = compositeRgb(colors.surface, parseRgb(colors.page));
      expect(contrastRatio(parseRgb(colors.title), surface), `${theme} timeline text contrast`).toBeGreaterThanOrEqual(4.5);
    }
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
      await navigateTo(page, 'Weekly plan');
      await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible({ timeout: 10000 });

      const checks = await page.evaluate(() => {
        const selectors = [
          '.weekly-plan-header h1',
          '.weekly-plan-week-pill',
          '.weekly-plan-member-filter span',
          '.weekly-plan-member-filter select',
          '.weekly-plan-section-filters label',
          '.weekly-plan-section h2',
          '.weekly-plan-section li strong',
          '.weekly-plan-section li span',
        ];
        return selectors.flatMap((selector) => {
          const element = document.querySelector(selector);
          if (!element) return [];
          // The plain title sits on the page, the week on its pill.
          const surface = element?.closest('.weekly-plan-week-pill, .weekly-plan-section li, .weekly-plan-section, .weekly-plan-filters') || document.body;
          const elementStyle = window.getComputedStyle(element);
          const surfaceStyle = window.getComputedStyle(surface);
          return [{
            selector,
            color: elementStyle.color,
            backgroundColor: surfaceStyle.backgroundColor,
          }];
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

  test('keeps weekly plan print output light, readable, and free of app chrome', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const today = await page.evaluate(() => {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    });
    await seedCalendarEvent(apiCtx, familyId, { title: 'Weekly print event', starts_at: `${today}T10:00:00` });
    await seedTask(apiCtx, familyId, { title: 'Weekly print task', due_date: today });
    const shoppingList = await seedShoppingList(apiCtx, familyId, 'Weekly print groceries');
    await seedShoppingItem(apiCtx, shoppingList.id, 'Weekly print apples');

    await page.evaluate(() => {
      window.localStorage.setItem('tribu_theme', 'midnight-glass');
    });
    await page.reload();
    await page.locator('#main-content').waitFor({ timeout: 15000 });
    await navigateTo(page, 'Weekly plan');
    await expect(page.getByRole('heading', { name: 'Weekly plan' })).toBeVisible({ timeout: 10000 });

    await page.emulateMedia({ media: 'print' });
    const shopping = page.getByRole('region', { name: 'Shopping reminders', exact: true });
    await expect(shopping).toHaveCount(1);
    await expect(shopping).toContainText('Weekly print groceries');
    await expect(page.getByRole('region', { name: 'Events', exact: true })).toContainText('Weekly print event');
    await expect(page.getByRole('region', { name: 'Tasks and routines', exact: true })).toContainText('Weekly print task');
    const printState = await page.evaluate(() => {
      const styleOf = (selector) => {
        const element = document.querySelector(selector);
        return element ? window.getComputedStyle(element) : null;
      };
      const pageStyle = styleOf('.weekly-plan-page');
      const sectionStyle = styleOf('.weekly-plan-section');
      const toolbarStyle = styleOf('.weekly-plan-toolbar');
      const navStyle = styleOf('.bottom-nav');
      return {
        pageBackground: pageStyle?.backgroundColor,
        sectionBackground: sectionStyle?.backgroundColor,
        headerColor: styleOf('.weekly-plan-header h1')?.color,
        toolbarDisplay: toolbarStyle?.display,
        bottomNavDisplay: navStyle?.display || 'none',
      };
    });

    expect(printState.pageBackground).toBe('rgb(255, 255, 255)');
    expect(printState.sectionBackground).toBe('rgb(255, 255, 255)');
    expect(printState.headerColor).toBe('rgb(26, 21, 32)');
    expect(printState.toolbarDisplay).toBe('none');
    expect(printState.bottomNavDisplay).toBe('none');
    await page.emulateMedia({ media: 'screen' });
  });
});
