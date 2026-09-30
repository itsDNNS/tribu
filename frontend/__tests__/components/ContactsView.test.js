import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactsView from '../../components/ContactsView';
import { buildMessages } from '../../lib/i18n';
import * as api from '../../lib/api';
import { handOff } from '../../lib/viewHandoff';

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../lib/api', () => ({
  apiGetContactDuplicates: jest.fn(),
  apiMergeContacts: jest.fn(),
  apiDismissContactDuplicates: jest.fn(),
  apiLinkContactMember: jest.fn(),
  apiCreateContact: jest.fn(),
  apiUpdateContact: jest.fn(),
  apiDeleteContact: jest.fn(),
}));

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

const today = new Date();
const inDays = (days) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);

function setup(overrides = {}) {
  const soon = inDays(3);
  mockAppState = {
    messages: buildMessages('en'),
    demoMode: false,
    setActiveView: jest.fn(),
    isChild: false,
    lang: 'en',
    members: [
      { user_id: 12, display_name: 'Mia', is_adult: false, date_of_birth: '2017-05-20', color: '#8b5cf6' },
    ],
    contacts: [
      {
        id: 1, full_name: 'Ava Brown', email: 'ava@example.com', phone: '+49 170 1234567',
        phone_values: ['+49 170 1234567', '+49 30 555'], birthday_month: soon.getMonth() + 1, birthday_day: soon.getDate(),
        birthday_year: 1990, organization: 'Clinic', addresses: ['Main St 1, 10115 Berlin'], note: 'Mornings only', synced: true,
      },
      { id: 2, full_name: 'Grandma Ilse', birthday_month: 6, birthday_day: 3, birthday_year: null },
      { id: 3, full_name: 'Ava B.', phone: '0170 1234567' },
    ],
    setContacts: jest.fn(),
    familyId: 7,
    loadContacts: jest.fn(),
    loadBirthdays: jest.fn(),
    loadDashboard: jest.fn(),
    ...overrides,
  };
  return render(<ContactsView />);
}

beforeEach(() => {
  jest.clearAllMocks();
  api.apiGetContactDuplicates.mockResolvedValue({ ok: true, data: [] });
});

describe('ContactsView', () => {
  it('shows coming birthdays, contacts and a chosen contact in one place', () => {
    setup();
    const upcoming = screen.getByRole('region', { name: 'Coming birthdays' });
    expect(upcoming).toHaveTextContent('Ava Brown');
    expect(upcoming).toHaveTextContent('in 3 days');
    expect(upcoming).toHaveTextContent(`turns ${today.getFullYear() - 1990 + (inDays(3).getFullYear() - today.getFullYear())}`);
    expect(upcoming).toHaveTextContent('Mia');

    fireEvent.click(screen.getAllByRole('button', { name: /Grandma Ilse/ })[0]);
    expect(screen.getByRole('heading', { name: 'Grandma Ilse', level: 2 })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /^Ava Brown/ }).at(-1));
    expect(screen.getByRole('heading', { name: 'Ava Brown', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+491701234567');
    expect(screen.getByRole('link', { name: '+49 30 555' })).toBeInTheDocument();
    expect(screen.getByText('Main St 1, 10115 Berlin')).toBeInTheDocument();
    expect(screen.getByText('Mornings only')).toBeInTheDocument();
    expect(screen.getByText('From phone sync')).toBeInTheDocument();
  });

  it('searches by name and by phone digits', () => {
    const { container } = setup();
    const list = within(container.querySelector('.contacts-list-pane'));
    const search = screen.getByRole('searchbox', { name: 'Search contacts' });
    fireEvent.change(search, { target: { value: 'ilse' } });
    expect(list.queryByRole('button', { name: /^Ava Brown/ })).not.toBeInTheDocument();
    expect(list.getByRole('button', { name: /Grandma Ilse/ })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '1234567' } });
    expect(list.getAllByRole('button', { name: /^Ava/ })).toHaveLength(2);
  });

  it('lists birthdays by month with members, opened from a handoff', () => {
    handOff('tribu_contacts_tab', 'birthdays');
    const { container } = setup();
    expect(screen.getByRole('button', { name: 'Birthdays' })).toHaveAttribute('aria-pressed', 'true');
    const list = within(container.querySelector('.contacts-list-pane'));
    expect(list.getByText('Mia')).toBeInTheDocument();
    expect(list.getByRole('heading', { name: 'May' })).toBeInTheDocument();
    expect(list.queryByText('Ava B.')).not.toBeInTheDocument();
  });

  it('merges duplicates after picking the one to keep', async () => {
    api.apiGetContactDuplicates.mockResolvedValue({ ok: true, data: [{ contact_ids: [1, 3], reasons: ['phone'] }] });
    api.apiMergeContacts.mockResolvedValue({ ok: true, data: { id: 1 } });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = screen.getByRole('dialog', { name: 'Duplicate contacts' });
    expect(dialog).toHaveTextContent('Same number');
    // The richer contact is picked to keep.
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(api.apiMergeContacts).toHaveBeenCalledWith(7, 1, [3]));
  });

  it('children only read', () => {
    setup({ isChild: true });
    expect(screen.queryByRole('button', { name: 'Add contact' })).not.toBeInTheDocument();
    expect(api.apiGetContactDuplicates).not.toHaveBeenCalled();
  });

  it('suggests linking a phone contact to the family member it is', async () => {
    api.apiGetContactDuplicates.mockResolvedValue({
      ok: true,
      data: [{ contact_ids: [2], member_user_id: 12, reasons: ['birthday', 'first_name'] }],
    });
    api.apiLinkContactMember.mockResolvedValue({ ok: true, data: {} });
    setup({ loadMembers: jest.fn() });
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = screen.getByRole('dialog', { name: 'Is this someone from the family?' });
    expect(dialog).toHaveTextContent('“Grandma Ilse” looks like Mia from your family.');
    expect(dialog).toHaveTextContent('Same first name');
    fireEvent.click(within(dialog).getByRole('button', { name: /Link/ }));
    await waitFor(() => expect(api.apiLinkContactMember).toHaveBeenCalledWith(2, 7, 12));
  });
});

