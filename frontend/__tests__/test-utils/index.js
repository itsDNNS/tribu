import { render } from '@testing-library/react';
import { buildMessages } from '../../lib/i18n';

let mockAppState = {};

export const DASHBOARD_MODULES = ['quick_capture', 'daily_loop', 'events', 'tasks', 'birthdays', 'rewards'];

export function buildTestMessages(overrides = {}, lang = 'en') {
  return {
    ...buildMessages(lang),
    ...overrides,
  };
}

export function buildMockAppState(overrides = {}) {
  return {
    messages: buildTestMessages(),
    lang: 'en',
    summary: { next_events: [], upcoming_birthdays: [] },
    me: { display_name: 'Dennis' },
    members: [],
    tasks: [],
    events: [],
    shoppingLists: [],
    activity: [],
    quickCaptureInbox: [],
    notifications: [],
    unreadCount: 0,
    familyId: 42,
    families: [],
    isAdmin: false,
    isChild: false,
    demoMode: false,
    loggedIn: true,
    timeFormat: '24h',
    setActiveView: jest.fn(),
    setNotifications: jest.fn(),
    setUnreadCount: jest.fn(),
    loadNotifications: jest.fn(),
    ...overrides,
  };
}

export function setMockAppState(nextState) {
  mockAppState = nextState;
  return mockAppState;
}

export function resetMockAppState(overrides = {}) {
  return setMockAppState(buildMockAppState(overrides));
}

export function getMockAppState() {
  return mockAppState;
}

export function renderWithMockApp(ui, appOverrides = {}, renderOptions) {
  const appState = resetMockAppState(appOverrides);
  return {
    appState,
    ...render(ui, renderOptions),
  };
}

export function createMockApi(overrides = {}) {
  return {
    apiGetDashboardLayout: jest.fn(() => new Promise(() => {})),
    apiGetSetupChecklist: jest.fn().mockResolvedValue({ ok: true, data: null }),
    apiListMealPlans: jest.fn().mockResolvedValue({ ok: true, data: [] }),
    apiResetDashboardLayout: jest.fn().mockResolvedValue({ ok: true, data: { modules: DASHBOARD_MODULES } }),
    apiUpdateDashboardLayout: jest.fn().mockResolvedValue({ ok: true, data: { modules: DASHBOARD_MODULES } }),
    apiMarkNotificationRead: jest.fn().mockResolvedValue({ ok: true }),
    apiMarkAllNotificationsRead: jest.fn().mockResolvedValue({ ok: true }),
    apiDeleteNotification: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

export function createMockToast(overrides = {}) {
  return {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    ...overrides,
  };
}
