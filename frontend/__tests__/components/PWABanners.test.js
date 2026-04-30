import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PWABanners } from '../../components/PWABanners';

let pwaState = {};

jest.mock('../../hooks/usePWA', () => ({
  usePWA: () => pwaState,
}));

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    messages: {
      'pwa.offline': 'You are offline',
      'pwa.back_online': 'Back online',
      'pwa.update_available': 'New version available',
      'pwa.update_action': 'Update now',
      'pwa.install_prompt': 'Install Tribu on this device',
      'pwa.install_action': 'Install',
      'pwa.install_dismiss': 'Dismiss install prompt',
    },
  }),
}));

function renderWithPwa(overrides) {
  pwaState = {
    isOffline: false,
    showBackOnline: false,
    updateAvailable: false,
    installPrompt: null,
    isInstalled: false,
    triggerInstall: jest.fn(),
    dismissInstall: jest.fn(),
    applyUpdate: jest.fn(),
    ...overrides,
  };
  render(<PWABanners />);
  return pwaState;
}

describe('PWABanners', () => {
  it('announces offline and back-online state without install/update actions', () => {
    renderWithPwa({ isOffline: true });
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    renderWithPwa({ showBackOnline: true });
    expect(screen.getByRole('status')).toHaveTextContent('Back online');
  });

  it('lets users apply a waiting service-worker update', async () => {
    const state = renderWithPwa({ updateAvailable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect(state.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows the captured install prompt only when the app is not installed', async () => {
    const state = renderWithPwa({ installPrompt: { prompt: jest.fn() } });
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(state.triggerInstall).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss install prompt' }));
    expect(state.dismissInstall).toHaveBeenCalledTimes(1);
  });
});
