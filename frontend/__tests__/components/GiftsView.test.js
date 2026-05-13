import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GiftsView from '../../components/GiftsView';

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn() }),
}));

let mockAppState = {};
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

const apiGetGifts = jest.fn();
jest.mock('../../lib/api', () => ({
  apiGetGifts: (...args) => apiGetGifts(...args),
  apiCreateGift: jest.fn(),
  apiUpdateGift: jest.fn(),
  apiDeleteGift: jest.fn(),
}));

const messages = {
  'module.gifts.name': 'Geschenke',
  'module.gifts.adult_only': 'Nur für Erwachsene.',
  'module.gifts.demo_blocked': 'Im Demo nicht verfügbar.',
  'module.gifts.add': 'Geschenk hinzufügen',
  'module.gifts.edit_title': 'Geschenk bearbeiten',
  'module.gifts.cancel': 'Abbrechen',
  'module.gifts.title_placeholder': 'Was schenken?',
  'module.gifts.empty_title': 'Sammle Geschenkideen',
  'module.gifts.empty_body': 'Halte Ideen an einem Ort fest.',
  'module.gifts.empty_chip_hint': 'Oder starte mit einem Anlass',
  'module.gifts.filter_status': 'Nach Status filtern',
  'module.gifts.filter_all_statuses': 'Alle Status',
  'module.gifts.filter_recipient': 'Nach Empfänger filtern',
  'module.gifts.filter_all_recipients': 'Alle Empfänger',
  'module.gifts.filter_include_gifted': 'Verschenkte anzeigen',
  'module.gifts.group_by_recipient': 'Nach Empfänger gruppieren',
  'module.gifts.sort_aria': 'Sortierung',
  'module.gifts.sort.created_desc': 'Neueste zuerst',
  'module.gifts.sort.created_asc': 'Älteste zuerst',
  'module.gifts.sort.occasion_date_asc': 'Nächster Anlass',
  'module.gifts.sort.price_desc': 'Preis absteigend',
  'module.gifts.sort.price_asc': 'Preis aufsteigend',
  'module.gifts.sort.title_asc': 'Titel A-Z',
  'module.gifts.occasion.birthday': 'Geburtstag',
  'module.gifts.occasion.christmas': 'Weihnachten',
  'module.gifts.occasion.easter': 'Ostern',
  'module.gifts.status.idea': 'Idee',
  'module.gifts.status.ordered': 'Bestellt',
  'module.gifts.status.purchased': 'Gekauft',
  'module.gifts.status.gifted': 'Verschenkt',
  'module.gifts.status_aria': 'Status setzen',
  'module.gifts.open_link': 'Produkt öffnen',
  'module.gifts.edit_aria': 'Geschenk "{title}" bearbeiten',
  'module.gifts.delete_aria': 'Geschenk "{title}" löschen',
  'module.gifts.empty_filtered': 'Keine Geschenke passen zu diesen Filtern.',
  'module.gifts.clear_filters': 'Filter zurücksetzen',
};

function baseState(overrides) {
  return {
    familyId: '1',
    families: [{ family_id: 1, family_name: 'Test' }],
    members: [],
    birthdays: [],
    messages,
    isChild: false,
    demoMode: false,
    ...overrides,
  };
}

describe('GiftsView gating', () => {
  beforeEach(() => {
    apiGetGifts.mockReset();
    apiGetGifts.mockResolvedValue({ ok: true, data: { items: [], total: 0 } });
  });

  test('renders the adult-only placeholder for children and does not fetch', async () => {
    mockAppState = baseState({ isChild: true });
    render(<GiftsView />);
    expect(screen.getByText('Nur für Erwachsene.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Geschenk hinzufügen' })).not.toBeInTheDocument();
    expect(apiGetGifts).not.toHaveBeenCalled();
  });

  test('renders the demo placeholder in demo mode and does not fetch', async () => {
    mockAppState = baseState({ demoMode: true });
    render(<GiftsView />);
    expect(screen.getByText('Im Demo nicht verfügbar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Geschenk hinzufügen' })).not.toBeInTheDocument();
    expect(apiGetGifts).not.toHaveBeenCalled();
  });

  test('adult, non-demo user sees the add button and fetches once; dialog opens on click', async () => {
    mockAppState = baseState();
    render(<GiftsView />);
    const addButton = screen.getByRole('button', { name: 'Geschenk hinzufügen' });
    expect(addButton).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Was schenken?')).not.toBeInTheDocument();
    await waitFor(() => expect(apiGetGifts).toHaveBeenCalledTimes(1));

    fireEvent.click(addButton);
    expect(screen.getByPlaceholderText('Was schenken?')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('renders gift cards with the redesigned toolbar and status controls', async () => {
    apiGetGifts.mockResolvedValueOnce({
      ok: true,
      data: {
        items: [{
          id: 5,
          title: 'Buch fuer Oma',
          description: 'Historischer Roman',
          for_user_id: 2,
          occasion: 'birthday',
          occasion_date: '2026-05-20',
          status: 'idea',
          current_price_cents: 1899,
          currency: 'EUR',
        }],
        total: 1,
      },
    });
    mockAppState = baseState({
      members: [{ user_id: 2, display_name: 'Oma' }],
    });
    const { container } = render(<GiftsView />);

    await waitFor(() => expect(screen.getByText('Buch fuer Oma')).toBeInTheDocument());
    expect(container.querySelector('.gift-page')).toBeInTheDocument();
    expect(container.querySelector('.gift-toolbar')).toBeInTheDocument();
    expect(container.querySelector('.gift-card-visual')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Idee' }).some((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(screen.getByRole('button', { name: 'Alle Status' })).toHaveClass('active');
  });
});
