import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SuggestSheet from '../../components/responsive/SuggestSheet';
import { buildMessages } from '../../lib/i18n';

let mockApp;
const mockToastSuccess = jest.fn();
jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ success: mockToastSuccess, error: jest.fn() }) }));
jest.mock('../../lib/api');
const api = require('../../lib/api');

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  mockApp = { messages: buildMessages('en'), familyId: 4, demoMode: false };
  mockToastSuccess.mockReset();
  api.apiCreateQuickCapture.mockReset();
});

test('each line becomes a suggestion in the inbox', async () => {
  api.apiCreateQuickCapture.mockResolvedValue({ ok: true, data: {} });
  const onClose = jest.fn();
  render(<SuggestSheet onClose={onClose} />);
  expect(screen.getByText('A grown-up sees your idea and adds it.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Suggest something' }), { target: { value: 'Pizza on Friday\n\nNew football boots' } });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(api.apiCreateQuickCapture.mock.calls.map(([payload]) => payload)).toEqual([
    { family_id: 4, text: 'Pizza on Friday', destination: 'inbox' },
    { family_id: 4, text: 'New football boots', destination: 'inbox' },
  ]);
  expect(mockToastSuccess).toHaveBeenCalledWith('Sent to the grown-ups.');
});

test('what did not arrive stays in the field', async () => {
  api.apiCreateQuickCapture
    .mockResolvedValueOnce({ ok: true, data: {} })
    .mockResolvedValueOnce({ ok: false, error: 'offline' });
  const onClose = jest.fn();
  render(<SuggestSheet onClose={onClose} />);
  const field = screen.getByRole('textbox', { name: 'Suggest something' });
  fireEvent.change(field, { target: { value: 'Pizza\nCinema' } });
  fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(field).toHaveValue('Cinema');
  expect(onClose).not.toHaveBeenCalled();
});
