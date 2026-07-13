import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AccountTab from '../../components/settings/AccountTab';
import * as api from '../../lib/api';

let mockAppState = {};
const toastSuccess = jest.fn();
const toastError = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

jest.mock('../../components/settings/SecuritySection', () => function SecuritySection() {
  return <section aria-label="Security panel">Security panel</section>;
});

jest.mock('../../lib/api', () => ({
  apiDeleteAccount: jest.fn(),
  apiLeaveFamily: jest.fn(),
  apiSetMemberBirthdate: jest.fn(),
  apiSetMemberColor: jest.fn(),
  apiUpdateProfileImage: jest.fn(),
}));

const messages = {
  profile: 'Profile',
  profile_image: 'Profile image',
  birthdate: 'Date of birth',
  personal_color: 'Personal color',
  color_taken_by: 'Taken by {name}',
  theme: 'Theme',
  language: 'Language',
  child: 'Child',
  member: 'Member',
  danger_zone: 'Danger zone',
  leave_family: 'Leave family',
  leave_family_desc: 'Leave this family.',
  leave_family_confirm: 'Really leave?',
  leave_family_last_admin: 'Last admin',
  left_family: 'Left family',
  delete_account: 'Delete Account',
  delete_account_desc: 'Delete your account.',
  delete_account_confirm: 'Type DELETE to confirm.',
  delete_account_placeholder: 'Type DELETE',
  account_deleted: 'Account deleted',
  cancel: 'Cancel',
  'toast.error': 'Something went wrong',
  'toast.profile_updated': 'Profile updated',
};

function baseState(overrides = {}) {
  const loadMembers = jest.fn().mockResolvedValue(undefined);
  return {
    theme: 'light',
    setTheme: jest.fn(),
    lang: 'en',
    setLang: jest.fn(),
    availableThemes: [{ key: 'light', name: 'Light' }],
    availableLanguages: [{ key: 'en', nativeName: 'English' }],
    messages,
    me: { user_id: 7, display_name: 'Dennis', email: 'dennis@example.test' },
    isAdmin: true,
    isChild: false,
    loggedIn: true,
    profileImage: null,
    setProfileImage: jest.fn(),
    members: [{ user_id: 7, display_name: 'Dennis', email: 'dennis@example.test', role: 'admin', is_adult: true, date_of_birth: '1985-07-15' }],
    familyId: 42,
    loadMembers,
    logout: jest.fn(),
    ...overrides,
  };
}

function renderAccount(overrides = {}) {
  mockAppState = baseState(overrides);
  return render(<AccountTab />);
}

describe('AccountTab birthdate input', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.apiSetMemberBirthdate.mockResolvedValue({ ok: true, data: { date_of_birth: '1990-05-12' } });
  });

  test('does not save partial or segment edits before the field is committed', () => {
    renderAccount();

    const input = screen.getByLabelText('Date of birth');
    fireEvent.change(input, { target: { value: '0001-05-12' } });

    expect(input).toHaveValue('0001-05-12');
    expect(api.apiSetMemberBirthdate).not.toHaveBeenCalled();
  });

  test('reverts out-of-range years on blur instead of saving year 0001', async () => {
    renderAccount();

    const input = screen.getByLabelText('Date of birth');
    fireEvent.change(input, { target: { value: '0001-05-12' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue('1985-07-15'));
    expect(api.apiSetMemberBirthdate).not.toHaveBeenCalled();
  });

  test('saves a valid typed birthdate only on blur', async () => {
    renderAccount();

    const input = screen.getByLabelText('Date of birth');
    fireEvent.change(input, { target: { value: '1990-05-12' } });

    expect(api.apiSetMemberBirthdate).not.toHaveBeenCalled();

    fireEvent.blur(input);

    await waitFor(() => expect(api.apiSetMemberBirthdate).toHaveBeenCalledWith(42, 7, '1990-05-12'));
    expect(mockAppState.loadMembers).toHaveBeenCalledTimes(1);
  });

  test('pressing Enter commits the current birthdate', async () => {
    renderAccount();

    const input = screen.getByLabelText('Date of birth');
    fireEvent.change(input, { target: { value: '1991-06-13' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(api.apiSetMemberBirthdate).toHaveBeenCalledWith(42, 7, '1991-06-13'));
  });

  test('does not double-save when Enter is followed by blur before the request finishes', async () => {
    let resolveSave;
    api.apiSetMemberBirthdate.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
    renderAccount();

    const input = screen.getByLabelText('Date of birth');
    fireEvent.change(input, { target: { value: '1992-07-14' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(api.apiSetMemberBirthdate).toHaveBeenCalledTimes(1);
    expect(api.apiSetMemberBirthdate).toHaveBeenCalledWith(42, 7, '1992-07-14');

    resolveSave({ ok: true, data: { date_of_birth: '1992-07-14' } });
    await waitFor(() => expect(mockAppState.loadMembers).toHaveBeenCalledTimes(1));
  });

  test('clearing the field stores null on blur', async () => {
    renderAccount();

    const input = screen.getByLabelText('Date of birth');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    await waitFor(() => expect(api.apiSetMemberBirthdate).toHaveBeenCalledWith(42, 7, null));
  });

  test('blur without changes does not call the birthdate API', () => {
    renderAccount();

    fireEvent.blur(screen.getByLabelText('Date of birth'));

    expect(api.apiSetMemberBirthdate).not.toHaveBeenCalled();
  });

  test('resets to the last saved value when saving fails', async () => {
    api.apiSetMemberBirthdate.mockResolvedValue({ ok: false, data: { detail: 'Nope' } });
    renderAccount();

    const input = screen.getByLabelText('Date of birth');
    fireEvent.change(input, { target: { value: '1990-05-12' } });
    fireEvent.blur(input);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(input).toHaveValue('1985-07-15');
  });
});
