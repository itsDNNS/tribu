import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StoreLinksTab from '../../components/settings/StoreLinksTab';
import { buildMessages } from '../../lib/i18n';
import * as api from '../../lib/api';

let mockAppState = {};
const toastSuccess = jest.fn();
const toastError = jest.fn();

jest.mock('../../lib/api');
jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockAppState }));
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

describe('StoreLinksTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = { familyId: 1, messages: buildMessages('en') };
    api.apiGetShoppingStoreLinks.mockResolvedValue({ ok: true, data: [] });
    api.apiCreateShoppingStoreLink.mockResolvedValue({ ok: true, data: { id: 1 } });
    api.apiUpdateShoppingStoreLink.mockResolvedValue({ ok: true, data: { id: 1 } });
    api.apiDeleteShoppingStoreLink.mockResolvedValue({ ok: true, data: { status: 'deleted' } });
  });

  it('renders help, privacy, and a live search example', async () => {
    render(<StoreLinksTab />);
    expect(screen.getByText(/Teach Tribu how a store's website searches/)).toBeInTheDocument();
    expect(screen.getByText(/Tribu never contacts the store/)).toBeInTheDocument();
    const input = screen.getByLabelText('Search address');
    expect(screen.getByText(/Add \{query\}/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'https://example.com/?q={query}' } });
    expect(screen.getByText('https://example.com/?q=bread')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'https://example.com/search' } });
    expect(screen.queryByText('https://example.com/?q=bread')).not.toBeInTheDocument();
  });

  it('uses the localized sample term in the live preview', () => {
    mockAppState = { familyId: 1, messages: buildMessages('de') };
    render(<StoreLinksTab />);
    fireEvent.change(screen.getByLabelText('Suchadresse'), {
      target: { value: 'https://example.com/?q={query}' },
    });
    expect(screen.getByText('https://example.com/?q=Brot')).toBeInTheDocument();
  });

  it('submits trimmed create values', async () => {
    render(<StoreLinksTab />);
    fireEvent.change(screen.getByLabelText('Store name'), { target: { value: '  Corner Market  ' } });
    fireEvent.change(screen.getByLabelText('Search address'), { target: { value: ' https://example.com/?q={query} ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add store' }));
    await waitFor(() => expect(api.apiCreateShoppingStoreLink).toHaveBeenCalledWith({
      family_id: 1,
      name: 'Corner Market',
      url_template: 'https://example.com/?q={query}',
    }));
  });

  it('shows names, hosts, and unknown hosts', async () => {
    api.apiGetShoppingStoreLinks.mockResolvedValue({ ok: true, data: [
      { id: 1, name: 'Market', url_template: 'https://www.example.com/?q={query}' },
      { id: 2, name: 'Broken', url_template: 'not a template' },
    ] });
    render(<StoreLinksTab />);
    expect(await screen.findByText('Market')).toBeInTheDocument();
    expect(screen.getByText('www.example.com')).toBeInTheDocument();
    expect(screen.getByText('Address could not be read')).toBeInTheDocument();
  });

  it('prefills and updates an existing row', async () => {
    api.apiGetShoppingStoreLinks.mockResolvedValue({ ok: true, data: [
      { id: 7, name: 'Market', url_template: 'https://example.com/?q={query}' },
    ] });
    render(<StoreLinksTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Store name')).toHaveValue('Market');
    fireEvent.change(screen.getByLabelText('Store name'), { target: { value: 'New Market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save store' }));
    await waitFor(() => expect(api.apiUpdateShoppingStoreLink).toHaveBeenCalledWith(7, {
      name: 'New Market',
      url_template: 'https://example.com/?q={query}',
    }));
  });

  it('asks before deleting and stops when declined', async () => {
    api.apiGetShoppingStoreLinks.mockResolvedValue({ ok: true, data: [
      { id: 7, name: 'Market', url_template: 'https://example.com/?q={query}' },
    ] });
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<StoreLinksTab />);
    fireEvent.click(await screen.findByLabelText('Delete Market'));
    expect(window.confirm).toHaveBeenCalledWith('Delete store Market?');
    expect(api.apiDeleteShoppingStoreLink).not.toHaveBeenCalled();
  });

  test.each([
    ['SHOPPING_STORE_LINK_NAME_TAKEN', 'A store with this name already exists'],
    ['SHOPPING_STORE_LINK_INVALID_TEMPLATE', 'Enter an http or https address that contains {query} exactly once'],
  ])('localizes %s failures', async (code, message) => {
    api.apiCreateShoppingStoreLink.mockResolvedValue({ ok: false, data: { detail: { code } } });
    render(<StoreLinksTab />);
    fireEvent.change(screen.getByLabelText('Store name'), { target: { value: 'Market' } });
    fireEvent.change(screen.getByLabelText('Search address'), { target: { value: 'https://example.com/?q={query}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add store' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(message));
  });
});
