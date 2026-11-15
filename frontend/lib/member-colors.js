import { t } from './i18n';

export const COLOR_PALETTE = [
  '#7c3aed', '#f43f5e', '#06b6d4',
  '#f59e0b', '#10b981', '#ec4899',
  '#3b82f6', '#ef4444', '#8b5cf6',
  '#14b8a6', '#f97316', '#6366f1',
];

// Spoken names for the member palette and the calendar event colours (EventEditor).
const COLOR_NAMES = {
  '#7c3aed': 'violet', '#f43f5e': 'rose', '#06b6d4': 'cyan',
  '#f59e0b': 'amber', '#10b981': 'green', '#ec4899': 'pink',
  '#3b82f6': 'blue', '#ef4444': 'red', '#8b5cf6': 'lavender',
  '#14b8a6': 'teal', '#f97316': 'orange', '#6366f1': 'indigo',
  '#79529e': 'purple', '#759c5d': 'green', '#d8a245': 'yellow',
  '#71a4dc': 'blue', '#b98aa1': 'pink', '#d67e70': 'coral',
};

export function colorName(color, messages) {
  const name = COLOR_NAMES[String(color).toLowerCase()];
  return name ? t(messages, `color.${name}`) : color;
}

const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

export function getMemberColor(member, index) {
  if (member?.color) return member.color;
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}
