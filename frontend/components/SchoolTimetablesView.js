import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Coffee, GraduationCap, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import MemberAvatar from './MemberAvatar';
import { useApp } from '../contexts/AppContext';
import {
  apiCreateSchoolTimetable,
  apiDeleteSchoolTimetable,
  apiListSchoolTimetables,
  apiUpdateSchoolTimetable,
} from '../lib/api';
import { t } from '../lib/i18n';

const WEEKDAYS = [
  { value: 1, short: 'Mo', full: 'Montag' },
  { value: 2, short: 'Di', full: 'Dienstag' },
  { value: 3, short: 'Mi', full: 'Mittwoch' },
  { value: 4, short: 'Do', full: 'Donnerstag' },
  { value: 5, short: 'Fr', full: 'Freitag' },
  { value: 6, short: 'Sa', full: 'Samstag' },
];

const SUBJECT_PALETTE = [
  { bg: 'rgba(124, 58, 237, 0.12)', fg: '#7c3aed' },
  { bg: 'rgba(59, 130, 246, 0.12)', fg: '#2563eb' },
  { bg: 'rgba(16, 185, 129, 0.13)', fg: '#059669' },
  { bg: 'rgba(245, 158, 11, 0.15)', fg: '#d97706' },
  { bg: 'rgba(244, 63, 94, 0.12)', fg: '#e11d48' },
  { bg: 'rgba(6, 182, 212, 0.14)', fg: '#0891b2' },
  { bg: 'rgba(168, 85, 247, 0.12)', fg: '#9333ea' },
];

const DEFAULT_PERIODS = [
  { position: 1, label: '1', start_time: '08:00', end_time: '08:45', kind: 'lesson', break_label: '' },
  { position: 2, label: 'Break', start_time: '08:45', end_time: '09:00', kind: 'break', break_label: 'Pause' },
  { position: 3, label: '2', start_time: '09:00', end_time: '09:45', kind: 'lesson', break_label: '' },
];

function emptyForm(familyId) {
  return {
    family_id: Number(familyId),
    name: '',
    class_label: '',
    include_saturday: false,
    notes: '',
    assigned_member_user_ids: [],
    periods: DEFAULT_PERIODS,
    lessons: [],
  };
}

function normalizeTime(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function lessonKey(weekday, position) {
  return `${weekday}:${position}`;
}

function buildLessonMap(lessons) {
  const map = new Map();
  for (const lesson of lessons || []) {
    map.set(lessonKey(lesson.weekday, lesson.period_position), lesson);
  }
  return map;
}

function subjectPalette(subject) {
  if (!subject) return null;
  const key = subject.trim().toLowerCase();
  if (!key) return null;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
}

function payloadFromForm(form, familyId) {
  return {
    family_id: Number(familyId),
    name: form.name.trim(),
    class_label: form.class_label.trim() || null,
    include_saturday: Boolean(form.include_saturday),
    notes: form.notes.trim() || null,
    assigned_member_user_ids: (form.assigned_member_user_ids || []).map(Number),
    periods: (form.periods || []).map((p, idx) => ({
      position: Number(p.position || idx + 1),
      label: String(p.label || idx + 1),
      start_time: normalizeTime(p.start_time),
      end_time: normalizeTime(p.end_time),
      kind: p.kind === 'break' ? 'break' : 'lesson',
      break_label: p.kind === 'break' ? (p.break_label || p.label || 'Break') : null,
    })),
    lessons: (form.lessons || [])
      .filter((l) => l.subject && l.subject.trim())
      .map((l) => ({
        weekday: Number(l.weekday),
        period_position: Number(l.period_position),
        subject: l.subject.trim(),
        room: l.room?.trim() || null,
        teacher: l.teacher?.trim() || null,
        color: l.color?.trim() || null,
      })),
  };
}

export default function SchoolTimetablesView() {
  const { familyId, members = [], messages, demoMode } = useApp();
  const [timetables, setTimetables] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => emptyForm(familyId));
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mobileDay, setMobileDay] = useState(1);

  const childCandidates = useMemo(
    () => (members || []).filter((m) => !m.is_adult),
    [members]
  );
  const visibleWeekdays = WEEKDAYS.filter((d) => d.value <= 5 || form.include_saturday);
  const lessonMap = buildLessonMap(form.lessons);
  const activeMobileDay = visibleWeekdays.find((d) => d.value === mobileDay) || visibleWeekdays[0];

  async function load() {
    if (!familyId || demoMode) return;
    const { ok, data } = await apiListSchoolTimetables(familyId);
    if (ok && Array.isArray(data)) {
      setTimetables(data);
      if (!selectedId && !creating && data.length > 0) {
        selectTimetable(data[0]);
      }
    }
  }

  useEffect(() => {
    setForm(emptyForm(familyId));
    setSelectedId(null);
    setTimetables([]);
    setCreating(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, demoMode]);

  useEffect(() => {
    if (!visibleWeekdays.some((d) => d.value === mobileDay)) {
      setMobileDay(visibleWeekdays[0]?.value ?? 1);
    }
  }, [form.include_saturday]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectTimetable(item) {
    setCreating(false);
    setSelectedId(item.id);
    setForm({
      family_id: item.family_id,
      name: item.name || '',
      class_label: item.class_label || '',
      include_saturday: Boolean(item.include_saturday),
      notes: item.notes || '',
      assigned_member_user_ids: item.assigned_member_user_ids || [],
      periods: (item.periods || []).map((p) => ({ ...p, start_time: normalizeTime(p.start_time), end_time: normalizeTime(p.end_time) })),
      lessons: item.lessons || [],
    });
    setStatus('');
  }

  function startNew() {
    setSelectedId(null);
    setForm(emptyForm(familyId));
    setStatus('');
    setCreating(true);
  }

  function updatePeriod(index, key, value) {
    setForm((current) => {
      const nextPeriods = current.periods.map((p, idx) => idx === index ? { ...p, [key]: value } : p);
      const changed = nextPeriods[index];
      const nextLessons = key === 'kind' && value === 'break'
        ? (current.lessons || []).filter((lesson) => Number(lesson.period_position) !== Number(changed.position))
        : current.lessons;
      return { ...current, periods: nextPeriods, lessons: nextLessons };
    });
  }

  function removePeriod(index) {
    setForm((current) => {
      const removed = current.periods[index];
      if (!removed) return current;

      const positionMap = new Map();
      const nextPeriods = current.periods
        .filter((_, idx) => idx !== index)
        .map((period, idx) => {
          const nextPosition = idx + 1;
          positionMap.set(Number(period.position), nextPosition);
          return { ...period, position: nextPosition };
        });
      const nextLessons = (current.lessons || [])
        .filter((lesson) => Number(lesson.period_position) !== Number(removed.position))
        .map((lesson) => ({
          ...lesson,
          period_position: positionMap.get(Number(lesson.period_position)) ?? lesson.period_position,
        }));

      return { ...current, periods: nextPeriods, lessons: nextLessons };
    });
  }

  function addPeriod(kind = 'lesson') {
    setForm((current) => {
      const position = current.periods.length + 1;
      return {
        ...current,
        periods: [
          ...current.periods,
          { position, label: kind === 'break' ? 'Break' : String(position), start_time: '12:00', end_time: '12:45', kind, break_label: kind === 'break' ? 'Pause' : '' },
        ],
      };
    });
  }

  function updateLesson(weekday, periodPosition, value) {
    setForm((current) => {
      const lessons = [...(current.lessons || [])];
      const idx = lessons.findIndex((l) => l.weekday === weekday && l.period_position === periodPosition);
      if (!value.trim()) {
        if (idx >= 0) lessons.splice(idx, 1);
      } else if (idx >= 0) {
        lessons[idx] = { ...lessons[idx], subject: value };
      } else {
        lessons.push({ weekday, period_position: periodPosition, subject: value, room: null, teacher: null, color: null });
      }
      return { ...current, lessons };
    });
  }

  function toggleMember(userId) {
    setForm((current) => {
      const id = Number(userId);
      const set = new Set(current.assigned_member_user_ids || []);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...current, assigned_member_user_ids: Array.from(set) };
    });
  }

  async function save() {
    if (!form.name.trim()) {
      setStatus('Bitte einen Namen vergeben.');
      return;
    }
    setSaving(true);
    setStatus('');
    const payload = payloadFromForm(form, familyId);
    const result = selectedId
      ? await apiUpdateSchoolTimetable(selectedId, payload)
      : await apiCreateSchoolTimetable(payload);
    setSaving(false);
    if (!result.ok) {
      setStatus(result.data?.detail || 'Speichern fehlgeschlagen.');
      return;
    }
    setStatus('Gespeichert.');
    await load();
    selectTimetable(result.data);
  }

  async function remove() {
    if (!selectedId) return;
    const result = await apiDeleteSchoolTimetable(selectedId);
    if (!result.ok) {
      setStatus(result.data?.detail || 'Löschen fehlgeschlagen.');
      return;
    }
    setCreating(false);
    setSelectedId(null);
    setForm(emptyForm(familyId));
    setStatus('');
    await load();
  }

  if (demoMode) {
    return (
      <div className="view school-timetables-view">
        <div className="view-header">
          <div>
            <h1 className="view-title"><GraduationCap size={24} /> {t(messages, 'module.school_timetables.name')}</h1>
            <p className="view-subtitle">{t(messages, 'module.school_timetables.subtitle')}</p>
          </div>
        </div>
        <div className="school-empty-rich">
          <div className="school-empty-icon-wrap"><GraduationCap size={32} aria-hidden="true" /></div>
          <p>School timetables are available in family mode.</p>
        </div>
      </div>
    );
  }

  const showEmptyState = timetables.length === 0 && !creating && !selectedId;

  return (
    <div className="view school-timetables-view">
      <div className="view-header">
        <div>
          <h1 className="view-title"><GraduationCap size={24} /> {t(messages, 'module.school_timetables.name')}</h1>
          <p className="view-subtitle">{t(messages, 'module.school_timetables.subtitle')}</p>
        </div>
        {!showEmptyState && (
          <button type="button" className="btn-primary school-add-btn" onClick={startNew}>
            <Plus size={16} aria-hidden="true" /> {t(messages, 'module.school_timetables.add')}
          </button>
        )}
      </div>

      {showEmptyState ? (
        <div className="school-empty-rich">
          <div className="school-empty-icon-wrap" aria-hidden="true"><GraduationCap size={36} /></div>
          <h2 className="school-empty-title">{t(messages, 'module.school_timetables.empty')}</h2>
          <p className="school-empty-body">
            Lege einen Wochenplan an, damit Fächer, Pausen und Stundenzeiten übersichtlich an einem Ort liegen.
          </p>
          <button type="button" className="btn-primary school-empty-cta" onClick={startNew}>
            <Sparkles size={16} aria-hidden="true" /> Ersten Stundenplan erstellen
          </button>
        </div>
      ) : (
        <div className="school-layout">
          <aside className="school-list-card" aria-label="Stundenpläne">
            <div className="school-list-header">
              <span className="school-list-title">Pläne</span>
              <span className="school-list-count">{timetables.length}</span>
            </div>
            {timetables.length === 0 && creating && (
              <p className="muted school-list-empty">Neuer Plan in Bearbeitung…</p>
            )}
            <div className="school-list-items">
              {timetables.map((item) => {
                const active = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`school-list-item${active ? ' active' : ''}`}
                    onClick={() => selectTimetable(item)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <div className="school-list-item-name">{item.name}</div>
                    <div className="school-list-item-meta">
                      <span className="school-list-item-class">{item.class_label || 'Ohne Klasse'}</span>
                      {(item.assigned_members || []).length > 0 && (
                        <span className="school-list-item-children" aria-label="Zugeordnete Kinder">
                          {item.assigned_members.map((m, i) => (
                            <MemberAvatar key={m.user_id ?? i} member={m} index={i} size={20} />
                          ))}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="school-editor-card">
            <section className="school-editor-section school-meta-section">
              <div className="school-meta-grid">
                <label className="school-field">
                  <span>Name</span>
                  <input
                    className="form-input"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Klasse 4b"
                  />
                </label>
                <label className="school-field">
                  <span>{t(messages, 'module.school_timetables.class_label')}</span>
                  <input
                    className="form-input"
                    value={form.class_label}
                    onChange={(e) => setForm({ ...form, class_label: e.target.value })}
                    placeholder="4b"
                  />
                </label>
              </div>
              <label className="school-toggle">
                <input
                  type="checkbox"
                  checked={form.include_saturday}
                  onChange={(e) => setForm({ ...form, include_saturday: e.target.checked })}
                />
                <span className="school-toggle-track" aria-hidden="true">
                  <span className="school-toggle-thumb" />
                </span>
                <span className="school-toggle-label">{t(messages, 'module.school_timetables.include_saturday')}</span>
              </label>
            </section>

            <section className="school-editor-section">
              <h2 className="school-section-title">Für wen ist dieser Plan?</h2>
              <div
                className="school-children-row"
                role="group"
                aria-label={t(messages, 'module.school_timetables.assigned_children')}
              >
                {childCandidates.length === 0 ? (
                  <p className="muted">Keine Kinder in der Familie gefunden.</p>
                ) : childCandidates.map((member, i) => {
                  const active = (form.assigned_member_user_ids || []).includes(member.user_id);
                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      role="checkbox"
                      aria-checked={active}
                      aria-label={`${member.display_name}${active ? ' zugeordnet' : ''}`}
                      className={`school-child-chip${active ? ' active' : ''}`}
                      onClick={() => toggleMember(member.user_id)}
                    >
                      <MemberAvatar member={member} index={i} size={28} />
                      <span className="school-child-chip-name">{member.display_name}</span>
                      {active && (
                        <span className="school-child-chip-check" aria-hidden="true">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="school-editor-section school-grid-section">
              <div className="school-section-head">
                <h2 className="school-section-title">{t(messages, 'module.school_timetables.lessons')}</h2>
                <p className="school-section-hint">Tippe in eine Zelle, um ein Fach einzutragen.</p>
              </div>

              <div className="school-day-pager" role="tablist" aria-label="Wochentag wählen">
                {visibleWeekdays.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    role="tab"
                    aria-selected={mobileDay === day.value}
                    className={`school-day-tab${mobileDay === day.value ? ' active' : ''}`}
                    onClick={() => setMobileDay(day.value)}
                  >
                    {day.short}
                  </button>
                ))}
              </div>

              <div
                className="school-grid"
                role="grid"
                aria-label="Stundenplan"
                style={{ '--school-columns': visibleWeekdays.length }}
              >
                <div className="school-grid-corner" role="presentation" />
                {visibleWeekdays.map((day) => (
                  <div key={day.value} role="columnheader" className="school-grid-day-head">
                    <span className="school-grid-day-short" aria-hidden="true">{day.short}</span>
                    <span className="school-grid-day-full">{day.full}</span>
                  </div>
                ))}

                {form.periods.map((period) => {
                  const time = `${normalizeTime(period.start_time)}–${normalizeTime(period.end_time)}`;
                  if (period.kind === 'break') {
                    return (
                      <div
                        key={`brk-${period.position}`}
                        className="school-grid-row school-grid-row--break"
                        role="row"
                      >
                        <div className="school-grid-time school-grid-time--break" role="rowheader">
                          <span className="school-grid-time-range">{time}</span>
                        </div>
                        <div
                          className="school-grid-break-bar"
                          aria-label={`Pause ${time}`}
                        >
                          <Coffee size={14} aria-hidden="true" />
                          <span>{period.break_label || period.label || 'Pause'}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={`row-${period.position}`} className="school-grid-row" role="row">
                      <div className="school-grid-time" role="rowheader">
                        <span className="school-grid-time-num">{period.label}</span>
                        <span className="school-grid-time-range">{time}</span>
                      </div>
                      {visibleWeekdays.map((day) => {
                        const lesson = lessonMap.get(lessonKey(day.value, Number(period.position)));
                        const subject = lesson?.subject || '';
                        const palette = subjectPalette(subject);
                        const cellStyle = palette ? { '--st-bg': palette.bg, '--st-fg': palette.fg } : undefined;
                        const cellLabel = `${day.full}, ${period.label}. Stunde${subject ? ', ' + subject : ', leer'}`;
                        return (
                          <div
                            key={`${day.value}-${period.position}`}
                            role="gridcell"
                            className={`school-cell${subject ? ' school-cell--filled' : ''}`}
                            style={cellStyle}
                          >
                            <input
                              className="school-cell-input"
                              value={subject}
                              onChange={(e) => updateLesson(day.value, Number(period.position), e.target.value)}
                              placeholder="—"
                              aria-label={cellLabel}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="school-day-list" aria-label={`Plan für ${activeMobileDay?.full || ''}`}>
                {form.periods.map((period) => {
                  const time = `${normalizeTime(period.start_time)}–${normalizeTime(period.end_time)}`;
                  if (period.kind === 'break') {
                    return (
                      <div key={`mbrk-${period.position}`} className="school-day-list-item school-day-list-item--break">
                        <div className="school-day-list-time">{time}</div>
                        <div className="school-grid-break-bar">
                          <Coffee size={14} aria-hidden="true" />
                          <span>{period.break_label || 'Pause'}</span>
                        </div>
                      </div>
                    );
                  }
                  if (!activeMobileDay) return null;
                  const lesson = lessonMap.get(lessonKey(activeMobileDay.value, Number(period.position)));
                  const subject = lesson?.subject || '';
                  const palette = subjectPalette(subject);
                  const cellStyle = palette ? { '--st-bg': palette.bg, '--st-fg': palette.fg } : undefined;
                  return (
                    <div
                      key={`mlsn-${period.position}`}
                      className={`school-day-list-item${subject ? ' school-day-list-item--filled' : ''}`}
                      style={cellStyle}
                    >
                      <div className="school-day-list-time">
                        <span className="school-day-list-num">{period.label}</span>
                        <span className="school-day-list-range">{time}</span>
                      </div>
                      <input
                        className="school-cell-input school-day-list-input"
                        value={subject}
                        onChange={(e) => updateLesson(activeMobileDay.value, Number(period.position), e.target.value)}
                        placeholder="Fach eintragen"
                        aria-label={`Fach ${activeMobileDay.full} ${period.label}. Stunde`}
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            <details className="school-editor-section school-periods-config">
              <summary>
                <span className="school-section-title">{t(messages, 'module.school_timetables.periods')}</span>
                <ChevronDown size={16} aria-hidden="true" className="school-periods-chevron" />
              </summary>
              <div className="school-periods">
                {form.periods.map((period, index) => (
                  <div key={index} className={`school-period-row school-period-row--${period.kind}`}>
                    <input
                      className="form-input school-period-label"
                      aria-label="Bezeichnung"
                      value={period.label}
                      onChange={(e) => updatePeriod(index, 'label', e.target.value)}
                    />
                    <select
                      className="form-input school-period-kind"
                      aria-label="Art"
                      value={period.kind}
                      onChange={(e) => updatePeriod(index, 'kind', e.target.value)}
                    >
                      <option value="lesson">Stunde</option>
                      <option value="break">Pause</option>
                    </select>
                    <input
                      className="form-input school-period-time"
                      type="time"
                      aria-label="Beginn"
                      value={normalizeTime(period.start_time)}
                      onChange={(e) => updatePeriod(index, 'start_time', e.target.value)}
                    />
                    <input
                      className="form-input school-period-time"
                      type="time"
                      aria-label="Ende"
                      value={normalizeTime(period.end_time)}
                      onChange={(e) => updatePeriod(index, 'end_time', e.target.value)}
                    />
                    <button
                      type="button"
                      className="school-period-remove"
                      aria-label="Eintrag entfernen"
                      onClick={() => removePeriod(index)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <div className="school-periods-actions">
                  <button type="button" className="btn-ghost" onClick={() => addPeriod('lesson')}>
                    <Plus size={14} aria-hidden="true" /> Stunde
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => addPeriod('break')}>
                    <Coffee size={14} aria-hidden="true" /> Pause
                  </button>
                </div>
              </div>
            </details>

            {status && <p className="form-status school-form-status" role="status">{status}</p>}

            <div className="school-action-bar">
              <button
                type="button"
                className="btn-primary"
                onClick={save}
                disabled={saving}
              >
                <Save size={16} aria-hidden="true" /> {t(messages, 'module.school_timetables.save')}
              </button>
              {selectedId && (
                <button type="button" className="btn-danger" onClick={remove}>
                  <Trash2 size={16} aria-hidden="true" /> {t(messages, 'module.school_timetables.delete')}
                </button>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
