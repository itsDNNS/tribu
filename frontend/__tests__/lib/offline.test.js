import { isNetworkFailure, OFFLINE_RETRY_MS, sendWhenOnline } from '../../lib/offline';

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

describe('offline actions', () => {
  beforeEach(() => setOnline(true));
  afterEach(() => jest.useRealTimers());

  it('tells a missing network from other errors', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new Error('Status update failed'))).toBe(false);
    setOnline(false);
    expect(isNetworkFailure(new Error('anything'))).toBe(true);
  });

  it('waits for the network and sends again', async () => {
    const send = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true });
    const onWaiting = jest.fn();

    const sent = sendWhenOnline(send, onWaiting);
    await Promise.resolve();
    await Promise.resolve();
    expect(onWaiting).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));

    await expect(sent).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('tries again after a while when the browser never reports the network', async () => {
    jest.useFakeTimers();
    const send = jest.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true });

    const sent = sendWhenOnline(send);
    await jest.advanceTimersByTimeAsync(OFFLINE_RETRY_MS);

    await expect(sent).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not wait on server errors', async () => {
    const send = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(sendWhenOnline(send)).rejects.toThrow('boom');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
