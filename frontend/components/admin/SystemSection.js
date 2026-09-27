import { useCallback, useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { parseServerInstant } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

function formatMegabytes(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function fill(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);
}

// Health of the Tribu server for the instance admin: unexpected restarts
// (for example after running out of memory), memory use and version.
export default function SystemSection() {
  const { messages } = useApp();
  const [status, setStatus] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { ok, data } = await api.apiGetSystemStatus();
    setFailed(!ok);
    if (ok) setStatus(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const memory = status?.rss_bytes
    ? status.limit_bytes
      ? fill(t(messages, 'system_memory_value'), { used: formatMegabytes(status.rss_bytes), limit: formatMegabytes(status.limit_bytes) })
      : fill(t(messages, 'system_memory_no_limit'), { used: formatMegabytes(status.rss_bytes) })
    : t(messages, 'system_memory_unknown');
  const memoryShare = status?.rss_bytes && status?.limit_bytes ? Math.min(1, status.rss_bytes / status.limit_bytes) : null;
  const crashed = status && status.crashes_last_week > 0;

  return (
    <div className="admin-subpage admin-subpage-system" data-testid="system-section">
      <div className="view-header adm-section-header admin-subpage-header">
        <div className="admin-subpage-title-block">
          <span className="admin-subpage-icon" aria-hidden="true">
            <HeartPulse size={20} />
          </span>
          <div>
            <h2 className="view-title">{t(messages, 'system_title')}</h2>
          </div>
        </div>
      </div>
      <p className="invite-intro">{t(messages, 'system_intro')}</p>

      {failed && <p className="backup-confidence-warning" role="alert">{t(messages, 'system_unavailable')}</p>}

      {status && (
        <div className="settings-section backup-confidence-panel">
          <div className="backup-confidence-grid">
            <div className={`backup-confidence-card${crashed ? ' system-card-alert' : ''}`} data-testid="system-crashes">
              <span>{t(messages, 'system_crashes')}</span>
              <strong>
                {crashed
                  ? fill(t(messages, 'system_crashes_value'), { day: status.crashes_last_day, week: status.crashes_last_week })
                  : t(messages, 'system_crashes_none')}
              </strong>
              {crashed && <small>{t(messages, 'system_crashes_hint')}</small>}
            </div>
            <div className="backup-confidence-card" data-testid="system-memory">
              <span>{t(messages, 'system_memory')}</span>
              <strong>{memory}</strong>
              {memoryShare !== null && (
                <span className="system-meter" aria-hidden="true">
                  <span style={{ width: `${Math.round(memoryShare * 100)}%` }} className={memoryShare > 0.8 ? 'high' : ''} />
                </span>
              )}
            </div>
            <div className="backup-confidence-card">
              <span>{t(messages, 'system_version')}</span>
              <strong>{status.version}</strong>
              {status.started_at && (
                <small>{fill(t(messages, 'system_running_since'), { time: parseServerInstant(status.started_at)?.toLocaleString() })}</small>
              )}
            </div>
          </div>
          {crashed && (
            <ul className="system-crash-list" data-testid="system-crash-list">
              {status.recent_crashes.map((crash) => (
                <li key={`${crash.started_at}-${crash.stopped_at}`}>
                  {fill(t(messages, 'system_crash_entry'), {
                    time: parseServerInstant(crash.stopped_at)?.toLocaleString(),
                    version: crash.version || '–',
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
