import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PhoneSyncTab from '../../components/settings/PhoneSyncTab';
import { buildMessages } from '../../lib/i18n';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/helpers', () => ({
  copyTextToClipboard: jest.fn(async () => true),
}));

function baseState(overrides) {
  return {
    me: { email: 'mail@example.com' },
    families: [
      { family_id: 1, family_name: 'Alpha' },
      { family_id: 2, family_name: 'Beta' },
    ],
    messages: buildMessages('de'),
    ...overrides,
  };
}

describe('PhoneSyncTab', () => {
  test('renders one shared DAV server URL plus username for end users', () => {
    mockAppState = baseState();

    render(<PhoneSyncTab />);

    expect(screen.getByText('Server-URL')).toBeInTheDocument();
    expect(screen.getByText('Benutzername')).toBeInTheDocument();
    expect(screen.getByText('http://localhost/dav/')).toBeInTheDocument();
    expect(screen.getByText('mail@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/cal-1|book-1|cal-2|book-2/)).not.toBeInTheDocument();
  });

  test('explains that calendars and address books appear after login', () => {
    mockAppState = baseState();

    render(<PhoneSyncTab />);

    expect(screen.getByText('Was danach erscheint')).toBeInTheDocument();
    expect(
      screen.getByText(/Nach der Anmeldung zeigt Tribu automatisch die Kalender und Adressbücher aller Familien/i),
    ).toBeInTheDocument();
  });
});
