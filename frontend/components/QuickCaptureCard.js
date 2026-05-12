import { ListChecks, CalendarDays, ShoppingCart, Utensils, StickyNote, X } from 'lucide-react';
import { useState } from 'react';
import { apiCreateQuickCapture, apiConvertQuickCapture, apiDismissQuickCapture } from '../lib/api';
import { t } from '../lib/i18n';

export default function QuickCaptureCard({
  familyId,
  inbox = [],
  messages,
  setActiveView,
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

  function openView(view) {
    if (typeof setActiveView === 'function') setActiveView(view);
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
  const openItems = inboxItems.filter((item) => item && (!item.status || item.status === 'open'));
  const visibleOpenItems = openItems.slice(0, 3);
  const openItemCount = openItems.length;
  const cardClassName = openItemCount > 0
    ? 'bento-card bento-quick-capture has-quick-capture-inbox'
    : 'bento-card bento-quick-capture';

  return (
    <section className={cardClassName} role="region" aria-label={t(messages, 'module.dashboard.quick_capture_title')}>
      <div className="bento-card-header quick-capture-header">
        <h2 className="bento-card-title">{t(messages, 'module.dashboard.quick_capture_title')}</h2>
      </div>

      <div className="quick-capture-form quick-capture-form--command">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label={t(messages, 'module.dashboard.quick_capture_placeholder')}
          placeholder={t(messages, 'module.dashboard.quick_capture_placeholder')}
          rows={1}
          maxLength={240}
          className="quick-capture-input"
        />
        <div className="quick-capture-actions">
          <button type="button" className="btn-sm quick-capture-action-task" onClick={() => capture('task')} disabled={!canSubmit}>
            <ListChecks size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_capture_add_task')}
          </button>
          <button type="button" className="btn-sm quick-capture-action-event" onClick={() => openView('calendar')}>
            <CalendarDays size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_event')}
          </button>
          <button type="button" className="btn-sm quick-capture-action-shopping" onClick={() => capture('shopping')} disabled={!canSubmit}>
            <ShoppingCart size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_capture_add_shopping')}
          </button>
          <button type="button" className="btn-sm quick-capture-action-meal" onClick={() => openView('meal_plans')}>
            <Utensils size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_meal')}
          </button>
          <button type="button" className="btn-sm quick-capture-action-note" onClick={() => capture('inbox')} disabled={!canSubmit}>
            <StickyNote size={14} aria-hidden="true" /> {t(messages, 'module.dashboard.quick_note')}
          </button>
        </div>
      </div>

      {openItemCount > 0 ? <details className="quick-capture-inbox">
        <summary
          className="quick-capture-inbox-title"
          aria-label={t(messages, 'module.dashboard.quick_capture_inbox_count').replace('{count}', openItemCount)}
        >
          <span className="quick-capture-inbox-label">{t(messages, 'module.dashboard.quick_capture_inbox_title')}</span>
          <span
            className="quick-capture-inbox-summary"
            aria-hidden="true"
          >
            {openItemCount}
          </span>
        </summary>
        {visibleOpenItems.length === 0 ? (
          <div className="bento-empty quick-capture-empty">{t(messages, 'module.dashboard.quick_capture_inbox_empty')}</div>
        ) : visibleOpenItems.map((item) => (
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
      </details> : null}
    </section>
  );
}
