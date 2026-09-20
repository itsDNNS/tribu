import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FamilyTopbar from '../../components/FamilyTopbar';
import CalendarTopbar from '../../components/calendar/CalendarTopbar';
import { buildMessages } from '../../lib/i18n';
import { localeForLang } from '../../lib/dates';

let mockLang = 'fr';
const mockNow = new Date(2026, 8, 20, 13, 5);
jest.mock('../../hooks/useCurrentMinute', () => ({ useCurrentMinute: () => mockNow }));
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    me: { display_name: 'Tester' }, lang: mockLang, messages: buildMessages(mockLang), timeFormat: '24h',
  }),
}));

it.each([['settings', FamilyTopbar], ['calendar', CalendarTopbar]])(
  'preserves localized dates beyond English and German in the %s topbar', (_name, Component) => {
    for (const lang of ['fr', 'sv', 'pl']) {
      mockLang = lang;
      const { unmount } = render(<Component />);
      expect(screen.getByText(mockNow.toLocaleDateString(localeForLang(lang), {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }))).toBeVisible();
      unmount();
    }
  },
);
