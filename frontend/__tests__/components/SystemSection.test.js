import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SystemSection from '../../components/admin/SystemSection';
import { renderNotificationBody, renderNotificationTitle } from '../../components/NotificationCenter';
import * as api from '../../lib/api';

const messages = {
  system_title: 'System',
  system_intro: 'How the Tribu server is doing.',
  system_unavailable: 'The system status could not be loaded.',
  system_crashes: 'Unexpected restarts',
  system_crashes_none: 'None in the last 7 days',
  system_crashes_value: '{day} in the last 24 hours · {week} in the last 7 days',
  system_crashes_hint: 'Check the backend log.',
  system_crash_entry: 'Stopped {time} · version {version}',
  system_memory: 'Memory',
  system_memory_value: '{used} of {limit}',
  system_memory_no_limit: '{used}, no limit set',
  system_memory_unknown: 'Not available',
  system_version: 'Version',
  system_running_since: 'Running since {time}',
  notification_title_backend_crashes: 'Tribu wurde unerwartet neu gestartet',
  notification_body_backend_crashes: 'Der Server wurde in der letzten Stunde {count}-mal unerwartet beendet.',
};

jest.mock('../../contexts/AppContext', () => ({ useApp: () => ({ messages }) }));
jest.mock('../../lib/api', () => ({ apiGetSystemStatus: jest.fn() }));

const MB = 1024 * 1024;

async function renderWith(response) {
  api.apiGetSystemStatus.mockResolvedValue(response);
  await act(async () => { render(<SystemSection />); });
}

describe('SystemSection', () => {
  test('shows recent unexpected restarts with memory against the limit', async () => {
    await renderWith({
      ok: true,
      data: {
        version: 'v2026-09-27', started_at: '2026-09-27T08:00:00', crashes_last_day: 2, crashes_last_week: 3,
        recent_crashes: [{ started_at: '2026-09-27T07:50:00', stopped_at: '2026-09-27T07:55:00', version: 'v2026-09-26' }],
        rss_bytes: 900 * MB, limit_bytes: 1024 * MB,
      },
    });

    expect(screen.getByTestId('system-crashes')).toHaveTextContent('2 in the last 24 hours · 3 in the last 7 days');
    expect(screen.getByTestId('system-crashes')).toHaveClass('system-card-alert');
    expect(screen.getByTestId('system-memory')).toHaveTextContent('900 MB of 1024 MB');
    expect(screen.getByTestId('system-crash-list')).toHaveTextContent('version v2026-09-26');
    expect(screen.getByText('v2026-09-27')).toBeInTheDocument();
  });

  test('stays calm without restarts and without a memory limit', async () => {
    await renderWith({
      ok: true,
      data: { version: 'dev', started_at: null, crashes_last_day: 0, crashes_last_week: 0, recent_crashes: [], rss_bytes: 170 * MB, limit_bytes: null },
    });

    expect(screen.getByTestId('system-crashes')).toHaveTextContent('None in the last 7 days');
    expect(screen.getByTestId('system-memory')).toHaveTextContent('170 MB, no limit set');
    expect(screen.queryByTestId('system-crash-list')).not.toBeInTheDocument();
  });

  test('explains when the status is not available', async () => {
    await renderWith({ ok: false, status: 403, data: null });
    expect(screen.getByRole('alert')).toHaveTextContent('The system status could not be loaded.');
  });
});

describe('restart notification', () => {
  test('is shown in the UI language', () => {
    const notif = { type: 'system', title: 'Tribu restarted unexpectedly', body: 'The server stopped unexpectedly 4 times in the last hour.' };
    expect(renderNotificationTitle(notif, messages)).toBe('Tribu wurde unerwartet neu gestartet');
    expect(renderNotificationBody(notif, messages)).toBe('Der Server wurde in der letzten Stunde 4-mal unerwartet beendet.');
  });

  test('leaves other notifications alone', () => {
    const notif = { type: 'event_reminder', title: 'Swimming', body: 'At the pool' };
    expect(renderNotificationTitle(notif, messages)).toBe('Swimming');
    expect(renderNotificationBody(notif, messages)).toBe('At the pool');
  });
});
