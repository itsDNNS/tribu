import { getMemberColor } from '../lib/member-colors';

/**
 * @typedef {{
 *   display_name?: string | null,
 *   profile_image?: string | null,
 *   color?: string | null,
 * }} MemberAvatarMember
 *
 * @typedef {{
 *   member: MemberAvatarMember | null | undefined,
 *   index?: number,
 *   size?: number,
 * }} MemberAvatarProps
 *
 * Unified member avatar component.
 * Shows profile image if available, falls back to colored circle with initials.
 *
 * @param {MemberAvatarProps} props
 */
export default function MemberAvatar({ member, index = 0, size = 28 }) {
  if (!member) return null;

  const initials = (member.display_name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (member.profile_image) {
    return (
      <img
        src={member.profile_image}
        alt={member.display_name || ''}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      title={member.display_name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        fontSize: size * 0.38,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: getMemberColor(member, index),
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
