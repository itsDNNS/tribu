import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactsView from '../../components/ContactsView';
import { buildMessages } from '../../lib/i18n';

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

function setup(overrides = {}) {
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
      { id: 1, full_name: 'Ava Brown', email: 'ava@example.com', phone: '', birthday_month: 5, birthday_day: 18 },
    ],
    setContacts: jest.fn(),
    familyId: 7,
    loadContacts: jest.fn(),
    loadBirthdays: jest.fn(),
    loadDashboard: jest.fn(),
    birthdays: [
      { id: 2, person_name: 'Grandma', month: 6, day: 3, year: null },
    ],
    setBirthdays: jest.fn(),
    ...overrides,
  };
  return render(<ContactsView />);
}

describe('ContactsView', () => {
  it('renders the redesigned contacts shell and birthday tab', () => {
    const { container } = setup();

    expect(container.querySelector('.contacts-page')).toBeInTheDocument();
    expect(container.querySelector('.contacts-page-icon')).toBeInTheDocument();
    expect(screen.getByText('Ava Brown')).toBeInTheDocument();
    expect(screen.getByText('ava@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Birthdays/i }));

    expect(screen.getByText('Grandma')).toBeInTheDocument();
    expect(screen.getByText('Mia')).toBeInTheDocument();
    expect(container.querySelector('.birthday-card-member')).toBeInTheDocument();
  });
});
