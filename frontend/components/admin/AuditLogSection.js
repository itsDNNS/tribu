import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

const ACTION_KEYS = {
  member_created: 'audit_action_member_created',
  member_removed: 'audit_action_member_removed',
  password_reset: 'audit_action_password_reset',
  role_changed: 'audit_action_role_changed',
  adult_changed: 'audit_action_adult_changed',
  invite_created: 'audit_action_invite_created',
  invite_revoked: 'audit_action_invite_revoked',
  invite_used: 'audit_action_invite_used',
};

export default function AuditLogSection() {
  const { familyId, messages } = useApp();
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    const { ok, data } = await api.apiGetAuditLog(familyId, 50, offset);
    if (ok) {
      setEntries((prev) => offset === 0 ? data.items : [...prev, ...data.items]);
      setTotal(data.total);
    }
    setLoading(false);
  }, [familyId]);

  useEffect(() => { load(0); }, [load]);

  function formatAction(entry) {
    const key = ACTION_KEYS[entry.action] || entry.action;
    return t(messages, key);
  }

  function formatDetails(entry) {
    if (!entry.details) return null;
    if (entry.action === 'role_changed') return `${entry.details.old} → ${entry.details.new}`;
    if (entry.action === 'adult_changed') return entry.details.is_adult ? '→ adult' : '→ child';
    if (entry.action === 'member_created' && entry.details.email) return entry.details.email;
    if (entry.action === 'invite_created' && entry.details.role_preset) return `${entry.details.role_preset} (${entry.details.expires_in_days}d)`;
    if (entry.action === 'invite_used' && entry.details.email) return entry.details.email;
    return null;
  }

  return (
    <>
      <div className="view-header" style={{ marginTop: '2rem' }}>
        <div>
          <h1 className="view-title">{t(messages, 'audit_log_title')}</h1>
        </div>
      </div>

      <div className="settings-section">
        {entries.length === 0 && !loading && (
          <p style={{ opacity: 0.6 }}>{t(messages, 'audit_log_empty')}</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="audit-entry">
            <span className="audit-time">
              {new Date(e.created_at).toLocaleString()}
            </span>
            <span className="audit-action-badge">{formatAction(e)}</span>
            {e.target_display_name && (
              <span className="audit-target">→ {e.target_display_name}</span>
            )}
            {formatDetails(e) && (
              <span className="audit-details">{formatDetails(e)}</span>
            )}
            {e.admin_display_name && (
              <span className="audit-admin">{t(messages, 'audit_by')} {e.admin_display_name}</span>
            )}
          </div>
        ))}
        {entries.length < total && (
          <button
            className="btn-ghost"
            onClick={() => load(entries.length)}
            disabled={loading}
            style={{ marginTop: 'var(--space-sm)' }}
          >
            {t(messages, 'audit_log_load_more')}
          </button>
        )}
      </div>
    </>
  );
}
