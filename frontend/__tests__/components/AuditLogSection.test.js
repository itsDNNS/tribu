import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import AuditLogSection from '../../components/admin/AuditLogSection';
import en from '../../i18n/en.json';

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({ familyId: 1, messages: require('../../i18n/en.json') }),
}));

jest.mock('../../lib/api', () => ({
  apiGetAuditLog: jest.fn().mockResolvedValue({
    ok: true,
    data: {
      total: 3,
      items: [
        { id: 3, action: 'sign_in', created_at: '2026-11-21T22:00:00Z', target_display_name: 'Anna', details: { method: 'password' } },
        { id: 2, action: 'sign_in_failed', created_at: '2026-11-21T21:50:00Z', target_display_name: 'Anna', details: { method: 'two-step' } },
        { id: 1, action: 'role_changed', created_at: '2026-11-21T21:00:00Z', target_display_name: 'Ben', admin_display_name: 'Anna', details: { old: 'member', new: 'admin' } },
      ],
    },
  }),
}));

it('shows sign-ins and filters them', async () => {
  render(<AuditLogSection />);
  expect(await screen.findByText(en.audit_action_sign_in)).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sign_ins' } });
  expect(screen.getByText(en.audit_action_sign_in_failed)).toBeInTheDocument();
  expect(screen.queryByText('member → admin')).not.toBeInTheDocument();
});
