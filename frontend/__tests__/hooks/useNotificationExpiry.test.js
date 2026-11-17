import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useNotificationExpiry } from '../../hooks/useNotificationExpiry';

function iso(ms) {
  // The API sends naive UTC.
  return new Date(ms).toISOString().replace('Z', '');
}

function useList(initial) {
  const [notifications, setNotifications] = useState(initial);
  const [unreadCount, setUnreadCount] = useState(initial.filter((n) => !n.read).length);
  useNotificationExpiry(notifications, setNotifications, setUnreadCount);
  return { notifications, unreadCount };
}

describe('useNotificationExpiry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('drops a reminder and its unread badge the moment it expires, with nothing else happening', () => {
    const now = Date.now();
    const { result } = renderHook(() => useList([
      { id: 3, read: false, expires_at: iso(now + 60000) },
      { id: 2, read: true, expires_at: iso(now + 120000) },
      { id: 1, read: false, expires_at: null },
    ]));
    expect(result.current.unreadCount).toBe(2);

    act(() => { jest.advanceTimersByTime(59000); });
    expect(result.current.notifications.map((n) => n.id)).toEqual([3, 2, 1]);

    act(() => { jest.advanceTimersByTime(1100); });
    expect(result.current.notifications.map((n) => n.id)).toEqual([2, 1]);
    expect(result.current.unreadCount).toBe(1);

    act(() => { jest.advanceTimersByTime(60000); });
    expect(result.current.notifications.map((n) => n.id)).toEqual([1]);
    expect(result.current.unreadCount).toBe(1);
  });

  it('keeps watching an expiry further away than one wait', () => {
    const now = Date.now();
    const { result } = renderHook(() => useList([{ id: 1, read: false, expires_at: iso(now + 8 * 3600 * 1000) }]));

    act(() => { jest.advanceTimersByTime(6 * 3600 * 1000 + 100); });
    expect(result.current.notifications).toHaveLength(1);
    act(() => { jest.advanceTimersByTime(2 * 3600 * 1000); });
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });
});
