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
  });

  test('subscribes to an external ICS URL and renders the refresh summary', async () => {
    api.apiSubscribeCalendarIcs.mockResolvedValue({
      ok: true,
      data: { created: 1, updated: 2, skipped: 0, errors: [] },
    });

    render(<DataTab />);

    fireEvent.change(screen.getByPlaceholderText('https://example.com/calendar.ics'), {
      target: { value: 'https://school.example.com/calendar.ics' },
    });
    fireEvent.change(screen.getByPlaceholderText('Feed name (optional)'), {
      target: { value: 'School' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe / refresh feed' }));

    await waitFor(() => {
      expect(api.apiSubscribeCalendarIcs).toHaveBeenCalledWith(
        42,
        'https://school.example.com/calendar.ics',
        'School',
      );
    });
    expect(await screen.findByText('Created 1, updated 2, skipped 0.')).toBeInTheDocument();
    expect(mockAppState.loadDashboard).toHaveBeenCalled();
  });
});


describe('DataTab calendar import previews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = baseState();
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
    expect(api.apiSubscribeCalendarIcs).not.toHaveBeenCalled();
    expect(await screen.findByText('Preview: would create 3, update 0, skip 1. No calendar changes yet.')).toBeInTheDocument();
    expect(await screen.findByText(/Dup/)).toBeInTheDocument();
  });
});
