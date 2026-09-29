import { t } from '../i18n';

// One household activity entry as a sentence in the reader's language
// (Tribu 2.0, F4). Entries from before the server kept object_label, and
// unknown actions, fall back to the server's English summary.
export function activitySentence(entry, messages) {
  if (!entry) return '';
  const action = String(entry.action || '').replace(/\s+/g, '_');
  const key = `activity.${entry.object_type}.${action}`;
  if (!entry.object_label || !messages || !(key in messages)) return entry.summary || '';
  const name = entry.actor_display_name || t(messages, 'module.dashboard.activity_unknown_actor');
  return t(messages, key).replace('{name}', name).replace('{label}', entry.object_label);
}
