import { useId, useState } from 'react';
import { CalendarDays, Check, ListChecks, ShoppingCart, StickyNote, Utensils } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useQuickCapture } from '../../hooks/useQuickCapture';
import { t } from '../../lib/i18n';
import { plannerText } from './PlannerUI';
import BottomSheet from './BottomSheet';

const CREATE_ACTIONS = [
  ['event', CalendarDays, 'module.dashboard.quick_event', 'blue'],
  ['task', ListChecks, 'module.dashboard.quick_capture_add_task', 'green'],
  ['shopping', ShoppingCart, 'module.dashboard.quick_capture_add_shopping', 'purple'],
  ['meal', Utensils, 'module.dashboard.quick_meal', 'amber'],
];
const CAPTURE_DESTINATIONS = [
  ['task', ListChecks, 'module.dashboard.quick_capture_add_task'],
  ['shopping', ShoppingCart, 'module.dashboard.quick_capture_add_shopping'],
  ['inbox', StickyNote, 'module.dashboard.quick_note'],
];

export default function NewSheet({ onClose, onCreate }) {
  const app = useApp();
  const { messages, demoMode, familyId } = app;
  const { busy, capture } = useQuickCapture(app);
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null);
  const captureId = useId();
  const canSave = text.trim().length > 0 && !busy && familyId;

  const save = async (destination) => {
    if (!canSave) return;
    setStatus(null);
    const ok = await capture(text.trim(), destination, () => setText('')).catch(() => false);
    setStatus(ok ? 'saved' : 'error');
  };

  return (
    <BottomSheet title={plannerText(messages, 'capture_title')} messages={messages} onClose={onClose} className="ui-new-sheet">
      <div className="ui-bottom-sheet-grid">
        {CREATE_ACTIONS.map(([kind, Icon, labelKey, tone]) => (
          <button
            type="button"
            key={kind}
            className="ui-bottom-sheet-tile"
            onClick={() => {
              onClose();
              onCreate(kind);
            }}
          >
            <span className={`ui-bottom-sheet-icon tone-${tone}`}>
              <Icon size={22} aria-hidden="true" />
            </span>
            <strong>{t(messages, labelKey)}</strong>
          </button>
        ))}
      </div>

      {!demoMode && (
        <section className="ui-new-capture" aria-labelledby={`${captureId}-title`}>
          <h3 id={`${captureId}-title`}>{t(messages, 'module.dashboard.quick_capture_title')}</h3>
          <textarea
            value={text}
            rows={2}
            maxLength={240}
            enterKeyHint="done"
            placeholder={t(messages, 'module.dashboard.quick_capture_placeholder')}
            aria-label={t(messages, 'module.dashboard.quick_capture_placeholder')}
            onChange={(e) => {
              setText(e.target.value);
              if (status) setStatus(null);
            }}
          />
          <div className="ui-new-destinations" role="group" aria-labelledby={`${captureId}-save`}>
            <span id={`${captureId}-save`}>{plannerText(messages, 'save_as')}</span>
            {CAPTURE_DESTINATIONS.map(([destination, Icon, labelKey]) => (
              <button type="button" key={destination} disabled={!canSave} onClick={() => save(destination)}>
                <Icon size={15} aria-hidden="true" />
                {t(messages, labelKey)}
              </button>
            ))}
          </div>
          <p className={`ui-new-status${status === 'error' ? ' error' : ''}`} role={status === 'error' ? 'alert' : 'status'}>
            {status === 'saved' && (
              <>
                <Check size={14} aria-hidden="true" />
                {t(messages, 'toast.saved')}
              </>
            )}
            {status === 'error' && t(messages, 'toast.error')}
          </p>
        </section>
      )}
    </BottomSheet>
  );
}
