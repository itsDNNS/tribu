import {
  apiLogin, apiRegister, apiLogout, apiGetMe, apiUpdateProfileImage,
  apiGetMyFamilies, apiGetMembers, apiSetAdult, apiSetRole,
  apiGetDashboard, apiGetEvents, apiCreateEvent, apiAddBirthday,
  apiGetContacts, apiImportContactsCsv,
  apiExportCalendarIcs, apiImportCalendarIcs, apiExportContactsCsv,
  apiGetActivity,
  apiCreateQuickCapture, apiGetQuickCaptureInbox, apiConvertQuickCapture, apiDismissQuickCapture,
  apiGetTasks, apiCreateTask, apiUpdateTask, apiDeleteTask,
  apiListRecipes, apiCreateRecipe, apiUpdateRecipe, apiDeleteRecipe, apiAddRecipeIngredientsToShopping,
} from '../../lib/api';

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 1 }) }),
  );
});

afterEach(() => jest.restoreAllMocks());

function lastCall() {
  return global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
}

describe('Auth API', () => {
  it('apiLogin sends POST to /api/auth/login', async () => {
    const result = await apiLogin('a@b.c', 'pw');
    expect(result.ok).toBe(true);
    const [url, opts] = lastCall();
    expect(url).toBe('/api/auth/login');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@b.c', password: 'pw' });
  });

  it('apiRegister sends POST to /api/auth/register', async () => {
    await apiRegister('a@b.c', 'pw', 'Dennis', 'TestFam');
    const [url, opts] = lastCall();
    expect(url).toBe('/api/auth/register');
    expect(JSON.parse(opts.body)).toMatchObject({ email: 'a@b.c', display_name: 'Dennis' });
  });

  it('apiLogout sends POST', async () => {
    await apiLogout();
    expect(lastCall()[0]).toBe('/api/auth/logout');
  });

  it('apiGetMe sends GET', async () => {
    await apiGetMe();
    expect(lastCall()[0]).toBe('/api/auth/me');
    expect(lastCall()[1].credentials).toBe('include');
  });

  it('apiUpdateProfileImage sends PATCH', async () => {
    await apiUpdateProfileImage('data:image/png;base64,...');
    const [url, opts] = lastCall();
    expect(url).toBe('/api/auth/me/profile-image');
    expect(opts.method).toBe('PATCH');
  });
});

describe('Families API', () => {
  it('apiGetMyFamilies', async () => {
    await apiGetMyFamilies();
    expect(lastCall()[0]).toBe('/api/families/me');
  });

  it('apiGetMembers', async () => {
    await apiGetMembers('5');
    expect(lastCall()[0]).toBe('/api/families/5/members');
  });

  it('apiSetAdult sends PATCH', async () => {
    await apiSetAdult('2', '3', true);
    const [url, opts] = lastCall();
    expect(url).toBe('/api/families/2/members/3/adult');
    expect(JSON.parse(opts.body)).toEqual({ is_adult: true });
  });

  it('apiSetRole sends PATCH', async () => {
    await apiSetRole('2', '3', 'admin');
    const [url, opts] = lastCall();
    expect(url).toBe('/api/families/2/members/3/role');
    expect(JSON.parse(opts.body)).toEqual({ role: 'admin' });
  });
});

describe('Dashboard API', () => {
  it('apiGetDashboard includes family_id', async () => {
    await apiGetDashboard('7');
    expect(lastCall()[0]).toBe('/api/dashboard/summary?family_id=7');
  });

  it('apiGetActivity includes family_id and pagination', async () => {
    await apiGetActivity('7', 5, 10);
    expect(lastCall()[0]).toBe('/api/activity?family_id=7&limit=5&offset=10');
  });

  it('quick capture API supports create, list, convert, and dismiss', async () => {
    await apiCreateQuickCapture({ family_id: 7, text: 'Buy milk' });
    expect(lastCall()[0]).toBe('/api/quick-capture');
    expect(lastCall()[1].method).toBe('POST');

    await apiGetQuickCaptureInbox('7', 6, 2);
    expect(lastCall()[0]).toBe('/api/quick-capture/inbox?family_id=7&limit=6&offset=2');

    await apiConvertQuickCapture(11, { target_type: 'task' });
    expect(lastCall()[0]).toBe('/api/quick-capture/inbox/11/convert');
    expect(lastCall()[1].method).toBe('POST');

    await apiDismissQuickCapture(11);
    expect(lastCall()[0]).toBe('/api/quick-capture/inbox/11/dismiss');
    expect(lastCall()[1].method).toBe('POST');
  });
});

describe('Calendar API', () => {
  it('apiGetEvents unwraps paginated response', async () => {
    const events = [{ id: 1, title: 'Test' }];
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ items: events, total: 1, offset: 0, limit: 50 }) }),
    );
    const result = await apiGetEvents('1');
    expect(lastCall()[0]).toBe('/api/calendar/events?family_id=1');
    expect(result.data).toEqual(events);
  });

  it('apiCreateEvent sends POST', async () => {
    await apiCreateEvent({ family_id: 1, title: 'Test' });
    const [url, opts] = lastCall();
    expect(url).toBe('/api/calendar/events');
    expect(opts.method).toBe('POST');
  });

  it('apiAddBirthday sends POST', async () => {
    await apiAddBirthday({ family_id: 1, person_name: 'Max', month: 3, day: 15 });
    expect(lastCall()[0]).toBe('/api/birthdays');
  });
});

describe('Contacts API', () => {
  it('apiGetContacts', async () => {
    await apiGetContacts('1');
    expect(lastCall()[0]).toBe('/api/contacts?family_id=1');
  });

  it('apiImportContactsCsv sends POST', async () => {
    await apiImportContactsCsv(1, 'Name,Email\nMax,max@test.de');
    const [, opts] = lastCall();
    expect(JSON.parse(opts.body)).toMatchObject({ family_id: 1 });
  });
});

describe('Calendar ICS Import/Export API', () => {
  it('apiExportCalendarIcs fetches GET with family_id', async () => {
    await apiExportCalendarIcs('3');
    const [url, opts] = lastCall();
    expect(url).toBe('/api/calendar/events/export.ics?family_id=3');
    expect(opts?.method).toBeUndefined(); // GET is default
  });

  it('apiImportCalendarIcs sends POST with ics_text', async () => {
    await apiImportCalendarIcs(1, 'BEGIN:VCALENDAR...');
    const [url, opts] = lastCall();
    expect(url).toBe('/api/calendar/events/import-ics');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ family_id: 1, ics_text: 'BEGIN:VCALENDAR...' });
  });
});

describe('Contacts CSV Export API', () => {
  it('apiExportContactsCsv fetches GET with family_id', async () => {
    await apiExportContactsCsv('4');
    const [url, opts] = lastCall();
    expect(url).toBe('/api/contacts/export.csv?family_id=4');
    expect(opts?.method).toBeUndefined();
  });
});

describe('Tasks API', () => {
  it('apiGetTasks unwraps paginated response', async () => {
    const tasks = [{ id: 1, title: 'Do laundry' }];
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ items: tasks, total: 1, offset: 0, limit: 50 }) }),
    );
    const result = await apiGetTasks('2');
    expect(lastCall()[0]).toBe('/api/tasks?family_id=2');
    expect(result.data).toEqual(tasks);
  });

  it('apiCreateTask sends POST', async () => {
    await apiCreateTask({ family_id: 1, title: 'Do laundry' });
    const [url, opts] = lastCall();
    expect(url).toBe('/api/tasks');
    expect(opts.method).toBe('POST');
  });

  it('apiUpdateTask sends PATCH', async () => {
    await apiUpdateTask(5, { status: 'done' });
    const [url, opts] = lastCall();
    expect(url).toBe('/api/tasks/5');
    expect(opts.method).toBe('PATCH');
  });

  it('apiDeleteTask sends DELETE', async () => {
    await apiDeleteTask(5);
    const [url, opts] = lastCall();
    expect(url).toBe('/api/tasks/5');
    expect(opts.method).toBe('DELETE');
  });
});

describe('Recipes API', () => {
  it('apiListRecipes includes family_id', async () => {
    await apiListRecipes('7');
    expect(lastCall()[0]).toBe('/api/recipes?family_id=7');
  });

  it('apiCreateRecipe sends POST', async () => {
    await apiCreateRecipe({ family_id: 1, title: 'Pasta' });
    const [url, opts] = lastCall();
    expect(url).toBe('/api/recipes');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ family_id: 1, title: 'Pasta' });
  });

  it('apiUpdateRecipe sends PATCH', async () => {
    await apiUpdateRecipe(5, { title: 'Soup' });
    const [url, opts] = lastCall();
    expect(url).toBe('/api/recipes/5');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ title: 'Soup' });
  });

  it('apiDeleteRecipe sends DELETE', async () => {
    await apiDeleteRecipe(5);
    const [url, opts] = lastCall();
    expect(url).toBe('/api/recipes/5');
    expect(opts.method).toBe('DELETE');
  });

  it('apiAddRecipeIngredientsToShopping sends selected ingredient names', async () => {
    await apiAddRecipeIngredientsToShopping(5, 9, ['Flour']);
    const [url, opts] = lastCall();
    expect(url).toBe('/api/recipes/5/add-to-shopping');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ shopping_list_id: 9, ingredient_names: ['Flour'] });
  });
});
