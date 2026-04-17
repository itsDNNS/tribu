import { useState } from 'react';
import { Smartphone, Copy, Check, ExternalLink } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';

function buildDavUrl(email, familyId, kind) {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  const prefix = kind === 'calendar' ? 'cal' : 'book';
  const safeEmail = encodeURIComponent(email);
  return `${origin}/api/dav/${safeEmail}/${prefix}-${familyId}/`;
}

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sync-url-row">
      <div className="sync-url-label">{label}</div>
      <code className="sync-url-value">{value}</code>
      <button
        type="button"
        className="btn-sm sync-url-copy"
        onClick={() => {
          if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(value);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export default function PhoneSyncTab() {
  const { me, families, messages } = useApp();
  const email = me?.email || '';

  if (!email || !families.length) {
    return (
      <div className="settings-grid">
        <div className="settings-section">
          <div className="settings-section-title">
            <Smartphone size={16} />
            {t(messages, 'phone_sync_title')}
          </div>
          <p className="set-data-section-desc">{t(messages, 'phone_sync_empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title">
          <Smartphone size={16} />
          {t(messages, 'phone_sync_title')}
        </div>
        <p className="set-data-section-desc">{t(messages, 'phone_sync_intro')}</p>

        <div className="sync-section-heading">{t(messages, 'phone_sync_auth_heading')}</div>
        <p className="set-data-section-desc">{t(messages, 'phone_sync_auth_body')}</p>

        {families.map((f) => (
          <div key={f.family_id} className="sync-family-block">
            <div className="sync-family-title">{f.family_name}</div>
            <CopyRow
              label={t(messages, 'phone_sync_calendar_label')}
              value={buildDavUrl(email, f.family_id, 'calendar')}
            />
            <CopyRow
              label={t(messages, 'phone_sync_addressbook_label')}
              value={buildDavUrl(email, f.family_id, 'addressbook')}
            />
          </div>
        ))}

        <div className="sync-section-heading">{t(messages, 'phone_sync_ios_heading')}</div>
        <ol className="sync-steps">
          <li>{t(messages, 'phone_sync_ios_step1')}</li>
          <li>{t(messages, 'phone_sync_ios_step2')}</li>
          <li>{t(messages, 'phone_sync_ios_step3')}</li>
          <li>{t(messages, 'phone_sync_ios_step4')}</li>
        </ol>

        <div className="sync-section-heading">{t(messages, 'phone_sync_android_heading')}</div>
        <p className="set-data-section-desc">
          {t(messages, 'phone_sync_android_body')}
          {' '}
          <a
            className="sync-external-link"
            href="https://www.davx5.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            davx5.com <ExternalLink size={10} />
          </a>
        </p>
        <ol className="sync-steps">
          <li>{t(messages, 'phone_sync_android_step1')}</li>
          <li>{t(messages, 'phone_sync_android_step2')}</li>
          <li>{t(messages, 'phone_sync_android_step3')}</li>
        </ol>

        <div className="sync-section-heading">{t(messages, 'phone_sync_limits_heading')}</div>
        <ul className="sync-steps sync-limits">
          <li>{t(messages, 'phone_sync_limit_incremental')}</li>
          <li>{t(messages, 'phone_sync_limit_fields')}</li>
        </ul>
      </div>
    </div>
  );
}
