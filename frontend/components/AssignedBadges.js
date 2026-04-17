import MemberAvatar from './MemberAvatar';

export default function AssignedBadges({ assignedTo, members }) {
  if (!assignedTo) return null;

  let badgeMembers;
  if (assignedTo === 'all') {
    badgeMembers = members;
  } else if (Array.isArray(assignedTo)) {
    badgeMembers = members.filter((m) => assignedTo.includes(m.user_id));
  } else {
    return null;
  }
  if (badgeMembers.length === 0) return null;

  return (
    <div className="assigned-badges">
      {badgeMembers.map((m, i) => (
        <MemberAvatar key={m.user_id} member={m} index={i} size={20} />
      ))}
    </div>
  );
}
