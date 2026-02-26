/**
 * Seed helpers — create test data via API.
 * All functions take `request` (page.request) which shares the auth cookie.
 */

async function getFamilyId(request) {
  const res = await request.get('/api/families/me');
  if (!res.ok()) {
    throw new Error(`GET /api/families/me failed (${res.status()}): ${await res.text()}`);
  }
  const families = await res.json();
  return families[0].family_id;
}

async function seedCalendarEvent(request, familyId, overrides = {}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const res = await request.post('/api/calendar/events', {
    data: {
      family_id: familyId,
      title: 'Test Event',
      starts_at: tomorrow.toISOString(),
      ...overrides,
    },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/calendar/events failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

async function seedTask(request, familyId, overrides = {}) {
  const res = await request.post('/api/tasks', {
    data: {
      family_id: familyId,
      title: 'Test Task',
      ...overrides,
    },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/tasks failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

async function completeTask(request, taskId) {
  const res = await request.patch(`/api/tasks/${taskId}`, {
    data: { status: 'done' },
  });
  if (!res.ok()) {
    throw new Error(`PATCH /api/tasks/${taskId} failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

async function seedShoppingList(request, familyId, name = 'Test List') {
  const res = await request.post('/api/shopping/lists', {
    data: { family_id: familyId, name },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/shopping/lists failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

async function seedShoppingItem(request, listId, name = 'Milk', spec = '') {
  const res = await request.post(`/api/shopping/lists/${listId}/items`, {
    data: { name, spec },
  });
  if (!res.ok()) {
    throw new Error(`POST /api/shopping/lists/${listId}/items failed (${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

module.exports = {
  getFamilyId,
  seedCalendarEvent,
  seedTask,
  completeTask,
  seedShoppingList,
  seedShoppingItem,
};
