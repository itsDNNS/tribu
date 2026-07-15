const { test, expect } = require('../helpers/fixtures');
const { getFamilyId, seedCalendarEvent } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

async function clickVisibleCenter(page, locator) {
  await locator.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await expect.poll(async () => locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 768) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    return;
  }
  await locator.click();
}

async function cleanupCalendarEvents(request, eventIds, primaryError) {
  const cleanupErrors = [];

  for (const eventId of new Set(eventIds.filter(Boolean))) {
    try {
      const response = await request.delete(`/api/calendar/events/${eventId}`);
      if (!response.ok() && response.status() !== 404) {
        cleanupErrors.push(`DELETE event ${eventId} failed (${response.status()}): ${await response.text()}`);
      }
    } catch (error) {
      cleanupErrors.push(`DELETE event ${eventId} failed: ${error.message}`);
    }
  }

  if (cleanupErrors.length === 0) return;

  const cleanupMessage = `Calendar cleanup failed:\n${cleanupErrors.join('\n')}`;
  if (primaryError) {
    primaryError.message += `\n${cleanupMessage}`;
    return;
  }
  throw new Error(cleanupMessage);
}

test.describe('Calendar', () => {
  test('navigate to calendar and see month view', async ({ authedPage: page }) => {
    await navigateTo(page, 'Calendar');
    await expect(page.locator('.calendar-grid-wrapper')).toBeVisible({ timeout: 10000 });
  });

  test('create and view an event with route planning links', async ({ authedPage: page }) => {
    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    // Click on day 15
    await page.getByRole('button', { name: /^[A-Za-z]+ 15(?:,|$)/ }).click();

    // Fill event title and location in the form that appears
    const form = page.locator('.day-detail-panel .quick-add-form');
    const titleInput = form.locator('input[placeholder="New event..."]');
    await titleInput.waitFor({ timeout: 5000 });
    await titleInput.fill('E2E Test Event');
    await form.locator('input[placeholder="Location or address"]').fill('Sports Park, Field 2');
    await form.locator('#calendar-create-icon').selectOption('soccer');
    await page.evaluate(() => document.activeElement?.blur());

    // Submit
    const submitButton = form.locator('button[type="submit"]');
    await clickVisibleCenter(page, submitButton);

    // Event should appear with location and provider-neutral map links
    await expect(page.getByText('E2E Test Event')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.calendar-day-icon-indicator', { hasText: '⚽' })).toBeVisible();
    await expect(page.locator('.event-card-icon').filter({ hasText: '⚽' })).toBeVisible();
    await expect(page.getByText('Sports Park, Field 2')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Sports%20Park%2C%20Field%202',
    );
    await expect(page.getByRole('link', { name: 'Open in OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/search?query=Sports%20Park%2C%20Field%202',
    );
  });

  test('duplicates only after confirmation and creates an independent local event', async ({ authedPage: page, apiCtx }) => {
    let sourceEvent;
    let duplicateEvent;
    let primaryError;

    try {
      const familyId = await getFamilyId(apiCtx);
      const now = new Date();
      const sourceDate = new Date(now.getFullYear(), now.getMonth(), 15, 14, 0, 0);
      const sourceEnd = new Date(now.getFullYear(), now.getMonth(), 15, 15, 30, 0);
      sourceEvent = await seedCalendarEvent(apiCtx, familyId, {
        title: 'Original Plan',
        description: 'Bring the folder',
        location: 'Community room',
        starts_at: sourceDate.toISOString(),
        ends_at: sourceEnd.toISOString(),
      });

      const createPosts = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/calendar/events') {
          createPosts.push(request.url());
        }
      });

      await navigateTo(page, 'Calendar');
      await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: /^[A-Za-z]+ 15(?:,|$)/ }).click();
      await clickVisibleCenter(page, page.locator('[aria-label="Duplicate event: Original Plan"]'));

      const form = page.locator('.day-detail-panel .quick-add-form');
      await expect(form.locator('input[placeholder="New event..."]')).toHaveValue('Original Plan');
      await expect(page.locator('.day-detail-panel .cal-edit-recurring-hint')).toBeVisible();
      expect(createPosts).toHaveLength(0);

      await form.locator('input[placeholder="New event..."]').fill('Original Plan B');
      await page.getByRole('button', { name: /^[A-Za-z]+ 22(?:,|$)/ }).click();
      const retargetedForm = page.locator('.day-detail-panel .quick-add-form');
      await expect(retargetedForm.locator('input[type="datetime-local"]').first()).toHaveValue(/-22T/);
      await expect(retargetedForm.locator('input[type="datetime-local"]').nth(1)).toHaveValue(/-22T/);
      const duplicateResponsePromise = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/calendar/events'
      ));
      await clickVisibleCenter(page, retargetedForm.locator('button[type="submit"]'));
      duplicateEvent = await (await duplicateResponsePromise).json();

      await expect.poll(() => createPosts.length).toBe(1);
      await expect(page.getByText('Original Plan B')).toBeVisible({ timeout: 10000 });

      await page.getByRole('button', { name: /^[A-Za-z]+ 15(?:,|$)/ }).click();
      await expect(page.getByText('Original Plan', { exact: true })).toBeVisible();
      await clickVisibleCenter(page, page.locator('[aria-label="Delete event: Original Plan"]'));
      await expect(page.getByText('Original Plan', { exact: true })).not.toBeVisible({ timeout: 10000 });

      await page.reload();
      await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: /^[A-Za-z]+ 22(?:,|$)/ }).click();
      await expect(page.getByText('Original Plan B')).toBeVisible({ timeout: 10000 });
      expect(createPosts).toHaveLength(1);
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      await cleanupCalendarEvents(apiCtx, [duplicateEvent?.id, sourceEvent?.id], primaryError);
    }
  });

  test('canceling a duplicate creates nothing', async ({ authedPage: page, apiCtx }) => {
    let sourceEvent;
    let primaryError;

    try {
      const familyId = await getFamilyId(apiCtx);
      const now = new Date();
      const sourceDate = new Date(now.getFullYear(), now.getMonth(), 16, 14, 0, 0);
      sourceEvent = await seedCalendarEvent(apiCtx, familyId, {
        title: 'Cancel Original',
        starts_at: sourceDate.toISOString(),
      });

      const createPosts = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/calendar/events') {
          createPosts.push(request.url());
        }
      });

      await navigateTo(page, 'Calendar');
      await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: /^[A-Za-z]+ 16(?:,|$)/ }).click();
      await clickVisibleCenter(page, page.locator('[aria-label="Duplicate event: Cancel Original"]'));
      await clickVisibleCenter(page, page.getByRole('button', { name: 'Cancel', exact: true }));

      await expect(page.getByText('Quick add')).toBeVisible();
      await expect(page.locator('.day-detail-panel input[placeholder="New event..."]')).toHaveValue('');
      expect(createPosts).toHaveLength(0);

      await page.reload();
      await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: /^[A-Za-z]+ 16(?:,|$)/ }).click();
      await expect(page.locator('.day-event-card').filter({ hasText: 'Cancel Original' })).toHaveCount(1);
      expect(createPosts).toHaveLength(0);
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      await cleanupCalendarEvents(apiCtx, [sourceEvent?.id], primaryError);
    }
  });

  test('routes week-view duplication to the visible month draft', async ({ authedPage: page, apiCtx }) => {
    let sourceEvent;
    let primaryError;

    try {
      const familyId = await getFamilyId(apiCtx);
      const now = new Date();
      const sourceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0);
      sourceEvent = await seedCalendarEvent(apiCtx, familyId, {
        title: 'Week Copy Source',
        starts_at: sourceDate.toISOString(),
      });

      await navigateTo(page, 'Calendar');
      await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });
      await page.getByRole('button', { name: 'Week', exact: true }).click();
      await expect(page.locator('.week-view')).toBeVisible();
      await clickVisibleCenter(page, page.locator('[aria-label="Duplicate event: Week Copy Source"]'));

      await expect(page.locator('.calendar-grid-wrapper')).toBeVisible();
      const form = page.locator('.day-detail-panel .quick-add-form');
      await expect(form).toBeVisible();
      await expect(form.locator('input[placeholder="New event..."]')).toHaveValue('Week Copy Source');
      await expect(page.getByText('Duplicate event', { exact: true })).toBeVisible();
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      await cleanupCalendarEvents(apiCtx, [sourceEvent?.id], primaryError);
    }
  });

  test('month date numbers stay aligned with and without event icons', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);
    const now = new Date();
    const candidateDays = [21, 22, 23, 24, 25, 26, 27].filter((day) => {
      const iconDate = new Date(now.getFullYear(), now.getMonth(), day, 9, 0, 0);
      const plainDate = new Date(now.getFullYear(), now.getMonth(), day + 1, 9, 0, 0);
      return plainDate.getMonth() === now.getMonth() && iconDate.getDay() !== 0 && iconDate.getDay() !== 6;
    });

    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    let iconDayNumber;
    let plainDayNumber;
    for (const day of candidateDays) {
      const iconCandidate = page.locator('.calendar-day:not(.empty)').filter({ has: page.locator('.calendar-day-num', { hasText: new RegExp(`^${day}$`) }) }).first();
      const plainCandidate = page.locator('.calendar-day:not(.empty)').filter({ has: page.locator('.calendar-day-num', { hasText: new RegExp(`^${day + 1}$`) }) }).first();
      if (await iconCandidate.locator('.calendar-day-dots > *').count() === 0 && await plainCandidate.locator('.calendar-day-dots > *').count() === 0) {
        iconDayNumber = day;
        plainDayNumber = day + 1;
        break;
      }
    }
    expect(iconDayNumber).toBeDefined();
    expect(plainDayNumber).toBeDefined();

    const iconDate = new Date(now.getFullYear(), now.getMonth(), iconDayNumber, 9, 0, 0);
    await seedCalendarEvent(apiCtx, familyId, {
      title: 'Alignment Soccer',
      starts_at: iconDate.toISOString(),
      icon: 'soccer',
    });

    await page.reload();
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    const iconDay = page.locator('.calendar-day:not(.empty)').filter({ has: page.locator('.calendar-day-num', { hasText: new RegExp(`^${iconDayNumber}$`) }) }).first();
    const plainDay = page.locator('.calendar-day:not(.empty)').filter({ has: page.locator('.calendar-day-num', { hasText: new RegExp(`^${plainDayNumber}$`) }) }).first();
    await expect(iconDay.locator('.calendar-day-icon-indicator').first()).toBeVisible({ timeout: 10000 });
    await expect(plainDay.locator('.calendar-day-dots > *')).toHaveCount(0);

    const iconBox = await iconDay.locator('.calendar-day-num').boundingBox();
    const plainBox = await plainDay.locator('.calendar-day-num').boundingBox();
    const iconCellBox = await iconDay.boundingBox();
    const plainCellBox = await plainDay.boundingBox();
    expect(iconBox).not.toBeNull();
    expect(plainBox).not.toBeNull();
    expect(iconCellBox).not.toBeNull();
    expect(plainCellBox).not.toBeNull();
    expect(Math.abs(iconBox.y - plainBox.y)).toBeLessThanOrEqual(0.5);
    expect(Math.abs((iconBox.x + iconBox.width / 2) - (iconCellBox.x + iconCellBox.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs((plainBox.x + plainBox.width / 2) - (plainCellBox.x + plainCellBox.width / 2))).toBeLessThanOrEqual(1);
  });

  test('desktop event form gives date-time fields enough room for time entry', async ({ authedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    await page.getByRole('button', { name: /^[A-Za-z]+ 15(?:,|$)/ }).click();

    const form = page.locator('.day-detail-panel .quick-add-form');
    await expect(form).toBeVisible({ timeout: 5000 });
    const startInput = form.locator('input[type="datetime-local"]').first();
    const endInput = form.locator('input[type="datetime-local"]').nth(1);
    await expect(startInput).toBeVisible();
    await expect(endInput).toBeVisible();

    const [formBox, startBox, endBox] = await Promise.all([
      form.boundingBox(),
      startInput.boundingBox(),
      endInput.boundingBox(),
    ]);
    expect(formBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();

    expect(startBox.width).toBeGreaterThan(250);
    expect(endBox.width).toBeGreaterThan(250);
    expect(endBox.y).toBeGreaterThan(startBox.y + startBox.height - 1);
  });

  test('delete an event', async ({ authedPage: page, apiCtx }) => {
    const familyId = await getFamilyId(apiCtx);

    // Seed event on the 20th of the current month
    const now = new Date();
    const eventDate = new Date(now.getFullYear(), now.getMonth(), 20, 14, 0, 0);
    await seedCalendarEvent(apiCtx, familyId, {
      title: 'Delete Me',
      starts_at: eventDate.toISOString(),
    });

    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    // Click on day 20
    await page.getByRole('button', { name: /^[A-Za-z]+ 20(?:,|$)/ }).click();

    // Wait for event to appear
    await expect(page.getByText('Delete Me')).toBeVisible({ timeout: 10000 });

    // Delete it
    const deleteButton = page.locator('[aria-label="Delete event: Delete Me"]');
    await clickVisibleCenter(page, deleteButton);
    await expect(page.getByText('Delete Me')).not.toBeVisible({ timeout: 10000 });
  });

  test('navigate months forward and back', async ({ authedPage: page }) => {
    await navigateTo(page, 'Calendar');
    await page.locator('.calendar-grid-wrapper').waitFor({ timeout: 10000 });

    const monthLabel = page.locator('.calendar-month-label');
    const currentMonth = await monthLabel.textContent();

    // Next month
    await clickVisibleCenter(page, page.locator('[aria-label="Next month"]'));
    await expect(monthLabel).not.toHaveText(currentMonth, { timeout: 5000 });

    // Previous month
    await clickVisibleCenter(page, page.locator('[aria-label="Previous month"]'));
    await expect(monthLabel).toHaveText(currentMonth, { timeout: 5000 });
  });
});
