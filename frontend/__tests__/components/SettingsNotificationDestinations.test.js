import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsView from '../../components/settings';
import { buildMessages } from '../../lib/i18n';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../components/settings/AccountTab', () => function AccountTab() {
  return <div>Account panel</div>;
});
jest.mock('../../components/settings/NotificationDestinationsTab', () => function NotificationDestinationsTab() {
  return <div>Notification destination panel</div>;
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

  it('resets the active tab when the current tab becomes hidden', () => {
    mockAppState = baseState();
    const { rerender } = render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Household notifications' }));
    expect(screen.getByText('Notification destination panel')).toBeInTheDocument();

    mockAppState = baseState({ isAdmin: false });
    rerender(<SettingsView />);

    expect(screen.queryByText('Notification destination panel')).not.toBeInTheDocument();
    expect(screen.getByText('Account panel')).toBeInTheDocument();
  });
});
