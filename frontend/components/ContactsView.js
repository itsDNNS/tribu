import React from 'react';
import { UserPlus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';

const AVATAR_COLORS = [
  'var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)',
  'var(--success)', 'var(--sapphire)', 'var(--warning)',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ContactsView() {
  const { contacts, messages, demoMode, setActiveView, isChild } = useApp();

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'contacts')}</h1>
          <div className="view-subtitle">{contacts.length} {t(messages, 'contacts')}</div>
        </div>
      </div>

      <div className="contacts-grid stagger">
        {contacts.length > 0 ? (
          Array.from(
            [...contacts].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de')).reduce((map, c) => {
              const letter = (c.full_name || '?')[0].toUpperCase();
              if (!map.has(letter)) map.set(letter, []);
              map.get(letter).push(c);
              return map;
            }, new Map())
          ).map(([letter, group]) => (
            <React.Fragment key={letter}>
              <div className="contacts-section-letter">{letter}</div>
              {group.map((c) => {
                const initials = (c.full_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <div key={c.id} className="contact-card glass-sm">
                    <div className="contact-avatar" style={{ background: getAvatarColor(c.full_name) }}>
                      {initials}
                    </div>
                    <div className="contact-info">
                      <div className="contact-name">{c.full_name}</div>
                      {(c.email || c.phone) && (
                        <div className="contact-detail">{c.email || c.phone}</div>
                      )}
                      {c.birthday_month && c.birthday_day && (
                        <div className="contact-birthday">
                          🎂 {c.birthday_day}.{c.birthday_month}.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))
        ) : (
          <div className="glass-sm" style={{ padding: 'var(--space-xl)', textAlign: 'center', gridColumn: '1 / -1' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{t(messages, 'module.contacts.no_contacts')}</div>
            {!demoMode && !isChild && (
              <button className="btn-ghost" style={{ marginTop: 'var(--space-md)' }} onClick={() => setActiveView('settings')}>
                <UserPlus size={15} /> {t(messages, 'module.contacts.import_cta')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
