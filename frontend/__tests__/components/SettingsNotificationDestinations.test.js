import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsView from '../../components/settings';
import { buildMessages } from '../../lib/i18n';

let mockAppState = {};

beforeEach(() => sessionStorage.clear());
jest.mock('../../components/FamilyTopbar', () => () => null);

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../components/settings/AccountTab', () => function AccountTab() {
  return <div>Account panel</div>;
});
jest.mock('../../components/settings/NotificationDestinationsTab', () => function NotificationDestinationsTab() {
  return <div>Notification destination panel</div>;
});
jest.mock('../../components/settings/StoreLinksTab', () => function StoreLinksTab() {
  return <div>Store links panel</div>;
});

function baseState(overrides = {}) {
  return {
    messages: buildMessages('en'),
    isMobile: false,
    isChild: false,
    isAdmin: true,
    demoMode: false,
    ...overrides,
  };
}

describe('Settings notification destinations visibility', () => {
  it('shows store searches to adults without requiring admin', () => {
    mockAppState = baseState({ isAdmin: false });
    render(<SettingsView />);
    expect(screen.getByRole('button', { name: 'Store searches' })).toBeInTheDocument();
  });

  it('hides store searches from children and demo mode', () => {
    for (const state of [baseState({ isChild: true }), baseState({ demoMode: true })]) {
      mockAppState = state;
      const { unmount } = render(<SettingsView />);
      expect(screen.queryByRole('button', { name: 'Store searches' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows household notification destinations to admins', () => {
    mockAppState = baseState();
    render(<SettingsView />);

    expect(screen.getByRole('button', { name: 'Household notifications' })).toBeInTheDocument();
  });

  it('hides household notification destinations for adult non-admins, children, and demo mode', () => {
    for (const state of [
      baseState({ isAdmin: false, isChild: false }),
      baseState({ isAdmin: false, isChild: true }),
      baseState({ isAdmin: true, demoMode: true }),
    ]) {
      mockAppState = state;
      const { unmount } = render(<SettingsView />);
      expect(screen.queryByRole('button', { name: 'Household notifications' })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('keeps token-backed Phone Sync adult-only', () => {
    mockAppState = baseState({ isChild: false });
    const { unmount } = render(<SettingsView />);
    expect(screen.getByRole('button', { name: 'Phone sync' })).toBeInTheDocument();
    unmount();

    mockAppState = baseState({ isChild: true, isAdmin: false });
    render(<SettingsView />);
    expect(screen.queryByRole('button', { name: 'Phone sync' })).not.toBeInTheDocument();
  });

  it('resets the active tab when the current tab becomes hidden', () => {
    mockAppState = baseState();
    const { rerender } = render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Household notifications' }));
    expect(screen.getByText('Notification destination panel')).toBeInTheDocument();

    mockAppState = baseState({ isAdmin: false });
    rerender(<SettingsView />);

    expect(screen.queryByText('Notification destination panel')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Just the way you like it.' })).toBeInTheDocument();
  });
});


describe('Mockup settings overview', () => {
  it('offers the same overview on mobile and supports returning from a detail', () => {
    mockAppState = baseState({ isMobile: true });
    render(<SettingsView />);
    expect(screen.getAllByRole('region')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByText('Account panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All settings' }));
    expect(screen.getByRole('heading', { name: 'Just the way you like it.' })).toHaveFocus();
    expect(sessionStorage.getItem('tribu_settings_tab')).toBeNull();
  });

  it('honours a permitted deep link on mobile and rejects a hidden one', () => {
    sessionStorage.setItem('tribu_settings_tab', 'notification_destinations');
    mockAppState = baseState({ isMobile: true });
    const { unmount } = render(<SettingsView />);
    expect(screen.getByText('Notification destination panel')).toBeInTheDocument();
    unmount();
    mockAppState = baseState({ isAdmin: false });
    render(<SettingsView />);
    expect(screen.queryByText('Notification destination panel')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Just the way you like it.' })).toBeInTheDocument();
  });

  it('wires appearance and calendar controls to real preferences', () => {
    const setters = Object.fromEntries(['setTheme', 'setLang', 'setWeekStart', 'setCompactDashboard', 'setShowNotificationBadge'].map(key => [key, jest.fn()]));
    mockAppState = baseState({ ...setters, theme: 'light', lang: 'en', weekStart: 'monday', availableLanguages: [{key:'en',nativeName:'English'},{key:'de',nativeName:'Deutsch'}] });
    render(<SettingsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Colour scheme' }));
    expect(setters.setTheme).toHaveBeenCalledWith('dark');
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {target:{value:'de'}});
    expect(setters.setLang).toHaveBeenCalledWith('de');
    fireEvent.change(screen.getByRole('combobox', { name: 'Week starts on' }), {target:{value:'sunday'}});
    expect(setters.setWeekStart).toHaveBeenCalledWith('sunday');
    fireEvent.click(screen.getByRole('switch', { name: 'Compact view' }));
    expect(setters.setCompactDashboard).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Notification badge' }));
    expect(setters.setShowNotificationBadge).toHaveBeenCalledWith(false);
  });
});
