const { test, expect } = require('../helpers/fixtures');
test.use({viewport:{width:1448,height:1000},serviceWorkers:'block'});
const { getFamilyId, seedCalendarEvent } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

// Let Playwright delay real API requests for the pending-save assertions.
// PWA/service-worker behavior remains covered by the separate PWA suite.
test.use({ serviceWorkers: 'block' });

const date = (day) => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const eventInGrid = (page, title) =>
  page.locator('.tc-calendar-event').filter({ hasText: title });
const dayCell = (page, day) =>
  page
    .locator('.tc-calendar-day:not(.outside)')
    .filter({
      has: page.locator('.tc-day-number', { hasText: new RegExp(`^${day}$`) }),
    });
async function open(page) {
  await navigateTo(page, 'Calendar');
  await expect(page.locator('.tc-calendar-grid')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Loading calendar' }),
  ).toHaveCount(0);
}
async function edit(page, title) {
  await eventInGrid(page, title).first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
}
async function save(page, method = 'PATCH') {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === method &&
      /\/api\/calendar\/events(?:\/\d+)?$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const result = await response;
  expect(result.ok(), await result.text()).toBeTruthy();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return result.json();
}
async function cleanup(request, ids) {
  for (const id of ids.filter(Boolean)) {
    const response = await request.delete(`/api/calendar/events/${id}`);
    expect(response.ok() || response.status() === 404).toBeTruthy();
  }
}
async function listed(request, familyId) {
  const response = await request.get(
    `/api/calendar/events?family_id=${familyId}`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).items;
}

test.describe('Calendar persisted journeys', () => {
  test('retains failed create/edit drafts and submits once while saving', async ({
    authedPage: page,
    apiCtx,
  }) => {
    const familyId = await getFamilyId(apiCtx);
    let created;
    try {
      await open(page);
      await page
        .getByRole('button', { name: 'Create event', exact: true })
        .click();
      await page
        .getByLabel('What is happening?', { exact: true })
        .fill('Retained plan');
      await page.getByLabel('Date', { exact: true }).fill(date(15));
      await page.context().setOffline(true);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
      await expect(
        page.getByLabel('What is happening?', { exact: true }),
      ).toHaveValue('Retained plan');
      await page.context().setOffline(false);
      let release,
        requests = 0;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await page.route('**/api/calendar/events', async (route) => {
        if (route.request().method() === 'POST') {
          requests++;
          await gate;
        }
        await route.continue();
      });
      const posted = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === '/api/calendar/events',
      );
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect.poll(() => requests).toBe(1);
      await expect(
        page.getByRole('button', { name: 'Save', exact: true }),
      ).toBeDisabled();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(requests).toBe(1);
      release();
      const response = await posted;
      expect(response.ok()).toBeTruthy();
      created = await response.json();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.unroute('**/api/calendar/events');
      expect(
        (await listed(apiCtx, familyId)).filter(
          (event) => event.title === 'Retained plan',
        ),
      ).toHaveLength(1);
      await edit(page, 'Retained plan');
      await page.getByLabel('Notes', { exact: true }).fill('Keep these notes');
      await page.context().setOffline(true);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
      await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(
        'Keep these notes',
      );
      await page.context().setOffline(false);
      await save(page);
      await page.reload();
      await open(page);
      await eventInGrid(page, 'Retained plan').click();
      await expect(page.getByRole('dialog')).toContainText('Keep these notes');
    } finally {
      await page.context().setOffline(false);
      await cleanup(apiCtx, [created?.id]);
    }
  });

  test('persists manual and automatic profile colors, member filters and cleared fields', async ({
    authedPage: page,
    apiCtx,
  }) => {
    const familyId = await getFamilyId(apiCtx);
    const me = await (await apiCtx.get('/api/auth/me')).json();
    const memberRes = await apiCtx.get(`/api/families/${familyId}/members`);
    const members = await memberRes.json();
    const originalColor =
      members.find((m) => m.user_id === me.user_id)?.color || null;
    let source;
    try {
      expect(
        (
          await apiCtx.patch(`/api/families/${familyId}/members/me/color`, {
            data: { color: '#06b6d4' },
          })
        ).ok(),
      ).toBeTruthy();
      source = await seedCalendarEvent(apiCtx, familyId, {
        title: 'Color plan',
        starts_at: `${date(15)}T14:00:00`,
        assigned_to: [me.user_id],
        description: 'Clear me',
        color: '#759c5d',
      });
      await page.reload();
      await open(page);
      await edit(page, 'Color plan');
      await page
        .getByRole('button', { name: 'Family colors', exact: true })
        .click();
      await page.getByLabel('Notes', { exact: true }).fill('');
      const changed = await save(page);
      expect(changed.color).toBeNull();
      expect(changed.description).toBe('');
      await expect(eventInGrid(page, 'Color plan')).toHaveCSS(
        '--event-color',
        '#06b6d4',
      );
      await page
        .locator('.tc-family-filters')
        .getByRole('button', { name: me.display_name, exact: true })
        .click();
      await expect(eventInGrid(page, 'Color plan')).toHaveCount(1);
      await edit(page, 'Color plan');
      await page
        .getByRole('checkbox', { name: me.display_name, exact: true })
        .uncheck();
      const unassigned = await save(page);
      expect(unassigned.assigned_to).toEqual([]);
      await expect(eventInGrid(page, 'Color plan')).toHaveCount(0);
      await page
        .locator('.tc-family-filters')
        .getByRole('button', { name: me.display_name, exact: true })
        .click();
      await edit(page, 'Color plan');
      await page.getByRole('button', { name: '#d8a245', exact: true }).click();
      await save(page);
      await page.reload();
      await open(page);
      await expect(eventInGrid(page, 'Color plan')).toHaveCSS(
        '--event-color',
        '#d8a245',
      );
    } finally {
      await cleanup(apiCtx, [source?.id]);
      expect(
        (
          await apiCtx.patch(`/api/families/${familyId}/members/me/color`, {
            data: { color: originalColor },
          })
        ).ok(),
      ).toBeTruthy();
    }
  });

  test('displays multi-day all-day spans and preserves all-day on edit', async ({
    authedPage: page,
    apiCtx,
  }) => {
    const familyId = await getFamilyId(apiCtx);
    let source;
    try {
      source = await seedCalendarEvent(apiCtx, familyId, {
        title: 'Family trip',
        starts_at: `${date(15)}T00:00:00`,
        ends_at: `${date(18)}T00:00:00`,
        all_day: true,
      });
      await open(page);
      await expect(eventInGrid(page, 'Family trip')).toHaveCount(3);
      for (const day of [15, 16, 17])
        await expect(dayCell(page, day)).toContainText('All dayFamily trip');
      await expect(dayCell(page, 18)).not.toContainText('Family trip');
      await edit(page, 'Family trip');
      await expect(
        page.getByRole('checkbox', { name: 'All day', exact: true }),
      ).toBeChecked();
      await page.getByLabel('Notes', { exact: true }).fill('Holiday');
      const updated = await save(page);
      expect(updated.all_day).toBe(true);
      await page.getByRole('button', { name: 'Week', exact: true }).click();
      // Week opens around the selected date, which can be outside the seeded span.
      await page.getByRole('button', { name: 'Month', exact: true }).click();
      await edit(page, 'Family trip');
      await page.getByLabel('End date', { exact: true }).fill('');
      const withoutEndDate = await save(page);
      expect(withoutEndDate.ends_at).toBeNull();
      const persisted = (await listed(apiCtx, familyId)).find(
        (event) => event.id === source.id,
      );
      expect(persisted.ends_at).toBeNull();
      expect(persisted.starts_at).toBe(source.starts_at);
      await edit(page, 'Family trip');
      await expect(page.getByLabel('End date', { exact: true })).toHaveValue('');
      await expect(page.getByLabel('Until', { exact: true })).toHaveValue('');
      // Restore a multi-day end through the date control, retaining its time.
      await page.getByLabel('Until', { exact: true }).fill('15:00');
      await page.getByLabel('End date', { exact: true }).fill(date(18));
      await expect(page.getByLabel('Until', { exact: true })).toHaveValue('15:00');
      const restored = await save(page);
      expect(restored.ends_at).toContain(`${date(18)}T15:00`);
      await edit(page, 'Family trip');
      await page.getByLabel('Until', { exact: true }).fill('');
      const cleared = await save(page);
      expect(cleared.ends_at).toBeNull();
      await expect(eventInGrid(page, 'Family trip')).toHaveCount(1);
    } finally {
      await cleanup(apiCtx, [source?.id]);
    }
  });

  test('creates recurrence with an end date and deletes occurrence then series', async ({
    authedPage: page,
    apiCtx,
  }) => {
    let source;
    try {
      await open(page);
      await page
        .getByRole('button', { name: 'Create event', exact: true })
        .click();
      await page
        .getByLabel('What is happening?', { exact: true })
        .fill('Weekly music');
      await page.getByLabel('Date', { exact: true }).fill(date(8));
      await page.locator('.tc-advanced summary').click();
      await page
        .getByLabel('Recurring', { exact: true })
        .selectOption('weekly');
      await page.getByLabel('Repeat until', { exact: true }).fill(date(28));
      source = await save(page, 'POST');
      expect(source.recurrence_end).toContain(date(28));
      await expect(eventInGrid(page, 'Weekly music')).toHaveCount(3);
      await dayCell(page, 15)
        .locator('.tc-calendar-event')
        .filter({ hasText: 'Weekly music' })
        .click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page
        .getByRole('button', { name: 'Only this event', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(eventInGrid(page, 'Weekly music')).toHaveCount(2);
      await expect(dayCell(page, 15)).not.toContainText('Weekly music');
      await edit(page, 'Weekly music');
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page
        .getByRole('button', { name: 'All events', exact: true })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.reload();
      await open(page);
      await expect(eventInGrid(page, 'Weekly music')).toHaveCount(0);
    } finally {
      await cleanup(apiCtx, [source?.id]);
    }
  });

  test('keeps an imported event read-only and duplicates its notes as an independent local event', async ({
    authedPage: page,
    apiCtx,
  }) => {
    const familyId = await getFamilyId(apiCtx);
    let source, copy;
    try {
      const day = date(15).replaceAll('-', '');
      const response = await apiCtx.post('/api/calendar/events/import-ics', {
        data: {
          family_id: familyId,
          ics_text: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:calendar-journey-${Date.now()}\r\nDTSTART:${day}T140000\r\nDTEND:${day}T150000\r\nSUMMARY:Imported lesson\r\nDESCRIPTION:Bring your book\r\nEND:VEVENT\r\nEND:VCALENDAR`,
          source_name: 'Local test calendar',
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      source = (await listed(apiCtx, familyId)).find(
        (e) => e.title === 'Imported lesson',
      );
      expect(source.source_type).toBe('import');
      await open(page);
      await eventInGrid(page, 'Imported lesson').click();
      await expect(
        page.getByRole('button', { name: 'Edit', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('dialog')).toContainText('Bring your book');
      await page
        .getByRole('button', { name: 'Duplicate event', exact: true })
        .click();
      await page
        .getByLabel('What is happening?', { exact: true })
        .fill('Local lesson');
      copy = await save(page, 'POST');
      expect(copy.source_type).toBe('local');
      await cleanup(apiCtx, [source.id]);
      await page.reload();
      await open(page);
      await eventInGrid(page, 'Local lesson').click();
      await expect(
        page.getByRole('button', { name: 'Edit', exact: true }),
      ).toBeVisible();
    } finally {
      await cleanup(apiCtx, [source?.id, copy?.id]);
    }
  });

  test('loads adjacent-year birthdays and exposes honest range failure and retry', async ({
    authedPage: page,
    apiCtx,
  }) => {
    const familyId = await getFamilyId(apiCtx);
    let contact;
    try {
      const response = await apiCtx.post('/api/contacts', {
        data: {
          family_id: familyId,
          full_name: 'New Year birthday',
          birthday_month: 1,
          birthday_day: 1,
        },
      });
      expect(response.ok()).toBeTruthy();
      contact = await response.json();
      await page.evaluate(() =>
        sessionStorage.setItem('tribu_calendar_focus', '2026-12-15T12:00:00'),
      );
      await page.reload();
      await open(page);
      await expect(
        page
          .locator('.tc-calendar-day.outside .tc-calendar-event')
          .filter({ hasText: 'New Year birthday' }),
      ).toHaveCount(1);
      await page
        .locator('.tc-calendar-event')
        .filter({ hasText: 'New Year birthday' })
        .click();
      await expect(page.getByRole('dialog')).toContainText('2027');
      await expect(
        page.getByRole('button', { name: 'Duplicate event', exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.context().setOffline(true);
      await page
        .getByRole('button', { name: 'Next month', exact: true })
        .click();
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'The calendar could not be loaded.' }),
      ).toBeVisible();
      await expect(page.locator('.tc-calendar-grid')).toHaveCount(0);
      await page.context().setOffline(false);
      await page
        .getByRole('button', { name: 'Try again', exact: true })
        .click();
      await expect(page.locator('.tc-calendar-grid')).toBeVisible();
      await expect(eventInGrid(page, 'New Year birthday')).toHaveCount(1);
    } finally {
      await page.context().setOffline(false);
      if (contact)
        expect(
          (await apiCtx.delete(`/api/contacts/${contact.id}`)).ok(),
        ).toBeTruthy();
    }
  });
});

test('a signed-in child can read calendar events but cannot mutate them', async ({
  authedPage: page,
  apiCtx,
  browser,
}) => {
  const familyId = await getFamilyId(apiCtx);
  let source, childId, invite;
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL,
    serviceWorkers: 'block',
  });
  try {
    source = await seedCalendarEvent(apiCtx, familyId, {
      title: 'Child visible plan',
      starts_at: `${date(15)}T14:00:00`,
    });
    const invitation = await apiCtx.post(
      `/api/families/${familyId}/invitations`,
      { data: { role_preset: 'member', is_adult_preset: false, max_uses: 1 } },
    );
    expect(invitation.ok()).toBeTruthy();
    invite = await invitation.json();
    const registered = await context.request.post(
      '/api/auth/register-with-invite',
      {
        data: {
          token: invite.token,
          email: `calendar-child-${Date.now()}@example.com`,
          password: 'Calendar1234',
          display_name: 'Calendar Child',
        },
      },
    );
    expect(registered.ok(), await registered.text()).toBeTruthy();
    const me = await (await context.request.get('/api/auth/me')).json();
    childId = me.user_id;
    expect(
      (await context.request.post('/api/auth/me/complete-onboarding')).ok(),
    ).toBeTruthy();
    const child = await context.newPage();
    await child.goto('/');
    await open(child);
    await expect(
      child.getByRole('button', { name: 'Create event', exact: true }),
    ).toHaveCount(0);
    await eventInGrid(child, 'Child visible plan').click();
    await expect(child.getByRole('dialog')).toContainText('Child visible plan');
    for (const action of ['Edit', 'Delete', 'Duplicate event'])
      await expect(
        child
          .getByRole('dialog')
          .getByRole('button', { name: action, exact: true }),
      ).toHaveCount(0);
    const forbidden = await context.request.post('/api/calendar/events', {
      data: {
        family_id: familyId,
        title: 'Forbidden',
        starts_at: `${date(15)}T14:00:00`,
      },
    });
    expect(forbidden.status()).toBe(403);
    await child.keyboard.press('Escape');
    await expect(child.getByRole('dialog')).toHaveCount(0);
  } finally {
    await context.close();
    await cleanup(apiCtx, [source?.id]);
    if (childId)
      expect(
        (
          await apiCtx.delete(`/api/families/${familyId}/members/${childId}`)
        ).ok(),
      ).toBeTruthy();
    if (invite)
      expect(
        (
          await apiCtx.delete(
            `/api/families/${familyId}/invitations/${invite.id}`,
          )
        ).ok(),
      ).toBeTruthy();
  }
});
