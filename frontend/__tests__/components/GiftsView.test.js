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
};

function baseState(overrides) {
  return {
    familyId: '1',
    families: [{ family_id: 1, family_name: 'Test' }],
    members: [],
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
});
