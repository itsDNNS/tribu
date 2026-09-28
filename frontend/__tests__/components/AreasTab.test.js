import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AreasTab from '../../components/settings/AreasTab';
import { buildMessages } from '../../lib/i18n';
import { isNavItemVisible } from '../../lib/navigation';

let mockApp = {};
const mockToastError = jest.fn();
jest.mock('../../contexts/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ error: mockToastError }) }));
jest.mock('../../lib/api', () => ({ apiSetFamilyAreas: jest.fn() }));
const api = require('../../lib/api');

function renderTab(hiddenAreas = []) {
  const setHiddenAreas = jest.fn();
  mockApp = { messages: buildMessages('en'), familyId: 7, hiddenAreas, setHiddenAreas };
  render(<AreasTab />);
  return setHiddenAreas;
}

describe('AreasTab', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows one switch per optional area, on while shown', () => {
    renderTab(['gifts']);
    expect(screen.getAllByRole('switch')).toHaveLength(7);
    expect(screen.getByRole('switch', { name: 'Recipes' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Gifts' })).toHaveAttribute('aria-checked', 'false');
  });

  it('hides an area for the family in navigation order', async () => {
    api.apiSetFamilyAreas.mockResolvedValue({ ok: true, data: {} });
    const setHiddenAreas = renderTab(['gifts']);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Recipes' })); });
    expect(setHiddenAreas).toHaveBeenCalledWith(['recipes', 'gifts']);
    expect(api.apiSetFamilyAreas).toHaveBeenCalledWith(7, ['recipes', 'gifts']);
  });

  it('restores the areas when saving fails', async () => {
    api.apiSetFamilyAreas.mockResolvedValue({ ok: false, data: { detail: 'nope' } });
    const setHiddenAreas = renderTab([]);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Gifts' })); });
    expect(setHiddenAreas).toHaveBeenLastCalledWith([]);
    expect(mockToastError).toHaveBeenCalled();
  });
});

describe('isNavItemVisible', () => {
  it('leaves out areas the family hides', () => {
    expect(isNavItemVisible('recipes', { hiddenAreas: ['recipes'] })).toBe(false);
    expect(isNavItemVisible('recipes', { hiddenAreas: ['gifts'] })).toBe(true);
    expect(isNavItemVisible('calendar', { hiddenAreas: ['recipes'] })).toBe(true);
  });
});
