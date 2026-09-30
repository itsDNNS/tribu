import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import GiftsView from '../../components/GiftsView';
import { handOff } from '../../lib/handoff';
import { buildMessages } from '../../lib/i18n';
import { isoDate } from '../../lib/gifts';

let mockApp;
jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('../../lib/api');
const api = require('../../lib/api');

const members = [
  { user_id: 1, display_name: 'Dennis', is_adult: true },
  { user_id: 2, display_name: 'Anna', is_adult: true },
  { user_id: 3, display_name: 'Lena', is_adult: false },
];

function inDays(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function gift(fields) {
  return {
    id: 1, family_id: 1, kind: 'idea', for_user_id: null, for_contact_id: null, for_person_name: null, title: 'Gift',
    description: null, url: null, image: null, occasion: null, occasion_date: null, status: 'idea', notes: null,
    current_price_cents: null, currency: 'EUR', gifted_at: null, claimed_by_user_id: null, claimed_at: null,
    for_me: false, created_by_user_id: 1, created_at: '2026-09-01T10:00:00', updated_at: '2026-09-01T10:00:00',
    ...fields,
  };
}

function occasion(fields) {
  return {
    key: 'birthday', occasion: 'birthday', date: inDays(6), days_until: 6, recipient_key: 'u:2', for_user_id: 2,
    for_contact_id: null, person_name: 'Anna', turns: 39, for_me: false, gift_ids: [], gift_count: 0, claimed_count: 0,
    purchased_count: 0, wish_count: 0, budget_cents: null, spent_cents: null, ...fields,
  };
}

function setup({ gifts = [], occasions = [], me = members[0], isChild = false, demoMode = false } = {}) {
  mockApp = {
    messages: buildMessages('de'), lang: 'de', familyId: 1, me, members, contacts: [], birthdays: [], isChild, demoMode,
  };
  api.apiGetGifts.mockResolvedValue({ ok: true, data: { items: gifts, total: gifts.length } });
  api.apiGetGiftOccasions.mockResolvedValue({ ok: true, data: { items: occasions } });
}

beforeEach(() => {
  jest.resetAllMocks();
  for (const fn of ['apiCreateGift', 'apiUpdateGift', 'apiDeleteGift', 'apiClaimGift', 'apiUnclaimGift', 'apiSetGiftBudget']) {
    api[fn].mockResolvedValue({ ok: true, data: {} });
  }
});

test('the next occasion leads, with what is planned and what is missing', async () => {
  const necklace = gift({ id: 7, title: 'Kette', for_user_id: 2, occasion: 'birthday', current_price_cents: 4500 });
  setup({ gifts: [necklace], occasions: [occasion({ gift_ids: [7], gift_count: 1, wish_count: 2 })] });
  render(<GiftsView />);
  const card = await screen.findByRole('region', { name: /Anna · Geburtstag/ });
  expect(within(card).getByText('Noch nichts geplant')).toBeInTheDocument();
  expect(within(card).getByText('2 offene Wünsche')).toBeInTheDocument();
  expect(within(card).getByText('in 6 Tagen · wird 39')).toBeInTheDocument();
  expect(within(card).getByText('Kette')).toBeInTheDocument();

  fireEvent.click(within(card).getByRole('button', { name: /Ich kümmere mich/ }));
  await waitFor(() => expect(api.apiClaimGift).toHaveBeenCalledWith(7));
});

test('someone else taking care shows who, and adults may set a budget', async () => {
  const scarf = gift({ id: 8, title: 'Schal', for_user_id: 2, occasion: 'birthday', claimed_by_user_id: 3, status: 'purchased', current_price_cents: 3000 });
  setup({ gifts: [scarf], occasions: [occasion({ gift_ids: [8], gift_count: 1, claimed_count: 1, purchased_count: 1, budget_cents: 5000, spent_cents: 3000 })] });
  render(<GiftsView />);
  const card = await screen.findByRole('region', { name: /Anna · Geburtstag/ });
  expect(within(card).getByText('Lena kümmert sich')).toBeInTheDocument();
  expect(within(card).getByText(/30 € von 50 € verplant/)).toBeInTheDocument();

  fireEvent.click(within(card).getByRole('button', { name: 'Budget' }));
  const dialog = await screen.findByRole('dialog', { name: 'Budget für Anna' });
  fireEvent.change(within(dialog).getByLabelText('Betrag'), { target: { value: '80' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(api.apiSetGiftBudget).toHaveBeenCalledWith({
    family_id: 1, occasion: 'birthday', occasion_date: inDays(6), recipient_key: 'u:2', amount_cents: 8000,
  }));
});

test('my own wishes show no hint of who takes care of them', async () => {
  const wish = gift({ id: 9, kind: 'wish', title: 'Kopfhörer', for_user_id: 1, for_me: true });
  setup({ gifts: [wish] });
  render(<GiftsView />);
  fireEvent.click(await screen.findByRole('tab', { name: /Meine Wünsche/ }));
  expect(await screen.findByText('Kopfhörer')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ich kümmere mich/ })).not.toBeInTheDocument();
  expect(screen.getByText('Deine Wunschliste')).toBeInTheDocument();
});

test('a person page gathers their wishes and ideas', async () => {
  setup({
    gifts: [
      gift({ id: 1, kind: 'wish', title: 'Malkasten', for_user_id: 3, created_by_user_id: 3 }),
      gift({ id: 2, title: 'Roller', for_user_id: 3 }),
    ],
  });
  render(<GiftsView />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Personen' }));
  fireEvent.click(await screen.findByRole('button', { name: /Lena/ }));
  expect(await screen.findByRole('heading', { name: 'Lena' })).toBeInTheDocument();
  expect(screen.getByText('Wünsche von Lena')).toBeInTheDocument();
  expect(screen.getByText('Malkasten')).toBeInTheDocument();
  expect(screen.getByText('Roller')).toBeInTheDocument();
  expect(screen.getByText('Ideen hier bleiben vor Lena verborgen.')).toBeInTheDocument();
});

test('a product link fills in name, picture and price', async () => {
  setup();
  api.apiPreviewGiftLink.mockResolvedValue({ ok: true, data: { title: 'Holzeisenbahn', image: 'data:image/webp;base64,AAAA', price_cents: 4990, currency: 'EUR', site: 'toys.example' } });
  api.apiCreateGift.mockResolvedValue({ ok: true, data: {} });
  render(<GiftsView />);
  fireEvent.click(await screen.findByRole('button', { name: /Idee notieren/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Neue Geschenkidee' });
  fireEvent.change(within(dialog).getByLabelText('Link zum Produkt'), { target: { value: 'https://toys.example/train' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Übernehmen/ }));
  await waitFor(() => expect(within(dialog).getByLabelText('Geschenk')).toHaveValue('Holzeisenbahn'));
  expect(within(dialog).getByLabelText('Preis')).toHaveValue(49.9);
  expect(within(dialog).getByText('toys.example')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('radio', { name: /Lena/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Idee notieren' }));
  await waitFor(() => expect(api.apiCreateGift).toHaveBeenCalled());
  expect(api.apiCreateGift.mock.calls[0][0]).toMatchObject({
    family_id: 1, kind: 'idea', title: 'Holzeisenbahn', for_user_id: 3, current_price_cents: 4990, url: 'https://toys.example/train',
    image: 'data:image/webp;base64,AAAA',
  });
});

test('children add wishes for themselves', async () => {
  setup({ me: members[2], isChild: true });
  render(<GiftsView />);
  fireEvent.click(await screen.findByRole('button', { name: /Wunsch eintragen/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Neuer Wunsch' });
  expect(within(dialog).queryByRole('radiogroup', { name: 'Empfänger' })).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Geschenk'), { target: { value: 'Rollschuhe' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Wunsch eintragen' }));
  await waitFor(() => expect(api.apiCreateGift).toHaveBeenCalled());
  expect(api.apiCreateGift.mock.calls[0][0]).toMatchObject({ kind: 'wish', title: 'Rollschuhe', for_user_id: 3 });
  expect(api.apiCreateGift.mock.calls[0][0]).not.toHaveProperty('notes');
});

test('the family hub opens a new idea for a birthday', async () => {
  setup();
  act(() => { handOff('gifts_focus', { name: 'Anna', memberId: 2, date: inDays(6), add: true }); });
  render(<GiftsView />);
  const dialog = await screen.findByRole('dialog', { name: 'Neue Geschenkidee' });
  expect(within(dialog).getByRole('radio', { name: /Anna/ })).toHaveAttribute('aria-checked', 'true');
  expect(within(dialog).getByRole('radio', { name: 'Geburtstag' })).toHaveAttribute('aria-checked', 'true');
});

test('the demo shows a family planning gifts without a server', async () => {
  setup({ demoMode: true });
  mockApp.birthdays = [{ id: 1, person_name: 'Helga Müller', month: 1, day: 1 }];
  render(<GiftsView />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Personen' }));
  expect(await screen.findByText('Anna')).toBeInTheDocument();
  expect(api.apiGetGifts).not.toHaveBeenCalled();
});
