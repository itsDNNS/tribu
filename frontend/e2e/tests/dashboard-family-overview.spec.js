const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent, seedTask, seedMealPlan } = require('../helpers/api-setup');
const { createTestUser } = require('../helpers/auth');
const { measureStatusDetails, measureCaptureText, measureCompletedWord } = require('../helpers/dashboard-visuals');
const { navigateTo } = require('../helpers/navigation');
const fs = require('node:fs/promises');
const path = require('node:path');

test('dashboard uses real meals and task completion at responsive widths in light and dark themes', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  const apiCtx = page.request;
  const user = createTestUser();
  const registered = await apiCtx.post('/api/auth/register', { data: {
    email: user.email, password: user.password, display_name: user.displayName, family_name: user.familyName,
  } });
  expect(registered.ok()).toBeTruthy();
  await page.goto('/');
  await page.locator('#main-content').waitFor();
  const familyId = await getFamilyId(apiCtx);
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const task = await seedTask(apiCtx, familyId, { title: 'Prepare picnic basket', due_date: today });
  const routine = await seedTask(apiCtx, familyId, { title: 'Water kitchen herbs', due_date: today, recurrence: 'daily' });
  await seedMealPlan(apiCtx, familyId, { plan_date: today, meal_name: 'Vegetable pasta', slot: 'noon' });
  const eventDate = new Date(date);
  eventDate.setDate(date.getDate() + 2);
  const startsAt = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}T09:00:00`;
  await seedCalendarEvent(apiCtx, familyId, { title: 'Family picnic', starts_at: startsAt });
  await page.reload();
  await expect(page.getByTestId('today-status-meals')).toHaveText('1');
  const tasks = page.getByRole('region', { name: 'Open tasks' });
  const check = tasks.getByRole('checkbox', { name: /Prepare picnic basket/ });
  await check.focus();
  await page.keyboard.press('Space');
  await expect(check).toHaveCount(0);
  const taskResponse = await apiCtx.get(`/api/tasks?family_id=${familyId}`);
  expect(taskResponse.ok()).toBeTruthy();
  expect((await taskResponse.json()).items.find((item) => item.id === task.id).status).toBe('done');
  const routines = page.getByRole('region', { name: 'Daily routines' });
  await routines.getByRole('checkbox', { name: /Water kitchen herbs/ }).click();
  await expect(routines.getByRole('button', { name: 'Open routines: 100%' })).toBeVisible();
  await expect(routines).toContainText('1 of 1 completed');
  const routineResponse = await apiCtx.get(`/api/tasks?family_id=${familyId}`);
  expect(routineResponse.ok()).toBeTruthy();
  const savedTasks = (await routineResponse.json()).items;
  expect(savedTasks.find((item) => item.id === routine.id).status).toBe('done');
  expect(savedTasks.some((item) => item.title === routine.title && item.status === 'open' && item.due_date.slice(0, 10) > today)).toBeTruthy();
  await page.getByRole('button', { name: /Noon Vegetable pasta/ }).click();
  await expect(page.getByRole('heading', { name: 'Meal plan', exact: true })).toBeVisible();
  await navigateTo(page, 'Home');
  const metrics = [];
  for (const theme of ['light', 'dark', 'midnight-glass']) {
    await page.evaluate((value) => localStorage.setItem('tribu_theme', value), theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByTestId('today-status-meals')).toHaveText('1');
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole('region', { name: 'Next up' })).toContainText('Family picnic');
      // Resizing crosses the shell's animated sidebar breakpoint. Wait for layout to settle.
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await Promise.all(document.getAnimations().filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
      });
      if (width > 768) await expect(page.locator('.sidebar')).toHaveCSS('width', '229px');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const sizes = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth + 1);
      const card = page.getByRole('region', { name: 'Next up' });
      const time = card.locator('.next-up-meta').first();
      await expect(time).toContainText('09:00');
      const cardBox = await card.boundingBox();
      const timeBox = await time.boundingBox();
      expect(timeBox.x + timeBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      expect(timeBox.y + timeBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
      const captureBox = await page.getByRole('region', { name: 'Quick capture' }).boundingBox();
      for (const button of await page.locator('.quick-capture-actions button').all()) {
        const box = await button.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(captureBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(captureBox.x + captureBox.width);
      }
      const contrast = theme === 'light' ? [] : await measureStatusDetails(page);
      for (const detail of contrast) expect(detail.minimum, `${theme} ${width}px ${detail.kind} detail contrast`).toBeGreaterThanOrEqual(4.5);
      const completedWord = await measureCompletedWord(page);
      expect(completedWord.fragments).toHaveLength(1);
      expect(completedWord.fragments[0].right).toBeLessThanOrEqual(completedWord.container.right + 1);
      const placeholder = await measureCaptureText(page);
      const assertTextFits = (geometry) => {
        expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
        expect(geometry.top).toBeGreaterThanOrEqual(geometry.wrapperTop);
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.wrapperBottom);
      };
      assertTextFits(placeholder);
      if (width >= 390) expect(placeholder.height).toBe(40);
      const input = page.locator('.quick-capture-input');
      await input.fill('First household note\nSecond household note\nThird household note');
      const multiline = await measureCaptureText(page);
      assertTextFits(multiline);
      expect(multiline.height).toBeGreaterThan(placeholder.height);
      if (process.env.DASHBOARD_EVIDENCE_DIR) {
        await fs.mkdir(process.env.DASHBOARD_EVIDENCE_DIR, { recursive: true });
        await page.getByRole('region', { name: 'Quick capture' }).screenshot({ path: path.join(process.env.DASHBOARD_EVIDENCE_DIR, `${testInfo.project.name.replaceAll(' ', '-')}-${theme}-${width}-input.png`) });
      }
      await input.fill('');
      expect((await measureCaptureText(page)).height).toBe(placeholder.height);
      metrics.push({ theme, ...sizes, cardBox, timeBox, captureBox, contrast, completedWord, placeholder, multiline });
      if (process.env.DASHBOARD_EVIDENCE_DIR) {
        await fs.mkdir(process.env.DASHBOARD_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.DASHBOARD_EVIDENCE_DIR, `${testInfo.project.name.replaceAll(' ', '-')}-${theme}-${width}.png`), fullPage: true });
      }
    }
  }
  if (process.env.DASHBOARD_EVIDENCE_DIR) {
    await fs.writeFile(path.join(process.env.DASHBOARD_EVIDENCE_DIR, `${testInfo.project.name.replaceAll(' ', '-')}-metrics.json`), JSON.stringify(metrics, null, 2));
  }
});
