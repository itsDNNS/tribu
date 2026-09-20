import { useState, useEffect, useCallback } from 'react';
import { Activity, Search } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import { adminText } from './adminHelpers';
import { parseServerInstant } from '../../lib/helpers';

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
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(false);
  const copy = key => adminText(messages, key);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(false);
    const { ok, data } = await api.apiGetAuditLog(familyId, 50, offset);
    if (ok) {
      setEntries((prev) => offset === 0 ? data.items : [...prev, ...data.items]);
      setTotal(data.total);
    } else setError(true);
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

  const visibleEntries = entries.filter(entry => {
    const category = entry.action.startsWith('invite_') ? 'invites' : 'members';
    return (filter === 'all' || filter === category) &&
      [formatAction(entry), entry.admin_display_name, entry.target_display_name, formatDetails(entry)]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });

  return (
    <div className="admin-subpage admin-subpage-audit">
      <div className="view-header adm-section-header admin-subpage-header">
        <div className="admin-subpage-title-block">
          <span className="admin-subpage-icon" aria-hidden="true">
            <Activity size={20} />
          </span>
          <div>
            <h2 className="view-title">{t(messages, 'audit_log_title')}</h2>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="ad-audit-filters"><label className="ad-search"><Search size={16}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={copy('audit_search')} aria-label={copy('audit_search')}/></label><select className="form-input" aria-label={copy('audit_filter')} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{copy('audit_all')}</option><option value="members">{copy('audit_members')}</option><option value="invites">{copy('audit_invites')}</option></select></div>
        {error && <p className="ad-error" role="alert">{copy('summary_unavailable')} <button className="ad-link" onClick={() => load(entries.length)}>{copy('retry')}</button></p>}
        {entries.length > 0 && !visibleEntries.length && <p className="ad-empty">{copy('audit_empty')}</p>}
        {entries.length === 0 && !loading && (
          <p className="adm-empty">{t(messages, 'audit_log_empty')}</p>
        )}
        {visibleEntries.map((e) => (
          <div key={e.id} className="audit-entry">
            <span className="audit-time">
              {parseServerInstant(e.created_at)?.toLocaleString()}
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
            className="btn-ghost adm-load-more"
            onClick={() => load(entries.length)}
            disabled={loading}
          >
            {t(messages, 'audit_log_load_more')}
          </button>
        )}
      </div>
    </div>
  );
}
