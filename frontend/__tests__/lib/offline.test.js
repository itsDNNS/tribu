import {
  hasPendingActions, isNetworkFailure, OFFLINE_RETRY_MS, sendWhenOnline,
} from '../../lib/offline';

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

  it('reports an action as pending from its first request until it got through', async () => {
    let answer;
    const send = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true });

    expect(hasPendingActions()).toBe(false);
    const first = sendWhenOnline(send);
    expect(hasPendingActions()).toBe(true);
    answer({ ok: true });
    await first;
    expect(hasPendingActions()).toBe(false);

    const second = sendWhenOnline(send);
    await Promise.resolve();
    await Promise.resolve();
    expect(hasPendingActions()).toBe(true);
    window.dispatchEvent(new Event('online'));
    await second;
    expect(hasPendingActions()).toBe(false);
  });

  it('stops counting an action that failed for good', async () => {
    await expect(sendWhenOnline(jest.fn().mockRejectedValue(new Error('boom')))).rejects.toThrow('boom');
    expect(hasPendingActions()).toBe(false);
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
