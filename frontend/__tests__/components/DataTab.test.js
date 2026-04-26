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
  apiSubscribeCalendarIcs: jest.fn(),
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
