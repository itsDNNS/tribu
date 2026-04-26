import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataTab from '../../components/settings/DataTab';
import { buildMessages } from '../../lib/i18n';
import * as api from '../../lib/api';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ error: jest.fn() }),
}));

jest.mock('../../lib/helpers', () => ({
  copyTextToClipboard: jest.fn(async () => true),
  downloadBlob: jest.fn(),
}));

jest.mock('../../lib/api', () => ({
  apiCreateToken: jest.fn(),
  apiExportCalendarIcs: jest.fn(),
  apiImportCalendarIcs: jest.fn(),
  apiPreviewImportCalendarIcs: jest.fn(),
  apiSubscribeCalendarIcs: jest.fn(),
  apiPreviewSubscribeCalendarIcs: jest.fn(),
  apiGetCalendarSubscriptions: jest.fn(),
  apiCreateCalendarSubscription: jest.fn(),
  apiRefreshCalendarSubscription: jest.fn(),
  apiDeleteCalendarSubscription: jest.fn(),
  apiExportContactsCsv: jest.fn(),
  apiImportContactsCsv: jest.fn(),
}));

function baseState(overrides = {}) {
  return {
    messages: buildMessages('en'),
    familyId: 42,
    loadContacts: jest.fn(),
    loadDashboard: jest.fn(async () => {}),
    ...overrides,
  };
}

describe('DataTab calendar subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = baseState();
    api.apiGetCalendarSubscriptions.mockResolvedValue({ ok: true, data: [] });
  });

  test('subscribes to an external ICS URL and renders the refresh summary', async () => {
    api.apiCreateCalendarSubscription.mockResolvedValue({
      ok: true,
      data: { id: 7, name: 'School', last_created: 1, last_updated: 2, last_skipped: 0, sync_history: [] },
    });

    render(<DataTab />);

    fireEvent.change(screen.getByPlaceholderText('https://example.com/calendar.ics'), {
      target: { value: 'https://school.example.com/calendar.ics' },
    });
    fireEvent.change(screen.getByPlaceholderText('Feed name (optional)'), {
      target: { value: 'School' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save and refresh feed' }));

    await waitFor(() => {
      expect(api.apiCreateCalendarSubscription).toHaveBeenCalledWith(
        42,
        'https://school.example.com/calendar.ics',
        'School',
      );
    });
    expect(await screen.findByText('Created 1, updated 2, skipped 0.')).toBeInTheDocument();
    expect(mockAppState.loadDashboard).toHaveBeenCalled();
  });

  test('renders managed feeds and refreshes one', async () => {
    api.apiGetCalendarSubscriptions.mockResolvedValue({
      ok: true,
      data: [{
        id: 7,
        name: 'School',
        source_url: 'https://school.example.com/calendar.ics',
        last_sync_status: 'success',
        last_created: 1,
        last_updated: 0,
        last_skipped: 0,
        sync_history: [{ id: 1, status: 'success', created: 1, updated: 0, skipped: 0 }],
      }],
    });
    api.apiRefreshCalendarSubscription.mockResolvedValue({
      ok: true,
      data: { id: 7, name: 'School', last_created: 0, last_updated: 1, last_skipped: 0, sync_history: [] },
    });

    render(<DataTab />);

    expect(await screen.findByText('School')).toBeInTheDocument();
    expect(screen.getByText('https://school.example.com/calendar.ics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

    await waitFor(() => {
      expect(api.apiRefreshCalendarSubscription).toHaveBeenCalledWith(7);
    });
    expect(await screen.findByText('Created 0, updated 1, skipped 0.')).toBeInTheDocument();
  });
});


describe('DataTab calendar import previews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = baseState();
    api.apiGetCalendarSubscriptions.mockResolvedValue({ ok: true, data: [] });
  });

  test('previews pasted ICS without importing it', async () => {
    api.apiPreviewImportCalendarIcs.mockResolvedValue({
      ok: true,
      data: { would_create: 1, would_update: 2, would_skip: 0, errors: [] },
    });

    render(<DataTab />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Import' })[0]);
    fireEvent.change(screen.getAllByRole('textbox')[2], {
      target: { value: 'BEGIN:VCALENDAR\nEND:VCALENDAR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));

    await waitFor(() => {
      expect(api.apiPreviewImportCalendarIcs).toHaveBeenCalledWith(
        42,
        'BEGIN:VCALENDAR\nEND:VCALENDAR',
      );
    });
    expect(api.apiImportCalendarIcs).not.toHaveBeenCalled();
    expect(await screen.findByText('Preview: would create 1, update 2, skip 0. No calendar changes yet.')).toBeInTheDocument();
  });

  test('previews subscription URL before refreshing the feed', async () => {
    api.apiPreviewSubscribeCalendarIcs.mockResolvedValue({
      ok: true,
      data: { would_create: 3, would_update: 0, would_skip: 1, errors: [{ index: 1, summary: 'Dup', error: 'Skipped' }] },
    });

    render(<DataTab />);
    fireEvent.change(screen.getByPlaceholderText('https://example.com/calendar.ics'), {
      target: { value: 'https://school.example.com/calendar.ics' },
    });
    fireEvent.change(screen.getByPlaceholderText('Feed name (optional)'), {
      target: { value: 'School' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview feed' }));

    await waitFor(() => {
      expect(api.apiPreviewSubscribeCalendarIcs).toHaveBeenCalledWith(
        42,
        'https://school.example.com/calendar.ics',
        'School',
      );
    });
    expect(api.apiCreateCalendarSubscription).not.toHaveBeenCalled();
    expect(await screen.findByText('Preview: would create 3, update 0, skip 1. No calendar changes yet.')).toBeInTheDocument();
    expect(await screen.findByText(/Dup/)).toBeInTheDocument();
  });
});
