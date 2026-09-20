import { useEffect, useRef } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { t } from '../../lib/i18n';

export default function CalendarDialog({ title, messages, children, actions, onClose, busy = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('input:not([type=hidden]),textarea')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className="tribu-calendar-dialog" aria-labelledby="calendar-dialog-title" aria-busy={busy || undefined}
    onCancel={e => { e.preventDefault(); if (!busy) closeRef.current(); }}
    onClick={e => {
      if (e.target !== e.currentTarget || busy) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeRef.current();
    }}>
    <header className="tc-modal-header"><span className="tc-modal-badge"><CalendarDays size={23} strokeWidth={1.6} /></span><div><h2 id="calendar-dialog-title">{title}</h2><p>{t(messages, 'module.calendar.mockup.modal_subtitle')}</p></div><button type="button" className="tc-icon bare" aria-label={t(messages, 'close')} disabled={busy} onClick={onClose}><X size={16} /></button></header>
    <div className="tc-modal-body">{children}</div>
    {actions && <footer className="tc-modal-actions">{actions}</footer>}
  </dialog>;
}
