import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PWABanners } from '../../components/PWABanners';

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

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

function mockServiceWorker({ waitingWorker = null } = {}) {
  const serviceWorker = new EventTarget();
  serviceWorker.controller = waitingWorker ? {} : null;
  serviceWorker.register = jest.fn().mockResolvedValue({
    waiting: waitingWorker,
    installing: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  });
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });
  return serviceWorker;
}

function mockNoServiceWorker() {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  setOnline(true);
  mockNoServiceWorker();
});

describe('PWABanners', () => {
  it('announces offline and back-online state without install/update actions', async () => {
    render(<PWABanners />);

    fireEvent(window, new Event('offline'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('You are offline'));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    fireEvent(window, new Event('online'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Back online'));
  });

  it('lets users apply a waiting service-worker update', async () => {
    const waitingWorker = { postMessage: jest.fn() };
    mockServiceWorker({ waitingWorker });

    render(<PWABanners />);

    const updateButton = await screen.findByRole('button', { name: 'Update now' });
    fireEvent.click(updateButton);

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('shows the captured install prompt only when the app is not installed', async () => {
    const prompt = jest.fn();
    const beforeInstallPrompt = new Event('beforeinstallprompt', { cancelable: true });
    beforeInstallPrompt.prompt = prompt;
    beforeInstallPrompt.userChoice = Promise.resolve({ outcome: 'accepted' });

    render(<PWABanners />);
    fireEvent(window, beforeInstallPrompt);

    const installButton = await screen.findByRole('button', { name: 'Install' });
    fireEvent.click(installButton);

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });

  it('dismisses captured install prompts through the banner control', async () => {
    const beforeInstallPrompt = new Event('beforeinstallprompt', { cancelable: true });
    beforeInstallPrompt.prompt = jest.fn();
    beforeInstallPrompt.userChoice = Promise.resolve({ outcome: 'dismissed' });

    render(<PWABanners />);
    fireEvent(window, beforeInstallPrompt);

    const dismissButton = await screen.findByRole('button', { name: 'Dismiss install prompt' });
    fireEvent.click(dismissButton);

    expect(window.localStorage.getItem('tribu_install_dismissed')).toBe('1');
    await waitFor(() => expect(screen.queryByText('Install Tribu on this device')).not.toBeInTheDocument());
  });
});
