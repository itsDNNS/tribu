import { Inbox, ListChecks, Send, ShoppingCart, X } from 'lucide-react';
import { useState } from 'react';
import { apiCreateQuickCapture, apiConvertQuickCapture, apiDismissQuickCapture } from '../lib/api';
import { t } from '../lib/i18n';

export default function QuickCaptureCard({
  familyId,
  inbox = [],
  messages,
  loadQuickCaptureInbox,
  loadTasks,
  loadShoppingLists,
  loadActivity,
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [triagingId, setTriagingId] = useState(null);

  const canSubmit = text.trim().length > 0 && !busy && familyId;

  async function refresh(destination) {
    await Promise.allSettled([
      loadQuickCaptureInbox?.(familyId),
      destination === 'task' ? loadTasks?.(familyId) : Promise.resolve(),
      destination === 'shopping' ? loadShoppingLists?.(familyId) : Promise.resolve(),
      destination !== 'inbox' ? loadActivity?.(familyId) : Promise.resolve(),
    ]);
  }

  async function capture(destination) {
    if (!canSubmit) return;
    const captured = text.trim();
    setBusy(true);
    try {
      const result = await apiCreateQuickCapture({ family_id: familyId, text: captured, destination });
      if (result.ok) {
        setText('');
        await refresh(destination);
      }
    } finally {
      setBusy(false);
    }
  }

  async function convertItem(itemId, destination) {
    setTriagingId(itemId);
    try {
      const result = await apiConvertQuickCapture(itemId, { destination });
      if (result.ok) await refresh(destination);
    } finally {
      setTriagingId(null);
    }
  }

  async function dismissItem(itemId) {
    setTriagingId(itemId);
    try {
      const result = await apiDismissQuickCapture(itemId);
      if (result.ok) await refresh('inbox');
    } finally {
      setTriagingId(null);
    }
  }

  const inboxItems = Array.isArray(inbox) ? inbox : [];
  const openItems = inboxItems.slice(0, 3);

  return (
    <section className="bento-card bento-quick-capture" role="region" aria-label={t(messages, 'module.dashboard.quick_capture_title')}>
      <div className="bento-card-header quick-capture-header">
        <div>
          <h2 className="bento-card-title"><Send size={16} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_capture_title')}</h2>
          <p className="quick-capture-subtitle">{t(messages, 'module.dashboard.quick_capture_subtitle')}</p>
        </div>
        <span className="quick-capture-count" aria-label={t(messages, 'module.dashboard.quick_capture_inbox_count').replace('{count}', inboxItems.length)}>
          <Inbox size={14} aria-hidden="true" /> {inboxItems.length}
        </span>
      </div>

      <div className="quick-capture-form">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t(messages, 'module.dashboard.quick_capture_placeholder')}
          rows={3}
          maxLength={240}
          className="quick-capture-input"
        />
        <div className="quick-capture-actions">
          <button type="button" className="btn-sm quick-capture-primary" onClick={() => capture('inbox')} disabled={!canSubmit}>
            <Inbox size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_capture_save_inbox')}
          </button>
          <button type="button" className="btn-sm" onClick={() => capture('task')} disabled={!canSubmit}>
            <ListChecks size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_capture_add_task')}
          </button>
          <button type="button" className="btn-sm" onClick={() => capture('shopping')} disabled={!canSubmit}>
            <ShoppingCart size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_capture_add_shopping')}
          </button>
        </div>
      </div>

      <div className="quick-capture-inbox">
        <div className="quick-capture-inbox-title">{t(messages, 'module.dashboard.quick_capture_inbox_title')}</div>
        {openItems.length === 0 ? (
          <div className="bento-empty quick-capture-empty">{t(messages, 'module.dashboard.quick_capture_inbox_empty')}</div>
        ) : openItems.map((item) => (
          <div key={item.id} className="quick-capture-item">
            <div className="quick-capture-item-text">{item.text}</div>
            <div className="quick-capture-item-actions">
              <button type="button" className="quick-capture-mini" onClick={() => convertItem(item.id, 'task')} disabled={triagingId === item.id}>
                {t(messages, 'module.dashboard.quick_capture_to_task')}
              </button>
              <button type="button" className="quick-capture-mini" onClick={() => convertItem(item.id, 'shopping')} disabled={triagingId === item.id}>
                {t(messages, 'module.dashboard.quick_capture_to_shopping')}
              </button>
              <button type="button" className="quick-capture-mini quick-capture-dismiss" onClick={() => dismissItem(item.id)} disabled={triagingId === item.id}>
                <X size={13} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_capture_dismiss')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
