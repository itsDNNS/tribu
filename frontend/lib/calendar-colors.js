import { getMemberColor } from './member-colors';

export const DEFAULT_CALENDAR_COLOR = '#79529e';

// An explicit event color is an override. Otherwise resolve current member
// colors at render time, so profile changes also update existing events.
export function calendarEventColors(event, members = []) {
  if (event.color) return [event.color];
  const assigned = Array.isArray(event.assigned_to)
    ? event.assigned_to.map(String)
    : [];
  const colors = members.flatMap((member, index) =>
    event.assigned_to === 'all' || assigned.includes(String(member.user_id))
      ? [getMemberColor(member, index)]
      : [],
  );
  return colors.length ? [...new Set(colors)] : [DEFAULT_CALENDAR_COLOR];
}

export function calendarEventStyle(event, members) {
  const colors = calendarEventColors(event, members);
  const stops = colors
    .map(
      (color, index) =>
        `${color} ${(index * 100) / colors.length}% ${((index + 1) * 100) / colors.length}%`,
    )
    .join(', ');
  const tints = colors.map(
    (color) => `color-mix(in srgb, ${color} 10%, var(--tc-surface))`,
  );
  if (tints.length === 1) tints.push(tints[0]);
  return {
    '--event-color': colors[0],
    '--event-stripe': `linear-gradient(to bottom, ${stops})`,
    '--event-tint': `linear-gradient(to right, ${tints.join(', ')})`,
  };
}
