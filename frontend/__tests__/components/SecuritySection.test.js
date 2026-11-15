import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SecuritySection from '../../components/settings/SecuritySection';

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({ messages: {} }),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

jest.mock('../../lib/api', () => ({
  apiChangePassword: jest.fn(),
}));

jest.mock('../../lib/i18n', () => ({
  t: (_messages, key) => key,
}));

jest.mock('../../lib/helpers', () => ({
  ...jest.requireActual('../../lib/helpers'),
  errorText: (_detail, fallback) => fallback,
}));

function fillForm({ oldPw = 'old1', newPw = 'Newpass1', confirm = 'Newpass1' } = {}) {
  fireEvent.change(screen.getByLabelText('old_password'), { target: { value: oldPw } });
  fireEvent.change(screen.getByLabelText('new_password'), { target: { value: newPw } });
  fireEvent.change(screen.getByLabelText('confirm_password'), { target: { value: confirm } });
}

describe('SecuritySection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('disables the submit button until all three fields are filled', () => {
    render(<SecuritySection />);
    const button = screen.getByRole('button', { name: 'change_password' });
    expect(button).toBeDisabled();

    fillForm();
    expect(button).not.toBeDisabled();
  });

  it('blocks submit and shows password_mismatch when new and confirm differ', async () => {
    const api = require('../../lib/api');
    render(<SecuritySection />);
    fillForm({ oldPw: 'old1', newPw: 'Newpass1', confirm: 'Different1' });

    fireEvent.click(screen.getByRole('button', { name: 'change_password' }));

    expect(await screen.findByText('password_mismatch')).toBeInTheDocument();
    expect(api.apiChangePassword).not.toHaveBeenCalled();
  });

  it('calls apiChangePassword with old and new password on valid submit', async () => {
    const api = require('../../lib/api');
    api.apiChangePassword.mockResolvedValueOnce({ ok: true, data: {} });

    render(<SecuritySection />);
    fillForm({ oldPw: 'currentpw', newPw: 'Fresh1234', confirm: 'Fresh1234' });

    fireEvent.click(screen.getByRole('button', { name: 'change_password' }));

    await waitFor(() => {
      expect(api.apiChangePassword).toHaveBeenCalledWith('currentpw', 'Fresh1234');
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('password_changed');
  });

  it('shows a field error and toasts on backend failure (wrong old password)', async () => {
    const api = require('../../lib/api');
    api.apiChangePassword.mockResolvedValueOnce({
      ok: false,
      data: { detail: { code: 'OLD_PASSWORD_INCORRECT' } },
    });

    render(<SecuritySection />);
    fillForm({ oldPw: 'wrongpw', newPw: 'Fresh1234', confirm: 'Fresh1234' });

    fireEvent.click(screen.getByRole('button', { name: 'change_password' }));

    expect(await screen.findByText('toast.password_change_failed')).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith('toast.password_change_failed');
    const oldField = screen.getByLabelText('old_password');
    expect(oldField).toHaveAttribute('aria-invalid', 'true');
    expect(oldField).toHaveAccessibleDescription('toast.password_change_failed');
    expect(oldField).toHaveFocus();
    expect(screen.getByLabelText('new_password')).toHaveAttribute('aria-invalid', 'false');
  });

  it('checks the uppercase and digit rule before sending the request', async () => {
    const api = require('../../lib/api');
    render(<SecuritySection />);
    fillForm({ oldPw: 'currentpw', newPw: 'lowercase1', confirm: 'lowercase1' });

    fireEvent.click(screen.getByRole('button', { name: 'change_password' }));

    const newField = screen.getByLabelText('new_password');
    expect(await screen.findByText('password_hint', { selector: '.set-password-error' })).toBeInTheDocument();
    expect(newField).toHaveAttribute('aria-invalid', 'true');
    expect(newField).toHaveAccessibleDescription('password_hint password_hint');
    expect(newField).toHaveFocus();
    expect(api.apiChangePassword).not.toHaveBeenCalled();

    fireEvent.change(newField, { target: { value: 'Uppercase1' } });
    expect(newField).toHaveAttribute('aria-invalid', 'false');
    expect(newField).toHaveAccessibleDescription('password_hint');
  });

  it('recovers from a thrown network error (offline / CORS) with a visible error and a usable form', async () => {
    const api = require('../../lib/api');
    api.apiChangePassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<SecuritySection />);
    fillForm({ oldPw: 'a', newPw: 'B1234567', confirm: 'B1234567' });

    fireEvent.click(screen.getByRole('button', { name: 'change_password' }));

    expect(await screen.findByText('toast.password_change_failed')).toBeInTheDocument();
    expect(mockToastError).toHaveBeenCalledWith('toast.password_change_failed');
    // Button re-enables so the user can retry without reloading.
    expect(screen.getByRole('button', { name: 'change_password' })).not.toBeDisabled();
  });

  it('clears all three password fields after a successful change', async () => {
    const api = require('../../lib/api');
    api.apiChangePassword.mockResolvedValueOnce({ ok: true, data: {} });

    render(<SecuritySection />);
    const inputs = document.querySelectorAll('input[type="password"]');
    fillForm({ oldPw: 'a', newPw: 'B1234567', confirm: 'B1234567' });

    fireEvent.click(screen.getByRole('button', { name: 'change_password' }));

    await waitFor(() => {
      expect(inputs[0].value).toBe('');
      expect(inputs[1].value).toBe('');
      expect(inputs[2].value).toBe('');
    });
  });
});
