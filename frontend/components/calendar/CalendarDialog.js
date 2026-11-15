import { useEffect, useRef } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { t } from '../../lib/i18n';
import ModalDialog from '../ModalDialog';

export default function CalendarDialog({
  title,
  messages,
  children,
  actions,
  onClose,
  busy = false,
  subtitle,
  icon: Icon = CalendarDays,
  className = '',
}) {
  const ref = useRef(null);
  useEffect(() => {
    // Skip regions marked data-no-autofocus (e.g. long settings forms) so the dialog opens at the top.
    [...ref.current.querySelectorAll('input:not([type=hidden]),textarea')]
      .find((field) => !field.closest('[data-no-autofocus]'))
      ?.focus();
  }, []);
  return (
    <ModalDialog
      className={`tribu-calendar-dialog ${className}`}
      aria-labelledby="calendar-dialog-title"
      aria-busy={busy || undefined}
      busy={busy}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key !== 'Tab' || !e.currentTarget.contains(e.target)) return;
        const focusable = [
          ...e.currentTarget.querySelectorAll(
            'button,input,select,textarea,a[href],[tabindex]',
          ),
        ].filter(
          (el) =>
            !el.disabled && el.tabIndex >= 0 && el.getClientRects().length,
        );
        const first = focusable[0],
          last = focusable.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <header className="tc-modal-header">
        <span className="tc-modal-badge">
          <Icon size={23} strokeWidth={1.6} />
        </span>
        <div>
          <h2 id="calendar-dialog-title">{title}</h2>
          {subtitle !== null && (
            <p>
              {subtitle ?? t(messages, 'module.calendar.mockup.modal_subtitle')}
            </p>
          )}
        </div>
        <button
          type="button"
          className="tc-icon bare"
          aria-label={t(messages, 'close')}
          disabled={busy}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div ref={ref} className="tc-modal-body">{children}</div>
      {actions && <footer className="tc-modal-actions">{actions}</footer>}
    </ModalDialog>
  );
}
