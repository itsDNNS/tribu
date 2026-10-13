import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Pause, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import * as api from '../lib/api';
import { localeForLang, startOfWeek, weekStartIndex } from '../lib/dates';
import { formatDutyTime, isoDate, orderedWeekdays, weekdayName } from '../lib/duties';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import ConfirmDialog from './ConfirmDialog';
import MemberAvatar from './MemberAvatar';
import BottomSheet from './responsive/BottomSheet';
import DutyDialog from './duties/DutyDialog';
import PauseDialog from './duties/PauseDialog';

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function Person({ userId, members, messages }) {
  const member = members.find((m) => m.user_id === userId);
  if (!member) return <span className="duty-person muted">{t(messages, 'module.duties.nobody')}</span>;
  return (
    <span className="duty-person">
      <MemberAvatar member={member} index={members.indexOf(member)} size={22} />
      {member.display_name}
    </span>
  );
}

export default function DutiesView() {
  const { familyId, members, messages, lang, isChild, weekStart, timeFormat, loadTasks } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const canEdit = !isChild;
  const locale = localeForLang(lang);
  const firstDay = weekStartIndex(weekStart);
  const [weekOf, setWeekOf] = useState(() => startOfWeek(new Date(), firstDay));
  const [duties, setDuties] = useState(null);
  const [week, setWeek] = useState([]);
  const [editing, setEditing] = useState(null);
  const [picking, setPicking] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [pausing, setPausing] = useState(null);
  const startIso = isoDate(weekOf);
  const todayIso = isoDate(new Date());
  const shownWeek = useRef(startIso);
  shownWeek.current = startIso;

  useEffect(() => { setWeekOf(startOfWeek(new Date(), firstDay)); }, [firstDay]);

  const reload = useCallback(async () => {
    if (!familyId) return;
    const [list, days] = await Promise.all([api.apiListDuties(familyId), api.apiGetDutyWeek(familyId, startIso)]);
    if (list.ok) setDuties(list.data);
    else toastError(t(messages, 'toast.error'));
    // Paging quickly can bring an earlier week's answer in last.
    if (days.ok && shownWeek.current === startIso) setWeek(days.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, startIso]);

  useEffect(() => { reload(); }, [reload]);

  const afterChange = async (res, doneKey) => {
    if (!res.ok) {
      toastError(errorText(res.data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    if (doneKey) toastSuccess(t(messages, doneKey));
    await reload();
    loadTasks();
  };

  // Ending a pause brings its tasks back at once, so it can be undone from the toast.
  const ending = useRef(false);
  const endPause = async (duty, pause) => {
    if (ending.current) return;
    ending.current = true;
    const res = await api.apiDeleteDutyPause(duty.id, pause.id);
    await afterChange(res);
    // Released only after the list reloaded, so the badge is gone before another tap.
    ending.current = false;
    if (!res.ok) return;
    let undone = false;
    toastSuccess(t(messages, 'module.duties.pause_ended'), {
      label: t(messages, 'module.shopping.undo'),
      onClick: async () => {
        if (undone) return;
        undone = true;
        afterChange(await api.apiCreateDutyPause(duty.id, { start: pause.start, end: pause.end }));
      },
    });
  };

  const choose = async (occ, change) => {
    setPicking(null);
    const res = change === 'reset'
      ? await api.apiResetDutyDate(occ.duty_id, occ.date)
      : await api.apiSetDutyDate(occ.duty_id, occ.date, change);
    afterChange(res, 'module.duties.date_saved');
  };

  const dayLabel = (date) => date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const pauseRange = (pause) => [pause.start, pause.end]
    .map((iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))
    .join(' – ');
  const shortDate = (date) => date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const weekRange = `${shortDate(weekOf)} – ${shortDate(addDays(weekOf, 6))}`;

  return (
    <div className="tasks-page tasks-v2 duties-page">
      {editing && (
        <DutyDialog
          duty={editing}
          members={members}
          messages={messages}
          locale={locale}
          firstDay={firstDay}
          timeFormat={timeFormat}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); afterChange({ ok: true }, 'module.duties.saved'); }}
        />
      )}
      {pausing && (
        <PauseDialog
          duty={pausing}
          messages={messages}
          onClose={() => setPausing(null)}
          onSaved={() => { setPausing(null); afterChange({ ok: true }, 'module.duties.pause_saved'); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t(messages, 'module.duties.delete')}
          message={t(messages, 'module.duties.delete_confirm').replace('{title}', deleting.title)}
          confirmLabel={t(messages, 'module.duties.delete')}
          confirmDanger
          messages={messages}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const duty = deleting;
            setDeleting(null);
            afterChange(await api.apiDeleteDuty(duty.id), 'module.duties.deleted');
          }}
        />
      )}
      {picking && (
        <BottomSheet title={`${picking.title} · ${dayLabel(new Date(`${picking.date}T00:00:00`))}`} messages={messages} onClose={() => setPicking(null)} className="task-actions-sheet">
          <p className="task-actions-label">{t(messages, 'module.duties.who_does_it')}</p>
          <div className="task-actions-list">
            {members.map((m) => (
              <button
                key={m.user_id}
                type="button"
                className="task-action"
                aria-pressed={!picking.skipped && picking.assigned_to_user_id === m.user_id}
                onClick={() => choose(picking, { assigned_to_user_id: m.user_id })}
              >
                <MemberAvatar member={m} index={members.indexOf(m)} size={22} />
                {m.display_name}
                {!picking.skipped && picking.assigned_to_user_id === m.user_id && <Check size={16} aria-hidden="true" className="duty-current" />}
              </button>
            ))}
          </div>
          <div className="task-actions-list">
            {!picking.skipped && !picking.paused && (
              <button type="button" className="task-action" onClick={() => choose(picking, { skipped: true })}>
                <X size={18} aria-hidden="true" />
                {t(messages, 'module.duties.skip_date')}
              </button>
            )}
            {picking.is_exception && (
              <button type="button" className="task-action" onClick={() => choose(picking, 'reset')}>
                <ChevronLeft size={18} aria-hidden="true" />
                {t(messages, 'module.duties.back_to_usual')}
              </button>
            )}
          </div>
        </BottomSheet>
      )}

      <header className="list-header">
        <h1>{t(messages, 'module.duties.name')}</h1>
        {canEdit && (
          <button className="tasks-new-btn" type="button" onClick={() => setEditing({ family_id: familyId })}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.duties.new')}
          </button>
        )}
      </header>

      {duties === null ? null : duties.length === 0 ? (
        <p className="tasks-empty">{t(messages, 'module.duties.empty')}</p>
      ) : (
        <>
          <div className="duty-week-nav">
            <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.weekly_plan.previous_week')} onClick={() => setWeekOf(addDays(weekOf, -7))}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`${weekRange}, ${t(messages, 'module.weekly_plan.this_week')}`}
              onClick={() => setWeekOf(startOfWeek(new Date(), firstDay))}
            >
              {weekRange}
            </button>
            <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.weekly_plan.next_week')} onClick={() => setWeekOf(addDays(weekOf, 7))}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          {Array.from({ length: 7 }, (_, i) => addDays(weekOf, i)).map((day) => {
            const iso = isoDate(day);
            const items = week.filter((occ) => occ.date === iso);
            if (!items.length) return null;
            const label = dayLabel(day);
            return (
              <section key={iso} className="task-group" aria-label={label}>
                <h2 className="task-group-head"><span>{label}</span></h2>
                <ul className="task-list">
                  {items.map((occ) => {
                    const content = (
                      <>
                        <span className="duty-when">{formatDutyTime(occ.due_time, locale, timeFormat) || t(messages, 'module.duties.whole_day')}</span>
                        <span className={`task-row-title${occ.skipped || occ.paused ? ' duty-skipped' : ''}`}>{occ.title}</span>
                        {occ.skipped || occ.paused
                          ? <span className="duty-badge">{t(messages, occ.skipped ? 'module.duties.skipped' : 'module.duties.paused')}</span>
                          : <Person userId={occ.assigned_to_user_id} members={members} messages={messages} />}
                        {occ.is_exception && !occ.skipped && <span className="duty-badge">{t(messages, 'module.duties.changed')}</span>}
                        {occ.task_status === 'done' && <Check size={16} aria-label={t(messages, 'module.tasks.done')} />}
                      </>
                    );
                    return (
                      <li key={`${occ.duty_id}-${occ.date}`} className="duty-row">
                        {canEdit && iso >= todayIso ? (
                          <button
                            type="button"
                            className="duty-row-main"
                            aria-label={t(messages, 'module.duties.change_date').replace('{title}', occ.title).replace('{date}', label)}
                            onClick={() => setPicking(occ)}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="duty-row-main">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <section className="task-group" aria-label={t(messages, 'module.duties.all')}>
            <h2 className="task-group-head"><span>{t(messages, 'module.duties.all')}</span></h2>
            <ul className="task-list">
              {duties.map((duty) => (
                <li key={duty.id} className="duty-row">
                  <div className="duty-row-main">
                    <span className="duty-when">{formatDutyTime(duty.due_time, locale, timeFormat) || t(messages, 'module.duties.whole_day')}</span>
                    <span className="task-row-title">{duty.title}</span>
                    <span className="duty-pattern">
                      {orderedWeekdays(firstDay)
                        .map((weekday) => duty.slots.find((slot) => slot.weekday === weekday))
                        .filter(Boolean)
                        .map((slot) => {
                          const name = (uid) => members.find((m) => m.user_id === uid)?.display_name || t(messages, 'module.duties.nobody');
                          const people = duty.alternate_from
                            ? `${name(slot.assigned_to_user_id)}/${name(slot.alternate_assigned_to_user_id)}`
                            : name(slot.assigned_to_user_id);
                          const own = formatDutyTime(slot.due_time, locale, timeFormat);
                          return `${weekdayName(slot.weekday, locale)}${own ? ` ${own}` : ''} ${people}`;
                        })
                        .join(' · ')}
                    </span>
                    {duty.pauses?.length > 0 && (
                      <span className="duty-pauses">
                        {duty.pauses.map((pause) => {
                          const range = pauseRange(pause);
                          // The pause icon stands for "Paused"; screen readers hear the word.
                          const label = (
                            <>
                              <Pause size={13} aria-hidden="true" />
                              <span className="sr-only">{t(messages, 'module.duties.paused')}</span>
                              {range}
                            </>
                          );
                          return canEdit ? (
                            <button
                              key={pause.id}
                              type="button"
                              className="duty-pause"
                              aria-label={t(messages, 'module.duties.end_pause').replace('{range}', range)}
                              onClick={() => endPause(duty, pause)}
                            >
                              <span className="duty-badge">{label}<X size={13} aria-hidden="true" /></span>
                            </button>
                          ) : (
                            <span key={pause.id} className="duty-badge">{label}</span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <>
                      <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.duties.edit_named').replace('{title}', duty.title)} onClick={() => setEditing(duty)}>
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.duties.pause_named').replace('{title}', duty.title)} onClick={() => setPausing(duty)}>
                        <Pause size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="btn btn-ghost" aria-label={t(messages, 'module.duties.delete_named').replace('{title}', duty.title)} onClick={() => setDeleting(duty)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

