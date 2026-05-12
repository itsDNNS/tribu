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
      { display_name: 'Anna', color: '#7c3aed', profile_image: 'data:image/png;base64,anna' },
      { display_name: 'Mia', color: null, profile_image: null },
      { display_name: 'Grandma Ilse', color: '#f43f5e', profile_image: null },
    ],
    next_events: [],
    upcoming_birthdays: [],
    today_school_timetables: [],
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

  test('marks the shared display with the warm hearth visual language', () => {
    renderWithFixedNow(buildDashboard(), new Date('2026-04-27T08:30:00'));

    const dashboard = screen.getByTestId('display-dashboard');
    expect(dashboard).toHaveClass('display-dashboard--hearth');
    expect(dashboard).toHaveAttribute('data-visual-language', 'warm-hearth');
    expect(screen.getAllByTestId(/display-widget-/).length).toBeGreaterThan(0);
  });

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

  test('shows participant color markers only for assigned display events', () => {
    const fixedNow = new Date('2026-04-27T08:00:00');
    renderWithFixedNow(
      buildDashboard({
        next_events: [
          {
            title: 'Soccer practice',
            starts_at: isoLocal(new Date('2026-04-27T18:00:00')),
            ends_at: null,
            all_day: false,
            color: '#10b981',
            category: 'Sports',
            participant_colors: ['#7c3aed', 'url(https://example.com/bad)', '#f43f5e'],
          },
          {
            title: 'Dentist',
            starts_at: isoLocal(new Date('2026-04-28T09:00:00')),
            ends_at: null,
            all_day: false,
            color: '#f59e0b',
            category: null,
            participant_colors: [],
          },
        ],
      }),
      fixedNow
    );

    const events = screen.getByTestId('display-events');
    const participantGroup = within(events).getByLabelText('2 participants');
    expect(participantGroup).toHaveAttribute('data-testid', 'display-event-participants');
    const dots = within(participantGroup).getAllByTestId('display-event-participant-color');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveStyle({ '--participant-color': '#7c3aed' });
    expect(dots[1]).toHaveStyle({ '--participant-color': '#f43f5e' });
    expect(participantGroup).not.toHaveStyle({ '--participant-color': 'url(https://example.com/bad)' });
    expect(within(events).queryAllByTestId('display-event-participants')).toHaveLength(1);
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

  test('renders configured member avatar images and falls back to initials without exposing IDs', () => {
    renderWithFixedNow(buildDashboard(), new Date('2026-04-27T08:00:00'));

    const members = screen.getByTestId('display-members');
    expect(within(members).getByText('Anna')).toBeInTheDocument();
    expect(within(members).getByText('Mia')).toBeInTheDocument();
    const annaAvatar = within(members).getByRole('img', { name: 'Anna' });
    expect(annaAvatar).toHaveAttribute('src', 'data:image/png;base64,anna');
    expect(within(members).getByText('M')).toBeInTheDocument();
    expect(within(members).getByText('GI')).toBeInTheDocument();
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


describe('DisplayDashboard — home_header widget', () => {
  function fixedTime() {
    return new Date('2026-04-27T08:30:00');
  }

  function withHomeHeader(extra = {}, w = 1, h = 2, columns = 3, rows = 3) {
    return buildDashboard({
      ...extra,
      config: {
        display_mode: 'tablet',
        layout_preset: 'hearth',
        layout_config: {
          columns,
          rows,
          widgets: [
            { id: 'hdr', type: 'home_header', x: 0, y: 0, w, h },
          ],
        },
      },
    });
  }

  test('renders the family hearth name and a clock inside one widget', () => {
    renderWithFixedNow(withHomeHeader(), fixedTime());

    const header = screen.getByTestId('display-widget-home_header');
    expect(within(header).getByTestId('display-family-name')).toHaveTextContent('Mueller');
    expect(within(header).getByTestId('display-time').textContent).toMatch(/\d{1,2}:\d{2}/);
    // The standalone identity/clock widgets must NOT appear when only home_header is configured.
    expect(screen.queryByTestId('display-widget-identity')).not.toBeInTheDocument();
    expect(screen.queryByTestId('display-widget-clock')).not.toBeInTheDocument();
  });

  test('compact density (single-cell slot) shows only the time + date', () => {
    renderWithFixedNow(withHomeHeader({}, 1, 1, 4, 4), fixedTime());

    const header = screen.getByTestId('display-widget-home_header');
    expect(header).toHaveAttribute('data-density', 'compact');
    // Compact suppresses the family hearth name to keep the slot legible.
    expect(within(header).queryByTestId('display-family-name')).not.toBeInTheDocument();
    expect(within(header).getByTestId('display-time')).toBeInTheDocument();
    expect(within(header).getByTestId('display-date')).toBeInTheDocument();
    // Compact does NOT render the today event list.
    expect(within(header).queryByTestId('display-home-header-events')).not.toBeInTheDocument();
  });

  test('standard density shows title + time + date + a today count cue', () => {
    const today = new Date('2026-04-27T18:00:00');
    const dashboard = {
      ...withHomeHeader({
        next_events: [
          { title: 'Soccer', starts_at: isoLocal(today), ends_at: null, all_day: false, color: null, category: null },
          { title: 'Dinner', starts_at: isoLocal(new Date('2026-04-27T20:00:00')), ends_at: null, all_day: false, color: null, category: null },
        ],
      }, 1, 2, 4, 4),
    };
    renderWithFixedNow(dashboard, fixedTime());

    const header = screen.getByTestId('display-widget-home_header');
    expect(header).toHaveAttribute('data-density', 'standard');
    expect(within(header).getByTestId('display-family-name')).toHaveTextContent('Mueller');
    expect(within(header).getByTestId('display-time').textContent).toMatch(/\d{1,2}:\d{2}/);
    // Today cue is the count, not a full event list.
    const cue = within(header).getByTestId('display-home-header-today-cue');
    expect(cue).toHaveTextContent(/2/);
    expect(within(header).queryByTestId('display-home-header-events')).not.toBeInTheDocument();
  });

  test('expanded density shows the next-up event list inside the header', () => {
    const dashboard = withHomeHeader({
      next_events: [
        { title: 'Soccer practice', starts_at: isoLocal(new Date('2026-04-27T18:00:00')), ends_at: null, all_day: false, color: null, category: null },
        { title: 'Dentist', starts_at: isoLocal(new Date('2026-04-28T09:00:00')), ends_at: null, all_day: false, color: null, category: null },
      ],
    }, 2, 3, 4, 4);
    renderWithFixedNow(dashboard, fixedTime());

    const header = screen.getByTestId('display-widget-home_header');
    expect(header).toHaveAttribute('data-density', 'expanded');
    const events = within(header).getByTestId('display-home-header-events');
    expect(within(events).getByText('Soccer practice')).toBeInTheDocument();
    expect(within(events).getByText('Dentist')).toBeInTheDocument();
  });

  test('expanded density with no events shows a quiet message', () => {
    renderWithFixedNow(withHomeHeader({ next_events: [] }, 2, 3, 4, 4), fixedTime());

    const header = screen.getByTestId('display-widget-home_header');
    expect(header).toHaveAttribute('data-density', 'expanded');
    const events = within(header).getByTestId('display-home-header-events');
    expect(events).toHaveTextContent(/no events/i);
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


describe('DisplayDashboard — school timetables', () => {
  test('renders today school timetable groups without account identifiers', () => {
    renderWithFixedNow(
      buildDashboard({
        today_school_timetables: [
          {
            name: 'Twins timetable',
            class_label: '4b',
            children: [
              { display_name: 'Anna', color: '#7c3aed', profile_image: null },
              { display_name: 'Mia', color: '#f43f5e', profile_image: null },
            ],
            lessons: [
              { period_label: '1', start_time: '08:00:00', end_time: '08:45:00', kind: 'lesson', subject: 'Math' },
              { period_label: 'Break', start_time: '08:45:00', end_time: '09:00:00', kind: 'break', break_label: 'Big break' },
            ],
          },
        ],
      }),
      new Date('2026-04-27T08:00:00')
    );

    const school = screen.getByTestId('display-school-today');
    expect(school).toHaveTextContent('Twins timetable');
    expect(school).toHaveTextContent('4b');
    expect(school).toHaveTextContent('Anna');
    expect(school).toHaveTextContent('Mia');
    expect(school).toHaveTextContent('Math');
    expect(school).toHaveTextContent('Big break');
    expect(document.body).not.toHaveTextContent(/@example\.com/);
    expect(document.body).not.toHaveTextContent(/user_id/i);
  });

  test('uses the display payload period label when a break has no custom label', () => {
    renderWithFixedNow(
      buildDashboard({
        today_school_timetables: [
          {
            name: 'German timetable',
            class_label: '4b',
            children: [{ display_name: 'Mia', color: '#f43f5e', profile_image: null }],
            lessons: [
              { period_label: 'Pause', start_time: '08:45:00', end_time: '09:00:00', kind: 'break', break_label: null },
            ],
          },
        ],
      }),
      new Date('2026-04-27T08:00:00')
    );

    const school = screen.getByTestId('display-school-today');
    expect(school).toHaveTextContent('Pause');
    expect(school).not.toHaveTextContent('Break');
  });
});
