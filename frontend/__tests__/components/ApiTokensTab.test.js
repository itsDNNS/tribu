import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ApiTokensTab from '../../components/settings/ApiTokensTab';
import { buildMessages } from '../../lib/i18n';
import { TOKEN_SCOPE_MODULES } from '../../lib/tokenScopes';
import * as api from '../../lib/api';

let mockAppState = {};
const toastSuccess = jest.fn();
const toastError = jest.fn();

jest.mock('../../lib/api');
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

function openCreateForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
  fireEvent.change(screen.getByLabelText('Token name'), { target: { value: 'Local assistant' } });
}

function submitButton() {
  return screen.getByRole('button', { name: 'Create token' });
}

function moduleGroup(name) {
  return screen.getByRole('group', { name });
}

describe('ApiTokensTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = { messages: buildMessages('en'), lang: 'en', loggedIn: true, demoMode: false, isAdmin: false };
    api.apiGetTokens.mockResolvedValue({ ok: true, data: [] });
    api.apiCreateToken.mockResolvedValue({ ok: true, data: { token: 'tribu_pat_example' } });
  });

  it('offers every user scope module with the actions it supports', async () => {
    render(<ApiTokensTab />);
    openCreateForm();
    fireEvent.click(screen.getByLabelText('Full access'));

    const messages = buildMessages('en');
    for (const mod of TOKEN_SCOPE_MODULES.filter((m) => !m.adminOnly)) {
      const group = moduleGroup(messages[`token_scope_${mod.key}`]);
      const boxes = within(group).getAllByRole('checkbox');
      expect(boxes.map((box) => box.closest('label').textContent)).toEqual(
        mod.actions.map((action) => messages[`token_action_${action}`]),
      );
    }
    expect(within(moduleGroup('Activity')).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows admin scopes only to admins', () => {
    mockAppState = { ...mockAppState, isAdmin: true };
    render(<ApiTokensTab />);
    openCreateForm();
    fireEvent.click(screen.getByLabelText('Full access'));

    expect(within(moduleGroup('Admin')).getAllByRole('checkbox')).toHaveLength(2);
  });

  it('creates a narrow token for tasks and shopping', async () => {
    render(<ApiTokensTab />);
    openCreateForm();
    fireEvent.click(screen.getByLabelText('Full access'));
    fireEvent.click(within(moduleGroup('Tasks')).getByLabelText('Read'));
    fireEvent.click(within(moduleGroup('Tasks')).getByLabelText('Write'));
    fireEvent.click(within(moduleGroup('Shopping')).getByLabelText('Read'));
    fireEvent.click(within(moduleGroup('Shopping')).getByLabelText('Write'));
    fireEvent.click(submitButton());

    await waitFor(() => expect(api.apiCreateToken).toHaveBeenCalledTimes(1));
    expect(api.apiCreateToken).toHaveBeenCalledWith({
      name: 'Local assistant',
      scopes: ['tasks:read', 'tasks:write', 'shopping:read', 'shopping:write'],
    });
  });

  it('never turns an empty selection into full access', () => {
    render(<ApiTokensTab />);
    openCreateForm();
    expect(submitButton()).toBeEnabled();

    fireEvent.click(screen.getByLabelText('Full access'));
    expect(submitButton()).toBeDisabled();
    expect(screen.getByText('Choose at least one permission or tick Full access.')).toBeInTheDocument();
    expect(submitButton()).toHaveAccessibleDescription('Choose at least one permission or tick Full access.');

    fireEvent.submit(submitButton().closest('form'));
    expect(api.apiCreateToken).not.toHaveBeenCalled();

    // Ticking and unticking the last module scope leaves the selection empty again.
    fireEvent.click(within(moduleGroup('Tasks')).getByLabelText('Read'));
    expect(submitButton()).toBeEnabled();
    fireEvent.click(within(moduleGroup('Tasks')).getByLabelText('Read'));
    expect(submitButton()).toBeDisabled();
    fireEvent.submit(submitButton().closest('form'));
    expect(api.apiCreateToken).not.toHaveBeenCalled();
  });

  it('still creates full access tokens when Full access is ticked', async () => {
    render(<ApiTokensTab />);
    openCreateForm();
    fireEvent.click(submitButton());

    await waitFor(() => expect(api.apiCreateToken).toHaveBeenCalledWith({ name: 'Local assistant', scopes: ['*'] }));
  });

  it('creates only one token when Create is pressed twice quickly', async () => {
    let answer;
    api.apiCreateToken.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    render(<ApiTokensTab />);
    openCreateForm();
    const form = submitButton().closest('form');
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.apiCreateToken).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeDisabled();

    answer({ ok: true, data: { token: 'tribu_pat_first' } });
    await waitFor(() => expect(screen.getByText('tribu_pat_first')).toBeInTheDocument());
    expect(api.apiCreateToken).toHaveBeenCalledTimes(1);
  });

  it('announces why Create is unavailable', () => {
    render(<ApiTokensTab />);
    openCreateForm();
    fireEvent.click(screen.getByLabelText('Full access'));
    expect(screen.getByRole('status')).toHaveTextContent(/at least one permission/i);
  });

  it('shows the scopes of existing tokens with readable labels', async () => {
    mockAppState = { ...mockAppState, messages: buildMessages('de'), lang: 'de' };
    api.apiGetTokens.mockResolvedValue({
      ok: true,
      data: [
        { id: 1, name: 'Ollama', scopes: 'shopping:read,shopping:write,tasks:read', last_used_at: null, expires_at: null },
        { id: 2, name: 'Skript', scopes: '*', last_used_at: null, expires_at: null },
      ],
    });

    render(<ApiTokensTab />);

    expect(await screen.findByText('Aufgaben: Lesen · Einkauf: Lesen, Schreiben')).toBeInTheDocument();
    expect(screen.getByText('Vollzugriff')).toBeInTheDocument();
    expect(screen.queryByText(/shopping:read/)).not.toBeInTheDocument();
  });
});
