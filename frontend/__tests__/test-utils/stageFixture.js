// Stage payload around Tuesday 2026-09-29 (backend emits naive local wall times).
const D = (day, hm) => `2026-09-${String(day).padStart(2, '0')}T${hm}:00`;
const ev = (title, day, from, to, refs, extra = {}) => ({
  title, starts_at: D(day, from), ends_at: to ? D(day, to) : null, all_day: false, occurrence_date: null,
  color: null, category: null, icon: null, participant_colors: [], member_refs: refs, location: null, ...extra,
});

export function buildStagePayload(overrides = {}) {
  return {
    family_id: 7,
    family_name: 'Familie Berger',
    device_name: 'Kitchen',
    members: [
      { display_name: 'Anna', color: '#5b93c7', profile_image: null },
      { display_name: 'Leo', color: '#c9953d', profile_image: null },
      { display_name: 'Mia', color: '#c26f80', profile_image: null },
    ],
    next_events: [],
    upcoming_birthdays: [{ person_name: 'Oma Gisela', occurs_on: '2026-10-03', days_until: 4 }],
    open_tasks: [],
    today_school_timetables: [],
    tomorrow_school_timetables: [],
    generated_at: '2026-09-29T07:10:00',
    time_format: '24h',
    today_events: [
      ev('School', 29, '07:45', '13:15', [2], { location: 'Park School' }),
      ev('Work', 29, '08:30', '16:30', [0]),
      ev('Swimming', 29, '15:00', '16:45', [2]),
    ],
    tomorrow_events: [ev('Zoo trip', 30, '07:15', '14:00', [1], { location: 'Kindergarten' })],
    week_events: [],
    meals: [{ plan_date: '2026-09-29', slot: 'evening', meal_name: 'Pumpkin soup' }],
    shopping: { open_count: 2, lists: [{ name: 'Weekly', open_count: 2, items: ['Milk', 'Bread'] }] },
    routines: [{ title: 'Brush teeth', done: true, member_ref: 2 }, { title: 'Pack bag', done: false, member_ref: 2 }],
    due_tasks: [{ title: 'Bins out', priority: 'normal', due_date: D(29, '20:00'), participant_colors: [], member_ref: 0, due_state: 'today' }],
    rewards: null,
    countdowns: [],
    weather: null,
    config: { display_mode: 'tablet', refresh_interval_seconds: 60, layout_preset: 'stage', layout_config: { version: 2 } },
    ...overrides,
  };
}

export const t = (key) => key;
