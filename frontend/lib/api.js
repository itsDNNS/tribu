const API = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, { credentials: 'include', ...options });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(path, body) {
  return request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(path, body) {
  const opts = { method: 'DELETE' };
  if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  return request(path, opts);
}

// Health
export function apiGetHealth() {
  return request('/health');
}

// Auth
export function apiLogin(email, password) {
  return post('/auth/login', { email, password });
}

export function apiRegister(email, password, display_name, family_name) {
  return post('/auth/register', { email, password, display_name, family_name });
}

export function apiLogout() {
  return post('/auth/logout');
}

export function apiGetMe() {
  return request('/auth/me');
}

export function apiUpdateProfileImage(profile_image) {
  return patch('/auth/me/profile-image', { profile_image });
}

export function apiChangePassword(old_password, new_password) {
  return patch('/auth/me/password', { old_password, new_password });
}

export function apiCompleteOnboarding() {
  return post('/auth/me/complete-onboarding');
}

export function apiLeaveFamily(family_id) {
  return post('/auth/me/leave-family', { family_id });
}

export function apiDeleteAccount(confirmation) {
  return del('/auth/me', { confirmation });
}

// Families
export function apiGetMyFamilies() {
  return request('/families/me');
}

export function apiGetMembers(familyId) {
  return request(`/families/${familyId}/members`);
}

export function apiSetAdult(familyId, userId, is_adult) {
  return patch(`/families/${familyId}/members/${userId}/adult`, { is_adult });
}

export function apiSetRole(familyId, userId, role) {
  return patch(`/families/${familyId}/members/${userId}/role`, { role });
}

export function apiCreateMember(familyId, payload) {
  return post(`/families/${familyId}/members`, payload);
}

export function apiResetMemberPassword(familyId, userId) {
  return post(`/families/${familyId}/members/${userId}/reset-password`);
}

export function apiRemoveMember(familyId, userId) {
  return del(`/families/${familyId}/members/${userId}`);
}

export function apiSetMemberColor(familyId, color) {
  return patch(`/families/${familyId}/members/me/color`, { color });
}

// Audit Log
export function apiGetAuditLog(familyId, limit = 50, offset = 0) {
  return request(`/families/${familyId}/audit-log?limit=${limit}&offset=${offset}`);
}

// Dashboard
export function apiGetDashboard(familyId) {
  return request(`/dashboard/summary?family_id=${familyId}`);
}

export function apiGetActivity(familyId, limit = 10, offset = 0) {
  return request(`/activity?family_id=${familyId}&limit=${limit}&offset=${offset}`);
}

export function apiCreateQuickCapture(payload) {
  return post('/quick-capture', payload);
}

export function apiGetQuickCaptureInbox(familyId, limit = 10, offset = 0) {
  return request(`/quick-capture/inbox?family_id=${familyId}&limit=${limit}&offset=${offset}`);
}

export function apiConvertQuickCapture(itemId, payload) {
  return post(`/quick-capture/inbox/${itemId}/convert`, payload);
}

export function apiDismissQuickCapture(itemId) {
  return post(`/quick-capture/inbox/${itemId}/dismiss`, {});
}

// Calendar
export async function apiGetEvents(familyId, rangeStart, rangeEnd) {
  let url = `/calendar/events?family_id=${familyId}`;
  if (rangeStart) url += `&range_start=${encodeURIComponent(rangeStart)}`;
  if (rangeEnd) url += `&range_end=${encodeURIComponent(rangeEnd)}`;
  const res = await request(url);
  if (res.ok && res.data?.items) {
    return { ok: true, data: res.data.items };
  }
  return res;
}

export function apiCreateEvent(payload) {
  return post('/calendar/events', payload);
}

export function apiUpdateEvent(eventId, payload) {
  return patch(`/calendar/events/${eventId}`, payload);
}

export function apiDeleteEvent(eventId, occurrenceDate) {
  let url = `/calendar/events/${eventId}`;
  if (occurrenceDate) url += `?occurrence_date=${encodeURIComponent(occurrenceDate)}`;
  return request(url, { method: 'DELETE' });
}

export function apiGetBirthdays(familyId) {
  return request(`/birthdays?family_id=${familyId}`);
}

export function apiAddBirthday(payload) {
  return post('/birthdays', payload);
}

export function apiUpdateBirthday(birthdayId, payload) {
  return patch(`/birthdays/${birthdayId}`, payload);
}

export function apiDeleteBirthday(birthdayId) {
  return del(`/birthdays/${birthdayId}`);
}

// Contacts
export function apiGetContacts(familyId) {
  return request(`/contacts?family_id=${familyId}`);
}

export function apiCreateContact(payload) {
  return post('/contacts', payload);
}

export function apiUpdateContact(contactId, payload) {
  return patch(`/contacts/${contactId}`, payload);
}

export function apiDeleteContact(contactId) {
  return del(`/contacts/${contactId}`);
}

export function apiImportContactsCsv(family_id, csv_text) {
  return post('/contacts/import-csv', { family_id, csv_text });
}

export async function apiExportContactsCsv(familyId) {
  return fetch(`${API}/contacts/export.csv?family_id=${familyId}`, { credentials: 'include' });
}

export async function apiExportCalendarIcs(familyId) {
  return fetch(`${API}/calendar/events/export.ics?family_id=${familyId}`, { credentials: 'include' });
}

export function apiImportCalendarIcs(family_id, ics_text) {
  return post('/calendar/events/import-ics', { family_id, ics_text });
}

export function apiPreviewImportCalendarIcs(family_id, ics_text) {
  return post('/calendar/events/import-ics/preview', { family_id, ics_text });
}

export function apiSubscribeCalendarIcs(family_id, source_url, source_name = '') {
  return post('/calendar/events/subscribe-ics', { family_id, source_url, source_name });
}

export function apiPreviewSubscribeCalendarIcs(family_id, source_url, source_name = '') {
  return post('/calendar/events/subscribe-ics/preview', { family_id, source_url, source_name });
}

export function apiGetCalendarSubscriptions(family_id) {
  return request(`/calendar/subscriptions?family_id=${family_id}`);
}

export function apiCreateCalendarSubscription(family_id, source_url, source_name = '') {
  return post('/calendar/subscriptions', { family_id, source_url, source_name });
}

export function apiRefreshCalendarSubscription(subscriptionId) {
  return post(`/calendar/subscriptions/${subscriptionId}/refresh`, {});
}

export function apiDeleteCalendarSubscription(subscriptionId) {
  return del(`/calendar/subscriptions/${subscriptionId}`);
}

// Tasks
export async function apiGetTasks(familyId) {
  const res = await request(`/tasks?family_id=${familyId}`);
  if (res.ok && res.data?.items) {
    return { ok: true, data: res.data.items };
  }
  return res;
}

export function apiCreateTask(payload) {
  return post('/tasks', payload);
}

export function apiUpdateTask(taskId, payload) {
  return patch(`/tasks/${taskId}`, payload);
}

export function apiDeleteTask(taskId) {
  return del(`/tasks/${taskId}`);
}

// Shopping
export function apiGetShoppingLists(familyId) {
  return request(`/shopping/lists?family_id=${familyId}`);
}

export function apiCreateShoppingList(payload) {
  return post('/shopping/lists', payload);
}

export function apiDeleteShoppingList(listId) {
  return del(`/shopping/lists/${listId}`);
}

export function apiGetShoppingItems(listId) {
  return request(`/shopping/lists/${listId}/items`);
}

export function apiAddShoppingItem(listId, payload) {
  return post(`/shopping/lists/${listId}/items`, payload);
}

export function apiUpdateShoppingItem(itemId, payload) {
  return patch(`/shopping/items/${itemId}`, payload);
}

export function apiDeleteShoppingItem(itemId) {
  return del(`/shopping/items/${itemId}`);
}

export function apiClearCheckedItems(listId) {
  return del(`/shopping/lists/${listId}/checked`);
}

export function apiGetShoppingTemplates(familyId) {
  return request(`/shopping/templates?family_id=${familyId}`);
}

export function apiCreateShoppingTemplate(payload) {
  return post('/shopping/templates', payload);
}

export function apiUpdateShoppingTemplate(templateId, payload) {
  return patch(`/shopping/templates/${templateId}`, payload);
}

export function apiDeleteShoppingTemplate(templateId) {
  return del(`/shopping/templates/${templateId}`);
}

export function apiApplyShoppingTemplate(templateId, payload) {
  return post(`/shopping/templates/${templateId}/apply`, payload);
}

// Tokens
export function apiGetTokens() {
  return request('/tokens');
}

export function apiCreateToken(payload) {
  return post('/tokens', payload);
}

export function apiRevokeToken(tokenId) {
  return del(`/tokens/${tokenId}`);
}

export function apiGetBackupStatus() {
  return request('/admin/backup/status');
}

export function apiGetBackupConfig() {
  return request('/admin/backup/config');
}

export function apiUpdateBackupConfig(config) {
  return request('/admin/backup/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export function apiTriggerBackup() {
  return post('/admin/backup/trigger');
}

export function apiGetBackups() {
  return request('/admin/backup/list');
}

export async function apiDownloadBackup(filename) {
  return fetch(`${API}/admin/backup/${encodeURIComponent(filename)}/download`, { credentials: 'include' });
}

export function apiDeleteBackup(filename) {
  return del(`/admin/backup/${encodeURIComponent(filename)}`);
}

// Notifications
export function apiGetNotifications(limit = 50, offset = 0) {
  return request(`/notifications?limit=${limit}&offset=${offset}`);
}

export function apiGetUnreadCount() {
  return request('/notifications/unread-count');
}

export function apiMarkNotificationRead(id) {
  return patch(`/notifications/${id}/read`, {});
}

export function apiMarkAllNotificationsRead() {
  return post('/notifications/read-all', {});
}

export function apiDeleteNotification(id) {
  return del(`/notifications/${id}`);
}

export function apiGetNotificationPreferences() {
  return request('/notifications/preferences');
}

export function apiUpdateNotificationPreferences(prefs) {
  return request('/notifications/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
}

// Push Notifications
export function apiGetVapidKey() {
  return request('/notifications/push/vapid-key');
}

export function apiPushSubscribe(subscription) {
  const key = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  return post('/notifications/push/subscribe', {
    endpoint: subscription.endpoint,
    p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
    auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
  });
}

export function apiPushUnsubscribe(endpoint) {
  return post('/notifications/push/unsubscribe', { endpoint });
}

// Nav Order
export function apiGetNavOrder() {
  return request('/nav/order');
}

export function apiUpdateNavOrder(nav_order) {
  return request('/nav/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nav_order }),
  });
}

// Invitations
export function apiGetInvitations(familyId) {
  return request(`/families/${familyId}/invitations`);
}

export function apiCreateInvitation(familyId, payload) {
  return post(`/families/${familyId}/invitations`, payload);
}

export function apiRevokeInvitation(familyId, inviteId) {
  return del(`/families/${familyId}/invitations/${inviteId}`);
}

export function apiGetInviteInfo(token) {
  return request(`/invitations/${token}`);
}

export function apiRegisterWithInvite(payload) {
  return post('/auth/register-with-invite', payload);
}

// Setup
export function apiGetSetupStatus() {
  return request('/setup/status');
}

export async function apiRestoreBackup(file, restoreToken) {
  const form = new FormData();
  form.append('file', file);
  const headers = restoreToken ? { 'X-Setup-Restore-Token': restoreToken } : {};
  const res = await fetch(`${API}/setup/restore`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, data };
}

// Base URL settings
export function apiGetBaseUrl() {
  return request('/admin/settings/base-url');
}

export function apiSetBaseUrl(base_url) {
  return request('/admin/settings/base-url', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url }),
  });
}

// OIDC / SSO — public
export function apiGetOidcPublicConfig() {
  return request('/auth/oidc/public-config');
}

// OIDC / SSO — admin
export function apiGetOidcPresets() {
  return request('/admin/oidc/presets');
}

export function apiGetOidcConfig() {
  return request('/admin/oidc');
}

export function apiUpdateOidcConfig(payload) {
  return request('/admin/oidc', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function apiTestOidcDiscovery(issuer) {
  return post('/admin/oidc/test', { issuer });
}

export function apiGetTimeFormat() { return request('/admin/settings/time-format'); }
export function apiSetTimeFormat(time_format) {
  return request('/admin/settings/time-format', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time_format }) });
}

export function connectNotificationStream(onMessage, { lastEventId = 0 } = {}) {
  const url = lastEventId
    ? `${API}/notifications/stream?lastEventId=${lastEventId}`
    : `${API}/notifications/stream`;
  const es = new EventSource(url, { withCredentials: true });
  es.addEventListener('notification_new', (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {}
  });
  return es;
}

export function apiSearch(familyId, query) {
  return request(`/search?family_id=${familyId}&q=${encodeURIComponent(query)}`);
}

// Rewards
export function apiSetMemberAvatar(familyId, userId, profileImage) {
  return patch(`/families/${familyId}/members/${userId}/avatar`, { profile_image: profileImage });
}

export function apiSetMemberBirthdate(familyId, userId, dateOfBirth) {
  return patch(`/families/${familyId}/members/${userId}/birthdate`, { date_of_birth: dateOfBirth });
}

export function apiGetRewardCurrency(familyId) { return request(`/rewards/currency?family_id=${familyId}`); }
export function apiCreateRewardCurrency(payload) { return post('/rewards/currency', payload); }
export function apiGetEarningRules(familyId) { return request(`/rewards/rules?family_id=${familyId}`); }
export function apiCreateEarningRule(payload) { return post('/rewards/rules', payload); }
export function apiDeleteEarningRule(id) { return del(`/rewards/rules/${id}`); }
export function apiGetRewardCatalog(familyId) { return request(`/rewards/catalog?family_id=${familyId}`); }
export function apiCreateReward(payload) { return post('/rewards/catalog', payload); }
export function apiDeleteReward(id) { return del(`/rewards/catalog/${id}`); }
export function apiGetRewardTransactions(familyId, userId, limit = 50, offset = 0) {
  let url = `/rewards/transactions?family_id=${familyId}&limit=${limit}&offset=${offset}`;
  if (userId) url += `&user_id=${userId}`;
  return request(url);
}
export function apiEarnTokens(payload) { return post('/rewards/transactions/earn', payload); }
export function apiRedeemReward(payload) { return post('/rewards/transactions/redeem', payload); }
export function apiConfirmTransaction(id) { return patch(`/rewards/transactions/${id}/confirm`, {}); }
export function apiRejectTransaction(id) { return patch(`/rewards/transactions/${id}/reject`, {}); }
export function apiGetRewardBalances(familyId) { return request(`/rewards/balances?family_id=${familyId}`); }

// Gifts
export function apiGetGifts(familyId, { status = null, forUserId = null, occasion = null, includeGifted = true, sort = null } = {}) {
  const params = new URLSearchParams({ family_id: String(familyId), include_gifted: String(includeGifted) });
  if (status) params.set('status', status);
  if (forUserId) params.set('for_user_id', String(forUserId));
  if (occasion) params.set('occasion', occasion);
  if (sort) params.set('sort', sort);
  return request(`/gifts?${params.toString()}`);
}

export function apiCreateGift(payload) {
  return post('/gifts', payload);
}

export function apiUpdateGift(giftId, payload) {
  return patch(`/gifts/${giftId}`, payload);
}

export function apiDeleteGift(giftId) {
  return del(`/gifts/${giftId}`);
}

// Meal Plans
export function apiListMealPlans(familyId, start, end) {
  const params = new URLSearchParams({ family_id: String(familyId), start, end });
  return request(`/meal-plans?${params.toString()}`);
}

export function apiListMealPlanIngredients(familyId) {
  const params = new URLSearchParams({ family_id: String(familyId) });
  return request(`/meal-plans/ingredients?${params.toString()}`);
}

export function apiCreateMealPlan(payload) {
  return post('/meal-plans', payload);
}

export function apiUpdateMealPlan(planId, payload) {
  return patch(`/meal-plans/${planId}`, payload);
}

export function apiDeleteMealPlan(planId) {
  return del(`/meal-plans/${planId}`);
}

export function apiAddMealIngredientsToShopping(planId, shoppingListId, ingredientNames = null) {
  const body = { shopping_list_id: shoppingListId };
  if (ingredientNames) body.ingredient_names = ingredientNames;
  return post(`/meal-plans/${planId}/add-to-shopping`, body);
}

export function apiAddWeekMealIngredientsToShopping(familyId, weekStart, shoppingListId) {
  return post('/meal-plans/week/add-to-shopping', {
    family_id: Number(familyId),
    week_start: weekStart,
    shopping_list_id: shoppingListId,
  });
}


// Recipes
export function apiListRecipes(familyId) {
  const params = new URLSearchParams({ family_id: String(familyId) });
  return request(`/recipes?${params.toString()}`);
}

export function apiGetRecipe(recipeId) {
  return request(`/recipes/${recipeId}`);
}

export function apiCreateRecipe(payload) {
  return post('/recipes', payload);
}

export function apiUpdateRecipe(recipeId, payload) {
  return patch(`/recipes/${recipeId}`, payload);
}

export function apiDeleteRecipe(recipeId) {
  return del(`/recipes/${recipeId}`);
}

export function apiAddRecipeIngredientsToShopping(recipeId, shoppingListId, ingredientNames = null) {
  const body = { shopping_list_id: shoppingListId };
  if (ingredientNames) body.ingredient_names = ingredientNames;
  return post(`/recipes/${recipeId}/add-to-shopping`, body);
}

// ──────────────────────────────────────────────────────────────
// Display Devices (issue #172)
//
// Two surfaces:
//   - Admin CRUD authenticated by the normal user session cookie.
//   - Display runtime authenticated by a dedicated `tribu_display_`
//     bearer token. The display surface MUST NOT include cookies
//     (otherwise it would silently fall back to the admin's session
//     when a token is missing or revoked), so it goes through a
//     separate request helper that explicitly omits credentials.
// ──────────────────────────────────────────────────────────────

export function apiListDisplayDevices(familyId) {
  return request(`/families/${familyId}/display-devices`);
}

export function apiCreateDisplayDevice(familyId, payload) {
  const body = typeof payload === 'string' ? { name: payload } : payload;
  return post(`/families/${familyId}/display-devices`, body);
}

export function apiUpdateDisplayDevice(familyId, deviceId, payload) {
  return patch(`/families/${familyId}/display-devices/${deviceId}`, payload);
}

export function apiRevokeDisplayDevice(familyId, deviceId) {
  return del(`/families/${familyId}/display-devices/${deviceId}`);
}

async function displayRequest(path, token) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'omit',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

export function apiDisplayMe(token) {
  return displayRequest('/display/me', token);
}

export function apiDisplayDashboard(token) {
  return displayRequest('/display/dashboard', token);
}
