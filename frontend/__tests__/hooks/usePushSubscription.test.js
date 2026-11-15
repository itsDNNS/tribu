import { dropDevicePushSubscription } from '../../hooks/usePushSubscription';
import * as api from '../../lib/api';

jest.mock('../../lib/api', () => ({
  apiPushUnsubscribe: jest.fn(),
}));

function mockRegistration(subscription) {
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: jest.fn().mockResolvedValue({ pushManager: { getSubscription: jest.fn().mockResolvedValue(subscription) } }) },
  });
}

afterEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: undefined });
});

describe('dropDevicePushSubscription', () => {
  it('removes the server registration and unsubscribes the browser', async () => {
    const subscription = { endpoint: 'https://push.example/abc', unsubscribe: jest.fn().mockResolvedValue(true) };
    api.apiPushUnsubscribe.mockResolvedValue({ ok: true });
    mockRegistration(subscription);

    await dropDevicePushSubscription();

    expect(api.apiPushUnsubscribe).toHaveBeenCalledWith('https://push.example/abc');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('still unsubscribes the browser when the server call fails', async () => {
    const subscription = { endpoint: 'https://push.example/abc', unsubscribe: jest.fn().mockResolvedValue(true) };
    api.apiPushUnsubscribe.mockRejectedValue(new Error('offline'));
    mockRegistration(subscription);

    await dropDevicePushSubscription();

    expect(subscription.unsubscribe).toHaveBeenCalled();
  });

  it('does nothing without a service worker or subscription', async () => {
    await expect(dropDevicePushSubscription()).resolves.toBeUndefined();
    mockRegistration(null);
    await dropDevicePushSubscription();
    expect(api.apiPushUnsubscribe).not.toHaveBeenCalled();
  });
});
