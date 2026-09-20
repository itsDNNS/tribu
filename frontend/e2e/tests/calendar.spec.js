const { test, expect } = require('../helpers/fixtures');
test.use({viewport:{width:1448,height:1000},serviceWorkers:'block'});
const { getFamilyId, seedCalendarEvent } = require('../helpers/api-setup');
const { navigateTo } = require('../helpers/navigation');

const monthDate = (day) => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const dayButton = (page, day) =>
  page
    .locator('.tc-calendar-day:not(.outside) .tc-day-number')
    .filter({ hasText: new RegExp(`^${day}$`) });
async function calendar(page) {
  await navigateTo(page, 'Calendar');
  await expect(page.locator('.tc-calendar-grid')).toBeVisible();
}
async function openEvent(page, day, title) {
  await dayButton(page, day).click();
  await page
    .getByRole('dialog')
    .getByRole('button')
    .filter({ hasText: title })
    .click();
}
async function seed(request, title, day = 15, extra = {}) {
  const familyId = await getFamilyId(request);
  return seedCalendarEvent(request, familyId, {
    title,
    starts_at: `${monthDate(day)}T14:00:00`,
    ends_at: `${monthDate(day)}T15:00:00`,
    ...extra,
  });
}
async function cleanup(request, ids) {
  for (const id of ids.filter(Boolean)) {
    const response = await request.delete(`/api/calendar/events/${id}`);
    expect(response.ok() || response.status() === 404).toBeTruthy();
  }
}

test.describe('Mockup calendar', () => {
  test('shows complete week rows and navigates months in both directions', async ({
    authedPage: page,
  }) => {
    await calendar(page);
    const expected=await page.evaluate(()=>{const d=new Date(),first=new Date(d.getFullYear(),d.getMonth(),1),last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();return Math.ceil(((first.getDay()+6)%7+last)/7)*7;});
    await expect(page.locator('.tc-calendar-day')).toHaveCount(expected);
    const label = page.locator('.tc-date-nav>.ui-date-label');
    const current = await label.textContent();
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(label).not.toHaveText(current);
    await page
      .getByRole('button', { name: 'Previous month', exact: true })
      .click();
    await expect(label).toHaveText(current);
  });

  test('creates, opens and edits a dated event with notes and map links', async ({
    authedPage: page,
    apiCtx,
  }) => {
    let created;
    try {
      await calendar(page);
      await dayButton(page, 15).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Create event', exact: true })
        .click();
      await page
        .getByLabel('What is happening?', { exact: true })
        .fill('E2E family moment');
      await page
        .getByLabel('Location', { exact: true })
        .fill('Sports Park, Field 2');
      await page.getByLabel('Notes', { exact: true }).fill('Bring the ball');
      await page.locator('.tc-advanced summary').click();
      await page
        .getByLabel('Event icon', { exact: true })
        .selectOption('soccer');
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === '/api/calendar/events',
      );
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      created = await (await response).json();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await openEvent(page, 15, 'E2E family moment');
      await expect(page.getByRole('dialog')).toContainText('Bring the ball');
      await expect(
        page.getByRole('link', { name: 'Open in Google Maps' }),
      ).toHaveAttribute(
        'href',
        'https://www.google.com/maps/search/?api=1&query=Sports%20Park%2C%20Field%202',
      );
      await expect(
        page.getByRole('link', { name: 'Open in OpenStreetMap' }),
      ).toHaveAttribute(
        'href',
        'https://www.openstreetmap.org/search?query=Sports%20Park%2C%20Field%202',
      );
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(
        'Bring the ball',
      );
      await page
        .getByLabel('What is happening?', { exact: true })
        .fill('Changed family moment');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.reload();
      await openEvent(page, 15, 'Changed family moment');
      await expect(page.getByRole('dialog')).toContainText('Bring the ball');
    } finally {
      await cleanup(apiCtx, [created?.id]);
    }
  });

  test('duplicates only on save, retargets dates and stays independent after deleting the source', async ({
    authedPage: page,
    apiCtx,
  }) => {
    let source, duplicate;
    try {
      source = await seed(apiCtx, 'Original plan', 15, {
        description: 'Bring the folder',
      });
      const posts = [];
      page.on('request', (r) => {
        if (
          r.method() === 'POST' &&
          new URL(r.url()).pathname === '/api/calendar/events'
        )
          posts.push(r);
      });
      await calendar(page);
      await openEvent(page, 15, 'Original plan');
      await page
        .getByRole('button', { name: 'Duplicate event', exact: true })
        .click();
      await expect(
        page.getByLabel('What is happening?', { exact: true }),
      ).toHaveValue('Original plan');
      await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(
        'Bring the folder',
      );
      expect(posts).toHaveLength(0);
      await page
        .getByLabel('What is happening?', { exact: true })
        .fill('Independent plan');
      await page.getByLabel('Date', { exact: true }).fill(monthDate(22));
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === '/api/calendar/events',
      );
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      duplicate = await (await response).json();
      expect(posts).toHaveLength(1);
      expect(duplicate.starts_at).toContain(monthDate(22));
      expect(duplicate.ends_at).toContain(monthDate(22));
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await openEvent(page, 15, 'Original plan');
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveAccessibleName(
        'Delete this event?',
      );
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.reload();
      await openEvent(page, 22, 'Independent plan');
      await expect(page.getByRole('dialog')).toContainText('Bring the folder');
    } finally {
      await cleanup(apiCtx, [source?.id, duplicate?.id]);
    }
  });

  test('canceling a duplicate writes nothing and week-view editing uses the same overlay', async ({
    authedPage: page,
    apiCtx,
  }) => {
    let source;
    try {
      const day = new Date().getDate();
      source = await seed(apiCtx, 'Week copy source', day);
      const posts = [];
      page.on('request', (r) => {
        if (
          r.method() === 'POST' &&
          new URL(r.url()).pathname === '/api/calendar/events'
        )
          posts.push(r);
      });
      await calendar(page);
      await page.getByRole('button', { name: 'Week', exact: true }).click();
      await page
        .locator('.tc-week-item')
        .filter({ hasText: 'Week copy source' })
        .click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(
        page.getByLabel('What is happening?', { exact: true }),
      ).toHaveValue('Week copy source');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page
        .locator('.tc-week-item')
        .filter({ hasText: 'Week copy source' })
        .click();
      await page
        .getByRole('button', { name: 'Duplicate event', exact: true })
        .click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(posts).toHaveLength(0);
      await expect(
        page
          .locator('.tc-calendar-event')
          .filter({ hasText: 'Week copy source' }),
      ).toHaveCount(1);
    } finally {
      await cleanup(apiCtx, [source?.id]);
    }
  });

  test('keeps focus in the overlay and restores it on Escape', async ({
    authedPage: page,
  }) => {
    await calendar(page);
    const trigger = page.getByRole('button', {
      name: 'Create event',
      exact: true,
    });
    await trigger.click();
    await expect(
      page.getByLabel('What is happening?', { exact: true }),
    ).toBeFocused();
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Tab');
      expect(
        await page
          .getByRole('dialog')
          .evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});

test('restores day focus and page scrolling after changing dialog views', async ({
  authedPage: page,
  apiCtx,
}) => {
  let source;
  try {
    source = await seed(apiCtx, 'Focus restoration plan', 15);
    await calendar(page);
    const trigger = dayButton(page, 15);
    await trigger.click();
    await page
      .getByRole('dialog')
      .getByRole('button')
      .filter({ hasText: 'Focus restoration plan' })
      .click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(
      page.getByLabel('What is happening?', { exact: true }),
    ).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      'hidden',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      'hidden',
    );
  } finally {
    await cleanup(apiCtx, [source?.id]);
  }
});
