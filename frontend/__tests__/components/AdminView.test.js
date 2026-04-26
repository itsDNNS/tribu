import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminView from '../../components/admin';

let mockAppState = {};
const toastError = jest.fn();
const toastInfo = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ error: toastError, info: toastInfo }),
}));

jest.mock('../../components/admin/InviteSection', () => () => <section aria-label="Invitations panel">Invitations panel</section>);
jest.mock('../../components/admin/SsoSection', () => () => <section aria-label="SSO panel">SSO panel</section>);
jest.mock('../../components/admin/BackupSection', () => () => <section aria-label="Backups panel">Backups panel</section>);
jest.mock('../../components/admin/AuditLogSection', () => () => <section aria-label="Audit log panel">Audit log panel</section>);
jest.mock('../../components/MemberAvatar', () => () => <span data-testid="member-avatar" />);
jest.mock('../../components/ConfirmDialog', () => () => <div role="dialog">Confirm dialog</div>);

jest.mock('../../lib/api', () => ({
  apiCreateMember: jest.fn(),
  apiRemoveMember: jest.fn(),
  apiResetMemberPassword: jest.fn(),
  apiSetAdult: jest.fn(),
  apiSetMemberAvatar: jest.fn(),
  apiSetMemberBirthdate: jest.fn(),
  apiSetRole: jest.fn(),
  apiSetTimeFormat: jest.fn(),
}));

const messages = {
  admin_members: 'Members',
  admin_title: 'Admin',
  admin_sections: 'Admin sections',
  admin_tab_members: 'Members',
  invite_title: 'Invitations',
  'sso.title': 'Single Sign-On',
  backup_title: 'Backups',
  audit_log_title: 'Audit Log',
  time_format: 'Time format',
  member: 'Member',
  child: 'Child',
  add_member: 'Add member',
  add_member_desc: 'Add a member.',
  member_email: 'Email',
  member_name: 'Name',
  member_role: 'Role',
  member_is_adult: 'Adult',
  cancel: 'Cancel',
  remove_member: 'Remove member',
  remove_member_confirm: 'Remove this member?',
  admin_demoted: 'Demoted',
  avatar_too_large: 'Avatar too large',
  password_was_reset: 'Password reset',
  member_created: 'Member created',
  member_created_warning: 'Save this password.',
  token_copied: 'Copied',
  token_copy: 'Copy',
  dismiss: 'Dismiss',
  admin_self_hint: 'You cannot change your own role',
  date_of_birth: 'Date of birth',
  reset_password: 'Reset password',
  remove: 'Remove',
  toast: { error: 'Error' },
};

function baseState(overrides = {}) {
  return {
    familyId: 1,
    members: [
      { user_id: 1, display_name: 'Dennis', email: 'dennis@example.test', role: 'admin', is_adult: true },
      { user_id: 2, display_name: 'Mia', email: 'mia@example.test', role: 'member', is_adult: false },
    ],
    messages,
    loadMembers: jest.fn(),
    me: { user_id: 1, display_name: 'Dennis' },
    demoMode: false,
    timeFormat: '24h',
    setTimeFormat: jest.fn(),
    ...overrides,
  };
}

describe('AdminView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = baseState();
  });

  test('renders admin sections as a submenu instead of one long page', () => {
    render(<AdminView />);

    const nav = screen.getByRole('navigation', { name: 'Admin sections' });
    expect(within(nav).getByRole('button', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: 'Invitations' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Single Sign-On' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Backups' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Audit Log' })).toBeInTheDocument();

    expect(screen.getByText('Time format')).toBeInTheDocument();
    expect(screen.queryByLabelText('Invitations panel')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('SSO panel')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Backups panel')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Audit log panel')).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: 'Single Sign-On' }));

    expect(within(nav).getByRole('button', { name: 'Single Sign-On' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('SSO panel')).toBeInTheDocument();
    expect(screen.queryByText('Time format')).not.toBeInTheDocument();
  });
});
