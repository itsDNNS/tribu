/**
 * Unit tests for the redesigned shared-home display ("The Hearth").
 *
 * The component is fed only the privacy-safe payload the
 * /display/dashboard endpoint produces. These tests assert:
 *   - Hero clock + family hearth name render with glanceable test ids.
 *   - Today / Tomorrow grouping of the agenda.
 *   - Live event detection ("Happening now") via a mock current time.
 *   - Celebration card hides when no birthdays are due.
 *   - Empty agenda yields the friendly "hearth is quiet" copy.
 *   - No emails, user IDs, or admin/personal controls leak into the DOM.
 */

import { act, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import DisplayDashboard from '../../components/DisplayDashboard';

const ME = { name: 'Kitchen Tablet' };

function buildDashboard(overrides = {}) {
  return {
    family_id: 7,
    family_name: 'Mueller',
    device_name: 'Kitchen Tablet',
    members: [
      { display_name: 'Anna', color: '#7c3aed' },
      { display_name: 'Mia', color: null },
      { display_name: 'Grandma Ilse', color: '#f43f5e' },
    ],
    next_events: [],
    upcoming_birthdays: [],
    ...overrides,
  };
}

function isoLocal(d) {
  // toISOString uses UTC. Build a "naive" local-ISO string the
  // backend would emit (no trailing Z) so parseLooseDate sees local.
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':00'
  );
}

function renderWithFixedNow(dashboard, fixedNow) {
  jest.useFakeTimers();
  jest.setSystemTime(fixedNow);
  let utils;
  act(() => {
    utils = render(<DisplayDashboard me={ME} dashboard={dashboard} />);
  });
  return utils;
}

afterEach(() => {
  jest.useRealTimers();
});

describe('DisplayDashboard — identity + clock', () => {
  test('renders the family hearth name and device tag', () => {
    renderWithFixedNow(buildDashboard(), new Date('2026-04-27T08:30:00'));

    expect(screen.getByTestId('display-family-name')).toHaveTextContent(
      'Mueller'
    );
    expect(screen.getByTestId('display-device-name')).toHaveTextContent(
      'Kitchen Tablet'
    );
  });

  test('renders a glanceable clock and date', () => {
    renderWithFixedNow(buildDashboard(), new Date('2026-04-27T08:30:00'));

    const clock = screen.getByTestId('display-time');
    const date = screen.getByTestId('display-date');
    expect(clock).toBeInTheDocument();
    expect(date).toBeInTheDocument();
    // Robust: time string contains a colon, date string is non-empty.
    expect(clock.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(date.textContent.length).toBeGreaterThan(3);
  });

  test('falls back to "Family" when the family name is empty', () => {
    renderWithFixedNow(
      buildDashboard({ family_name: '' }),
      new Date('2026-04-27T08:30:00')
    );
    expect(screen.getByTestId('display-family-name')).toHaveTextContent(
      'Family'
    );
  });
});

describe('DisplayDashboard — agenda grouping', () => {
  test('groups events by Today and Tomorrow with explicit labels', () => {
    const fixedNow = new Date('2026-04-27T08:00:00');
    const todayLater = new Date('2026-04-27T18:00:00');
    const tomorrow = new Date('2026-04-28T09:00:00');
    renderWithFixedNow(
      buildDashboard({
        next_events: [
          {
            title: 'Soccer practice',
            starts_at: isoLocal(todayLater),
            ends_at: null,
            all_day: false,
            color: null,
            category: 'Sports',
          },
          {
            title: 'Dentist',
            starts_at: isoLocal(tomorrow),
            ends_at: null,
            all_day: false,
            color: null,
            category: null,
          },
        ],
      }),
      fixedNow
    );

    const events = screen.getByTestId('display-events');
    expect(within(events).getByText('Today')).toBeInTheDocument();
    expect(within(events).getByText('Tomorrow')).toBeInTheDocument();
    expect(within(events).getByText('Soccer practice')).toBeInTheDocument();
    expect(within(events).getByText('Dentist')).toBeInTheDocument();
    // category label appears for events that have one.
    expect(within(events).getByText('Sports')).toBeInTheDocument();
  });

  test('marks an event currently in progress as "Happening now"', () => {
    const fixedNow = new Date('2026-04-27T18:30:00');
    const startedAlready = new Date('2026-04-27T18:00:00');
    const endsLater = new Date('2026-04-27T19:30:00');
    renderWithFixedNow(
      buildDashboard({
        next_events: [
          {
            title: 'Family dinner',
            starts_at: isoLocal(startedAlready),
            ends_at: isoLocal(endsLater),
            all_day: false,
            color: '#10b981',
            category: null,
          },
        ],
      }),
      fixedNow
    );

    const focus = screen.getByTestId('display-focus');
    expect(focus).toHaveAttribute('data-status', 'live');
    expect(focus).toHaveTextContent(/happening now/i);
    expect(focus).toHaveTextContent('Family dinner');
  });

  test('shows the friendly empty hearth message when no events', () => {
    renderWithFixedNow(
      buildDashboard({ next_events: [] }),
      new Date('2026-04-27T08:00:00')
    );

    const events = screen.getByTestId('display-events');
    expect(events).toHaveTextContent(/hearth is quiet/i);

    const focus = screen.getByTestId('display-focus');
    expect(focus).toHaveAttribute('data-status', 'empty');
    expect(focus).toHaveTextContent(/all clear/i);
  });
});

describe('DisplayDashboard — celebration + members', () => {
  test('renders the next birthday in the celebration card', () => {
    renderWithFixedNow(
      buildDashboard({
        upcoming_birthdays: [
          { person_name: 'Grandma Ilse', occurs_on: '2026-04-29', days_until: 2 },
          { person_name: 'Anna', occurs_on: '2026-05-20', days_until: 23 },
        ],
      }),
      new Date('2026-04-27T08:00:00')
    );

    const card = screen.getByTestId('display-birthdays');
    expect(within(card).getByText('Grandma Ilse')).toBeInTheDocument();
    expect(within(card).getByText(/in 2 days/i)).toBeInTheDocument();
    // only the soonest birthday is the celebrant; later ones don't render here.
    expect(within(card).queryByText(/in 23 days/i)).not.toBeInTheDocument();
  });

  test('shows the empty celebration message when no birthdays are due', () => {
    renderWithFixedNow(
      buildDashboard({ upcoming_birthdays: [] }),
      new Date('2026-04-27T08:00:00')
    );

    const card = screen.getByTestId('display-birthdays');
    expect(card).toHaveTextContent(/no birthdays/i);
  });

  test('flags imminent celebrants on the member wall', () => {
    renderWithFixedNow(
      buildDashboard({
        upcoming_birthdays: [
          { person_name: 'Grandma Ilse', occurs_on: '2026-04-28', days_until: 1 },
        ],
      }),
      new Date('2026-04-27T08:00:00')
    );

    const members = screen.getByTestId('display-members');
    const memberItems = within(members).getAllByTestId('display-member');
    const ilse = memberItems.find((el) => el.textContent.includes('Grandma Ilse'));
    expect(ilse).toBeTruthy();
    expect(ilse.className).toMatch(/display-member--celebrant/);
  });

  test('renders avatar initials for each member without exposing IDs', () => {
    renderWithFixedNow(buildDashboard(), new Date('2026-04-27T08:00:00'));

    const members = screen.getByTestId('display-members');
    expect(within(members).getByText('Anna')).toBeInTheDocument();
    expect(within(members).getByText('Mia')).toBeInTheDocument();
    // Initial cells render uppercase initials only; never show IDs.
    expect(members.textContent).not.toMatch(/\bID:/i);
    expect(members.textContent).not.toMatch(/\buser_id\b/i);
  });
});

describe('DisplayDashboard — privacy + chrome isolation', () => {
  test('does not leak emails, user IDs, or admin controls', () => {
    renderWithFixedNow(
      buildDashboard({
        next_events: [
          {
            title: 'Soccer practice',
            starts_at: '2099-01-02T18:00:00',
            ends_at: null,
            all_day: false,
            color: null,
            category: null,
          },
        ],
        upcoming_birthdays: [
          { person_name: 'Grandma Ilse', occurs_on: '2099-01-04', days_until: 2 },
        ],
      }),
      new Date('2026-04-27T08:00:00')
    );

    const root = screen.getByTestId('display-dashboard');
    // No e-mail addresses anywhere on the wall display.
    expect(root.textContent).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+/i);
    // No "ID:" labels (numeric IDs would be a leak from the safe payload).
    expect(root.textContent).not.toMatch(/\bID:/i);
    // No admin / settings / nav / search controls.
    expect(screen.queryByText(/^Settings$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Admin$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Logout$/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quick.*add/i })).not.toBeInTheDocument();
  });
});


describe('DisplayDashboard — configurable display layouts', () => {
  test('applies e-ink mode and widget slot spans from the safe config', () => {
    renderWithFixedNow(
      buildDashboard({
        config: {
          display_mode: 'eink',
          refresh_interval_seconds: 900,
          layout_preset: 'eink_agenda',
          layout_config: {
            columns: 4,
            rows: 3,
            widgets: [
              { id: 'clock-wide', type: 'clock', x: 0, y: 0, w: 2, h: 1 },
              { id: 'agenda-large', type: 'agenda', x: 0, y: 1, w: 4, h: 2 },
            ],
          },
        },
      }),
      new Date('2026-04-27T08:00:00')
    );

    const root = screen.getByTestId('display-dashboard');
    expect(root).toHaveAttribute('data-display-mode', 'eink');
    expect(root).toHaveAttribute('data-layout-preset', 'eink_agenda');
    expect(screen.getByTestId('display-layout-grid')).toHaveStyle({
      '--display-grid-columns': '4',
      '--display-grid-rows': '3',
    });
    const agenda = screen.getByTestId('display-widget-agenda');
    expect(agenda).toHaveStyle({ gridColumn: '1 / span 4', gridRow: '2 / span 2' });
  });

  test('ignores unwhitelisted widget types from runtime payloads', () => {
    renderWithFixedNow(
      buildDashboard({
        config: {
          display_mode: 'tablet',
          layout_preset: 'hearth',
          layout_config: {
            columns: 2,
            rows: 2,
            widgets: [
              { id: 'identity', type: 'identity', x: 0, y: 0, w: 1, h: 1 },
              { id: 'admin', type: 'admin', x: 1, y: 0, w: 1, h: 1 },
            ],
          },
        },
      }),
      new Date('2026-04-27T08:00:00')
    );

    expect(screen.getByTestId('display-widget-identity')).toBeInTheDocument();
    expect(screen.queryByTestId('display-widget-admin')).not.toBeInTheDocument();
  });
});
