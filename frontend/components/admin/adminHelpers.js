import { parseServerInstant } from "../../lib/helpers";
import { t } from "../../lib/i18n";

export const adminText = (messages, key) => t(messages, `admin_layout_${key}`);

export function invitationState(invitation, now = new Date()) {
  if (invitation.revoked) return "revoked";
  const expires = parseServerInstant(invitation.expires_at);
  if (!expires || expires <= now) return "expired";
  if (invitation.max_uses && invitation.use_count >= invitation.max_uses)
    return "used";
  return "active";
}

export function auditAction(messages, action) {
  return t(messages, `audit_action_${action}`, action);
}
