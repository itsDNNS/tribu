import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import StageDisplay from '../../../components/display/StageDisplay';
import { buildStagePayload, t } from '../../test-utils/stageFixture';

function renderAt(isoLocal, payload = buildStagePayload()) {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(isoLocal));
  let utils;
  act(() => {
    utils = render(<StageDisplay me={{ name: 'Kitchen' }} dashboard={payload} t={t} locale="en-GB" />);
  });
  return utils;
}

// jsdom has no PointerEvent; swipes need real coordinates.
beforeAll(() => {
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, params = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 1;
      }
    };
  }
});

afterEach(() => {
  jest.useRealTimers();
});

// Advance in small steps so timers re-armed by React renders fire as in a browser.
function advance(ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    act(() => { jest.advanceTimersByTime(Math.min(1000, ms - elapsed)); });
  }
}

test('morning stage shows clock, greeting, next event and today lanes without identifiers', () => {
  const { container } = renderAt('2026-09-29T07:12:00');
  const stage = screen.getByTestId('display-dashboard');
  expect(stage).toHaveAttribute('data-layout-preset', 'stage');
  expect(stage).toHaveAttribute('data-day-part', 'morning');
  expect(stage).not.toHaveClass('stage--dark');
  expect(screen.getByTestId('display-time')).toHaveTextContent('07:12');
  expect(screen.getByTestId('display-family-name')).toHaveTextContent('display.stage.greeting_morning, Familie Berger');

  const hero = screen.getByTestId('display-focus');
  expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent('School');
  expect(hero).toHaveTextContent('Park School');
  expect(within(hero).getByTestId('display-event-participants')).toHaveAttribute('aria-label', 'display.stage.participants');

  const lanes = screen.getByTestId('display-events');
  expect(lanes).toHaveTextContent('display.stage.timeline_today');
  expect(lanes).toHaveTextContent('Swimming');
  expect(container.textContent).not.toMatch(/@|user_id/);
});

test('evening looks ahead at tomorrow in the dark palette', () => {
  renderAt('2026-09-29T19:40:00');
  const stage = screen.getByTestId('display-dashboard');
  expect(stage).toHaveAttribute('data-day-part', 'evening');
  expect(stage).toHaveClass('stage--dark');
  expect(within(screen.getByTestId('display-focus')).getByRole('heading', { level: 1 })).toHaveTextContent('Zoo trip');
  expect(screen.getByTestId('display-focus')).toHaveTextContent('display.stage.tomorrow_morning');
  expect(screen.getByTestId('display-events')).toHaveTextContent('display.stage.timeline_tomorrow');
  expect(screen.getByTestId('display-events')).toHaveTextContent('Zoo trip');
});

test('zones rotate on their own staggered rhythm and skip empty cards', () => {
  renderAt('2026-09-29T07:12:00');
  const zoneA = screen.getByTestId('display-zone-a');
  // Weather is empty in this payload, so zone A alternates dinner and shopping only.
  const seen = new Set([zoneA.dataset.card]);
  const zoneB = screen.getByTestId('display-zone-b');
  const startB = zoneB.dataset.card;
  advance(61 * 1000);
  seen.add(screen.getByTestId('display-zone-a').dataset.card);
  expect(seen).toEqual(new Set(['dinner', 'shopping']));
  expect(screen.getByTestId('display-zone-b').dataset.card).toBe(startB); // reminders only: school is empty
  expect(screen.getByTestId('display-zone-a').querySelectorAll('.stage-dots i')).toHaveLength(2);
});

test('touching a zone holds its card for a minute', () => {
  renderAt('2026-09-29T07:12:00');
  const zone = screen.getByTestId('display-zone-d');
  const held = zone.dataset.card;
  fireEvent.pointerDown(zone, { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(zone, { clientX: 12, clientY: 10 });
  expect(screen.getByTestId('display-zone-d')).toHaveAttribute('data-paused', 'true');
  advance(45 * 1000);
  expect(screen.getByTestId('display-zone-d').dataset.card).toBe(held);
  advance(30 * 1000);
  expect(screen.getByTestId('display-zone-d')).not.toHaveAttribute('data-paused');
});

test('swiping moves a zone to the next card', () => {
  renderAt('2026-09-29T07:12:00');
  const zone = screen.getByTestId('display-zone-d');
  const before = zone.dataset.card;
  fireEvent.pointerDown(zone, { clientX: 300, clientY: 10 });
  fireEvent.pointerUp(zone, { clientX: 100, clientY: 14 });
  expect(screen.getByTestId('display-zone-d').dataset.card).not.toBe(before);
});

test('e-ink renders monochrome without progress bars and shows the update time', () => {
  const payload = buildStagePayload({
    config: { display_mode: 'eink', refresh_interval_seconds: 600, layout_preset: 'stage', layout_config: { version: 2, eink_format: 'large' } },
  });
  const { container } = renderAt('2026-09-29T07:12:00', payload);
  const stage = screen.getByTestId('display-dashboard');
  expect(stage).toHaveAttribute('data-display-mode', 'eink');
  expect(stage).toHaveAttribute('data-eink-format', 'large');
  expect(container.querySelector('.stage-progress')).toBeNull();
  expect(screen.getByText('display.stage.updated')).toBeInTheDocument();
});

test('night dims the display when enabled', () => {
  const { container } = renderAt('2026-09-29T23:10:00');
  expect(screen.getByTestId('display-dashboard')).toHaveAttribute('data-day-part', 'night');
  expect(container.querySelector('.stage-night-veil')).not.toBeNull();
});
