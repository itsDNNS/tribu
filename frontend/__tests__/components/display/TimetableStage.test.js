import { act, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimetableStage from '../../../components/display/TimetableStage';
import { buildStagePayload, t } from '../../test-utils/stageFixture';

const week = {
  name: 'Lena 4b',
  class_label: '4b',
  include_saturday: false,
  children: [{ display_name: 'Lena', color: '#c26f80', profile_image: null }],
  periods: [
    { position: 1, label: '1', start_time: '08:00:00', end_time: '08:45:00', kind: 'lesson', break_label: null },
    { position: 2, label: '2', start_time: '08:45:00', end_time: '09:00:00', kind: 'break', break_label: 'Recess' },
    { position: 3, label: '3', start_time: '09:00:00', end_time: '09:45:00', kind: 'lesson', break_label: null },
  ],
  lessons: [
    { weekday: 2, period_position: 1, subject: 'Maths', color: null },
    { weekday: 4, period_position: 3, subject: 'Art', color: null },
  ],
};

function renderAt(isoLocal, school_timetable = week, layout = {}) {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(isoLocal));
  const payload = buildStagePayload({
    config: { display_mode: 'tablet', refresh_interval_seconds: 60, layout_preset: 'stage', layout_config: { version: 2, arrangement: 'timetable', ...layout } },
  });
  let utils;
  act(() => {
    utils = render(<TimetableStage me={{ name: 'Kids room' }} dashboard={{ ...payload, school_weeks: school_timetable ? [school_timetable] : [] }} t={t} locale="en-GB" />);
  });
  return utils;
}

afterEach(() => jest.useRealTimers());

test('shows the whole week with today and the running period marked', () => {
  renderAt('2026-09-29T08:10:00'); // Tuesday, first period
  const grid = screen.getByRole('grid', { name: 'Lena 4b' });
  expect(within(grid).getAllByRole('columnheader')).toHaveLength(5);
  expect(within(grid).getByText('Maths').closest('[role=gridcell]')).toHaveClass('is-now');
  expect(within(grid).getByText('Art')).toBeInTheDocument();
  expect(within(grid).getByText('Recess')).toBeInTheDocument();
  expect(screen.getByTestId('display-dashboard')).toHaveAttribute('data-layout-preset', 'timetable');
  expect(screen.getByText('4b')).toBeInTheDocument();
});

test('the weekend shows the week without a running period', () => {
  renderAt('2026-10-03T10:00:00');
  expect(document.querySelector('.is-now')).toBeNull();
  expect(document.querySelector('.stage-tt-day.is-today')).toBeNull();
});

test('a family without a timetable gets a hint', () => {
  renderAt('2026-09-29T08:10:00', null);
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  expect(screen.getByText('display.timetable.empty')).toBeInTheDocument();
});

test('follows the theme like the family stage', () => {
  renderAt('2026-09-29T10:00:00', week, { theme_mode: 'dark' });
  expect(screen.getByTestId('display-dashboard')).toHaveClass('stage--dark');
});
