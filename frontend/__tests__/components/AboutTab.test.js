import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AboutTab from '../../components/settings/AboutTab';
import { buildMessages } from '../../lib/i18n';
import * as api from '../../lib/api';

jest.mock('../../lib/api');
jest.mock('../../contexts/AppContext', () => ({ useApp: jest.fn() }));

const { useApp } = require('../../contexts/AppContext');

function renderAboutTab() {
  useApp.mockReturnValue({ messages: buildMessages('en'), isAdmin: true });
  return render(<AboutTab />);
}

describe('AboutTab version update check', () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    api.apiGetHealth.mockResolvedValue({ ok: true, data: { version: '2026-04-24.131' } });
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({
        tag_name: 'v2026-04-27.1',
        html_url: 'https://github.com/itsDNNS/tribu/releases/tag/v2026-04-27.1',
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('shows the full latest release with a single v prefix', async () => {
    renderAboutTab();

    await screen.findByText('Version: v2026-04-24.131');
    await waitFor(() => {
      expect(screen.getByText(/v2026-04-27\.1 available/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/vv2026-04-27/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View release notes/i })).toHaveAttribute(
      'href',
      'https://github.com/itsDNNS/tribu/releases/tag/v2026-04-27.1',
    );
  });
});
