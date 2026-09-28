import { useId, useMemo, useState } from 'react';
import { CalendarDays, Check, ListChecks, Repeat, ShoppingCart, StickyNote, Utensils } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCaptureCreate } from '../../hooks/useCaptureCreate';
import { useToast } from '../../contexts/ToastContext';
import { parseCapture } from '../../lib/capture/parseCapture';
import { localeForLang, weekStartIndex } from '../../lib/dates';
import { t } from '../../lib/i18n';
import { catalogProduct } from '../shopping/catalog';
import { plannerText } from './PlannerUI';
import BottomSheet from './BottomSheet';

// What a recognised entry can become, and the forms that open directly.
const KINDS = [
  ['event', CalendarDays, 'module.dashboard.quick_event', 'blue'],
  ['task', ListChecks, 'module.dashboard.quick_capture_add_task', 'green'],
  ['shopping', ShoppingCart, 'module.dashboard.quick_capture_add_shopping', 'purple'],
  ['note', StickyNote, 'module.dashboard.quick_note', 'amber'],
];
const FORMS = [
  ['event', CalendarDays, 'module.dashboard.quick_event'],
  ['task', ListChecks, 'module.dashboard.quick_capture_add_task'],
  ['shopping', ShoppingCart, 'module.dashboard.quick_capture_add_shopping'],
  ['meal', Utensils, 'module.dashboard.quick_meal'],
];

function entryMeta(entry, { lang, members, messages }) {
  const parts = [];
  if (entry.date) {
    const [year, month, day] = entry.date.split('-').map(Number);
    parts.push(new Date(year, month - 1, day).toLocaleDateString(localeForLang(lang), { weekday: 'short', day: 'numeric', month: 'numeric' }));
  }
  if (entry.kind === 'event') {
    parts.push(entry.time ? `${entry.time}–${entry.endTime}` : t(messages, 'module.capture.all_day'));
  }
  const names = entry.assignees
    .map((id) => members.find((member) => member.user_id === id)?.display_name?.split(' ')[0])
    .filter(Boolean);
  if (names.length) parts.push(names.join(', '));
  if (entry.spec) parts.push(entry.spec);
  return parts.join(' · ');
}

// "+" (Tribu 2.0): one field that understands "Tomorrow 3 pm dentist Max",
// "2 kg apples" or several lines, shows what it will create and creates it.
// The forms stay one tap away.
export default function NewSheet({ onClose, onCreate, defaultKind = 'task' }) {
  const app = useApp();
  const { messages, demoMode, familyId, lang, members = [], weekStart } = app;
  const toast = useToast();
  const { busy, create } = useCaptureCreate(app);
  const [text, setText] = useState('');
  const [kinds, setKinds] = useState({});
  const [error, setError] = useState('');
  const captureId = useId();

  const entries = useMemo(() => parseCapture(text, {
    now: new Date(),
    lang,
    members,
    firstWeekday: weekStartIndex(weekStart),
    isProduct: (name) => Boolean(catalogProduct(name)),
    defaultKind,
  }).map((entry, index) => ({ ...entry, kind: kinds[index] || entry.kind })), [text, lang, members, weekStart, defaultKind, kinds]);

  const canCreate = entries.length > 0 && !busy && familyId;

  const submit = async () => {
    if (!canCreate) return;
    setError('');
    const { created, failed } = await create(entries);
    if (failed.length) {
      setText(failed.map((entry) => entry.text).join('\n'));
      setKinds({});
      setError(t(messages, 'module.capture.partial').replace('{count}', failed.length));
      return;
    }
    toast.success(created === 1
      ? t(messages, 'module.capture.created')
      : t(messages, 'module.capture.created_count').replace('{count}', created));
    onClose();
  };

  return (
    <BottomSheet title={plannerText(messages, 'capture_title')} messages={messages} onClose={onClose} className="ui-new-sheet">
      {!demoMode && (
        <section className="capture" aria-labelledby={`${captureId}-title`}>
          <h3 id={`${captureId}-title`} className="sr-only">{t(messages, 'module.dashboard.quick_capture_title')}</h3>
          <textarea
            className="capture-input"
            value={text}
            rows={2}
            maxLength={1000}
            placeholder={t(messages, 'module.capture.placeholder')}
            aria-label={t(messages, 'module.dashboard.quick_capture_title')}
            onChange={(event) => {
              setText(event.target.value);
              setKinds({});
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {entries.length > 0 && (
            <ul className="capture-entries" aria-live="polite">
              {entries.map((entry, index) => {
                const Icon = KINDS.find(([kind]) => kind === entry.kind)?.[1] || ListChecks;
                const meta = entryMeta(entry, { lang, members, messages });
                return (
                  <li key={`${index}-${entry.text}`} className="capture-entry">
                    <span className={`capture-entry-icon tone-${KINDS.find(([kind]) => kind === entry.kind)?.[3] || 'green'}`}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className="capture-entry-copy">
                      <strong>{entry.title}</strong>
                      {(meta || entry.recurrence) && (
                        <small>
                          {meta}
                          {entry.recurrence && (
                            <span className="capture-entry-repeat">
                              <Repeat size={12} aria-hidden="true" />
                              {t(messages, `module.tasks.recurrence.${entry.recurrence}`)}
                            </span>
                          )}
                        </small>
                      )}
                    </span>
                    <span className="capture-kinds" role="group" aria-label={t(messages, 'module.capture.kind_for').replace('{title}', entry.title)}>
                      {KINDS.map(([kind, KindIcon, labelKey]) => (
                        <button
                          key={kind}
                          type="button"
                          className={entry.kind === kind ? 'active' : ''}
                          aria-pressed={entry.kind === kind}
                          aria-label={t(messages, labelKey)}
                          title={t(messages, labelKey)}
                          onClick={() => setKinds((current) => ({ ...current, [index]: kind }))}
                        >
                          <KindIcon size={16} aria-hidden="true" />
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="capture-error" role="alert">{error}</p>}
          <button type="button" className="capture-submit" disabled={!canCreate} onClick={submit}>
            <Check size={16} aria-hidden="true" />
            {entries.length > 1
              ? t(messages, 'module.capture.create_count').replace('{count}', entries.length)
              : t(messages, 'module.capture.create')}
          </button>
        </section>
      )}

      <section className="capture-forms" aria-labelledby={`${captureId}-forms`}>
        <h3 id={`${captureId}-forms`}>{t(messages, 'module.capture.with_form')}</h3>
        <div className="capture-form-row">
          {FORMS.map(([kind, Icon, labelKey]) => (
            <button
              type="button"
              key={kind}
              onClick={() => {
                onClose();
                onCreate(kind);
              }}
            >
              <Icon size={16} aria-hidden="true" />
              {t(messages, labelKey)}
            </button>
          ))}
        </div>
      </section>
    </BottomSheet>
  );
}
