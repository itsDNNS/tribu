export const CALENDAR_EVENT_ICON_OPTIONS = [
  { key: 'handball', label: 'Handball training', emoji: '🤾' },
  { key: 'gymnastics', label: 'Gymnastics', emoji: '🤸' },
  { key: 'soccer', label: 'Soccer training', emoji: '⚽' },
  { key: 'dentist', label: 'Dentist', emoji: '🦷' },
  { key: 'doctor', label: 'Doctor', emoji: '🩺' },
  { key: 'school', label: 'School', emoji: '🎒' },
  { key: 'daycare', label: 'Kindergarten / daycare', emoji: '🧸' },
  { key: 'swimming', label: 'Swimming', emoji: '🏊' },
  { key: 'music', label: 'Music lesson', emoji: '🎵' },
  { key: 'birthday', label: 'Birthday', emoji: '🎂' },
  { key: 'shopping', label: 'Shopping / errands', emoji: '🛒' },
  { key: 'meal', label: 'Meal / restaurant', emoji: '🍽️' },
  { key: 'playdate', label: 'Playdate', emoji: '🧩' },
  { key: 'pickup', label: 'Pickup / drop-off', emoji: '🚗' },
  { key: 'vacation', label: 'Vacation / holiday', emoji: '🏖️' },
  { key: 'household', label: 'Household / chores', emoji: '🏠' },
  { key: 'homework', label: 'Homework / learning', emoji: '📚' },
  { key: 'pet', label: 'Pet / vet', emoji: '🐾' },
  { key: 'family_visit', label: 'Family visit', emoji: '👨‍👩‍👧‍👦' },
  { key: 'appointment', label: 'Appointment', emoji: '📌' },
];

const ICON_BY_KEY = new Map(CALENDAR_EVENT_ICON_OPTIONS.map((option) => [option.key, option]));

export function getCalendarEventIcon(key) {
  if (!key) return null;
  return ICON_BY_KEY.get(key) || null;
}
