import { act, renderHook } from '@testing-library/react';
import { useCurrentMinute } from '../../hooks/useCurrentMinute';

describe('useCurrentMinute', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T10:00:47.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates on the next minute boundary and keeps minute cadence', () => {
    const { result, unmount } = renderHook(() => useCurrentMinute());

    expect(result.current.toISOString()).toBe('2026-07-13T10:00:47.000Z');

    act(() => {
      jest.advanceTimersByTime(12999);
    });
    expect(result.current.toISOString()).toBe('2026-07-13T10:00:47.000Z');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.toISOString()).toBe('2026-07-13T10:01:00.000Z');

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(result.current.toISOString()).toBe('2026-07-13T10:02:00.000Z');

    unmount();
  });

  it('resynchronizes when the tab becomes visible again', () => {
    const { result } = renderHook(() => useCurrentMinute());

    jest.setSystemTime(new Date('2026-07-13T10:07:12.000Z'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.toISOString()).toBe('2026-07-13T10:07:12.000Z');
  });
});
