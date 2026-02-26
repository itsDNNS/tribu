export const COLOR_PALETTE = [
  '#7c3aed', '#f43f5e', '#06b6d4',
  '#f59e0b', '#10b981', '#ec4899',
  '#3b82f6', '#ef4444', '#8b5cf6',
  '#14b8a6', '#f97316', '#6366f1',
];

export const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

export function getMemberColor(member, index) {
  if (member?.color) return member.color;
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}
