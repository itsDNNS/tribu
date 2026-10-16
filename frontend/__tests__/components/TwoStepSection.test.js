import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TwoStepSection from '../../components/settings/TwoStepSection';

const mockToastSuccess = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({ messages: {}, demoMode: false }),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess }),
}));

jest.mock('../../lib/api', () => ({
  apiGetMfaStatus: jest.fn(),
  apiStartMfaSetup: jest.fn(),
  apiConfirmMfa: jest.fn(),
  apiDisableMfa: jest.fn(),
}));

jest.mock('../../lib/i18n', () => ({
  t: (_messages, key) => key,
}));

jest.mock('../../lib/helpers', () => ({
  errorText: (detail, fallback) => detail?.code || fallback,
}));

const SETUP = { secret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', otpauth_uri: 'otpauth://totp/Tribu:a?secret=ABC', setup_token: 'setup-token' };

describe('TwoStepSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stays hidden for accounts without a local password', async () => {
    const api = require('../../lib/api');
    api.apiGetMfaStatus.mockResolvedValue({ ok: true, data: { enabled: false, available: false, recovery_codes_remaining: 0 } });

    const { container } = render(<TwoStepSection />);

    await waitFor(() => expect(api.apiGetMfaStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('turns on only after a confirmed code and keeps the recovery codes until they are saved', async () => {
    const api = require('../../lib/api');
    api.apiGetMfaStatus
      .mockResolvedValueOnce({ ok: true, data: { enabled: false, available: true, recovery_codes_remaining: 0 } })
      .mockResolvedValue({ ok: true, data: { enabled: true, available: true, recovery_codes_remaining: 2 } });
    api.apiStartMfaSetup.mockResolvedValue({ ok: true, data: SETUP });
    api.apiConfirmMfa
      .mockResolvedValueOnce({ ok: false, data: { detail: { code: 'MFA_CODE_INVALID' } } })
      .mockResolvedValueOnce({ ok: true, data: { recovery_codes: ['aaaaa-bbbbb', 'ccccc-ddddd'] } });

    render(<TwoStepSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'two_step.turn_on' }));
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Secure1Pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'two_step.continue' }));

    expect(await screen.findByTestId('display-pairing-qr')).toBeInTheDocument();
    expect(screen.getByText('ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567')).toBeInTheDocument();
    expect(api.apiStartMfaSetup).toHaveBeenCalledWith('Secure1Pass');

    fireEvent.change(screen.getByLabelText('two_step.code_label'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'two_step.confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('MFA_CODE_INVALID');

    fireEvent.change(screen.getByLabelText('two_step.code_label'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'two_step.confirm' }));

    expect(await screen.findByTestId('two-step-recovery-codes')).toHaveTextContent('aaaaa-bbbbb');
    expect(api.apiConfirmMfa).toHaveBeenLastCalledWith('setup-token', '123456');
    const done = screen.getByRole('button', { name: 'two_step.done' });
    expect(done).toBeDisabled();

    fireEvent.click(screen.getByLabelText('two_step.codes_saved'));
    fireEvent.click(done);

    expect(mockToastSuccess).toHaveBeenCalledWith('two_step.enabled_toast');
    expect(screen.queryByTestId('two-step-recovery-codes')).not.toBeInTheDocument();
    expect(screen.getByText(/two_step\.codes_low/)).toBeInTheDocument();
  });

  it('turns off with password and code', async () => {
    const api = require('../../lib/api');
    api.apiGetMfaStatus
      .mockResolvedValueOnce({ ok: true, data: { enabled: true, available: true, recovery_codes_remaining: 10 } })
      .mockResolvedValue({ ok: true, data: { enabled: false, available: true, recovery_codes_remaining: 0 } });
    api.apiDisableMfa.mockResolvedValue({ ok: true, data: { status: 'ok' } });

    render(<TwoStepSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'two_step.turn_off' }));
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Secure1Pass' } });
    fireEvent.change(screen.getByLabelText('two_step.code_or_recovery'), { target: { value: 'aaaaa-bbbbb' } });
    fireEvent.click(screen.getByRole('button', { name: 'two_step.turn_off' }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('two_step.disabled_toast'));
    expect(api.apiDisableMfa).toHaveBeenCalledWith('Secure1Pass', 'aaaaa-bbbbb');
    expect(screen.getByRole('button', { name: 'two_step.turn_on' })).toBeInTheDocument();
  });
});
