import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  OFFLINE_BANNER_DELAY_MS, PWABanners, UPDATE_IDLE_MS, UPDATE_RETRY_MS, UPDATE_SETTLE_MS,
} from '../../components/PWABanners';

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

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
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
  setVisibility('visible');
  mockNoServiceWorker();
  document.body.innerHTML = '';
});

describe('PWABanners', () => {
  it('announces offline and back-online state without install/update actions', async () => {
    jest.useFakeTimers();
    try {
      render(<PWABanners />);

      fireEvent(window, new Event('offline'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      act(() => { jest.advanceTimersByTime(OFFLINE_BANNER_DELAY_MS); });
      expect(screen.getByRole('alert')).toHaveTextContent('You are offline');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();

      fireEvent(window, new Event('online'));
      expect(screen.getByRole('status')).toHaveTextContent('Back online');
    } finally {
      jest.useRealTimers();
    }
  });

  it('stays quiet during a short dropout', () => {
    jest.useFakeTimers();
    try {
      render(<PWABanners />);

      fireEvent(window, new Event('offline'));
      act(() => { jest.advanceTimersByTime(OFFLINE_BANNER_DELAY_MS - 1000); });
      fireEvent(window, new Event('online'));
      act(() => { jest.advanceTimersByTime(OFFLINE_BANNER_DELAY_MS); });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  describe('service-worker updates', () => {
    // jsdom cannot mock location.reload; it reports the navigation attempt instead.
    let consoleError;
    const reloadAttempts = () => consoleError.mock.calls.filter((call) => String(call[0]?.message ?? call[0]).includes('navigation')).length;

    beforeEach(() => {
      jest.useFakeTimers();
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleError.mockRestore();
      jest.useRealTimers();
    });

    // Lets register() resolve and the page settle before the first automatic attempt.
    async function settle() {
      await act(async () => {});
      act(() => { jest.advanceTimersByTime(UPDATE_SETTLE_MS); });
    }
    const hide = () => {
      setVisibility('hidden');
      fireEvent(document, new Event('visibilitychange'));
    };

    it('applies a waiting update on its own once the page has settled, if nobody touched it yet', async () => {
      const waitingWorker = { postMessage: jest.fn() };
      mockServiceWorker({ waitingWorker });

      render(<PWABanners />);
      await act(async () => {});
      expect(waitingWorker.postMessage).not.toHaveBeenCalled();

      act(() => { jest.advanceTimersByTime(UPDATE_SETTLE_MS); });
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
      expect(screen.queryByRole('button', { name: 'Update now' })).not.toBeInTheDocument();
    });

    it('waits while someone is using the page and updates once the app goes to the background', async () => {
      const waitingWorker = { postMessage: jest.fn() };
      mockServiceWorker({ waitingWorker });

      render(<PWABanners />);
      fireEvent.pointerDown(document.body);
      await settle();

      expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
      expect(waitingWorker.postMessage).not.toHaveBeenCalled();

      hide();
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('never updates on its own while a dialog is open, a field has focus or the device is offline', async () => {
      const waitingWorker = { postMessage: jest.fn() };
      mockServiceWorker({ waitingWorker });
      const dialog = document.createElement('dialog');
      dialog.setAttribute('open', '');
      document.body.appendChild(dialog);

      render(<PWABanners />);
      await settle();
      expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();

      hide();
      expect(waitingWorker.postMessage).not.toHaveBeenCalled();

      dialog.remove();
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();
      hide();
      expect(waitingWorker.postMessage).not.toHaveBeenCalled();

      field.blur();
      setOnline(false);
      hide();
      expect(waitingWorker.postMessage).not.toHaveBeenCalled();

      setOnline(true);
      hide();
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('updates an open page after it has been left alone for a while', async () => {
      const waitingWorker = { postMessage: jest.fn() };
      mockServiceWorker({ waitingWorker });

      render(<PWABanners />);
      fireEvent.keyDown(document.body, { key: 'a' });
      await settle();
      expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();

      act(() => { jest.advanceTimersByTime(UPDATE_IDLE_MS - UPDATE_SETTLE_MS - UPDATE_RETRY_MS); });
      expect(waitingWorker.postMessage).not.toHaveBeenCalled();

      act(() => { jest.advanceTimersByTime(2 * UPDATE_RETRY_MS); });
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('lets users apply a waiting service-worker update', async () => {
      const waitingWorker = { postMessage: jest.fn() };
      mockServiceWorker({ waitingWorker });

      render(<PWABanners />);
      fireEvent.pointerDown(document.body);
      await settle();
      fireEvent.click(screen.getByRole('button', { name: 'Update now' }));

      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    });

    it('reloads on a controller change only when a previous worker controlled the page', async () => {
      const firstInstall = mockServiceWorker();
      const { unmount } = render(<PWABanners />);
      await act(async () => {});
      expect(firstInstall.register).toHaveBeenCalled();
      act(() => { firstInstall.dispatchEvent(new Event('controllerchange')); });
      expect(reloadAttempts()).toBe(0);
      unmount();

      const update = mockServiceWorker({ waitingWorker: { postMessage: jest.fn() } });
      render(<PWABanners />);
      await act(async () => {});
      expect(update.register).toHaveBeenCalled();
      act(() => { update.dispatchEvent(new Event('controllerchange')); });
      expect(reloadAttempts()).toBe(1);
    });

    it('keeps a busy tab open when another tab switches to the new version, and reloads it once safe', async () => {
      const sw = mockServiceWorker({ waitingWorker: { postMessage: jest.fn() } });
      const dialog = document.createElement('dialog');
      dialog.setAttribute('open', '');
      document.body.appendChild(dialog);

      render(<PWABanners />);
      await settle();
      expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();

      act(() => { sw.dispatchEvent(new Event('controllerchange')); });
      expect(reloadAttempts()).toBe(0);
      expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();

      dialog.remove();
      hide();
      expect(reloadAttempts()).toBe(1);
    });

    it('reloads right away when the person asks for the update while busy', async () => {
      const waitingWorker = { postMessage: jest.fn() };
      const sw = mockServiceWorker({ waitingWorker });

      render(<PWABanners />);
      fireEvent.pointerDown(document.body);
      await settle();
      fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
      expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });

      act(() => { sw.dispatchEvent(new Event('controllerchange')); });
      expect(reloadAttempts()).toBe(1);
    });
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
