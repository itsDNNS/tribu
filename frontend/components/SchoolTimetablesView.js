import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, Plus, Save, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  apiCreateSchoolTimetable,
  apiDeleteSchoolTimetable,
  apiListSchoolTimetables,
  apiUpdateSchoolTimetable,
} from '../lib/api';
import { t } from '../lib/i18n';

const WEEKDAYS = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
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

  const childCandidates = useMemo(
    () => (members || []).filter((m) => !m.is_adult),
    [members]
  );
  const lessonPeriods = (form.periods || []).filter((p) => p.kind !== 'break');
  const visibleWeekdays = WEEKDAYS.filter((d) => d.value <= 5 || form.include_saturday);
  const lessonMap = buildLessonMap(form.lessons);

  async function load() {
    if (!familyId || demoMode) return;
    const { ok, data } = await apiListSchoolTimetables(familyId);
    if (ok && Array.isArray(data)) {
      setTimetables(data);
      if (!selectedId && data.length > 0) {
        selectTimetable(data[0]);
      }
    }
  }

  useEffect(() => {
    setForm(emptyForm(familyId));
    setSelectedId(null);
    setTimetables([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, demoMode]);

  function selectTimetable(item) {
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
    startNew();
    await load();
  }

  if (demoMode) {
    return <div className="view"><div className="empty-state">School timetables are available in family mode.</div></div>;
  }

  return (
    <div className="view school-timetables-view">
      <div className="view-header">
        <div>
          <h1 className="view-title"><GraduationCap size={24} /> {t(messages, 'module.school_timetables.name')}</h1>
          <p className="view-subtitle">{t(messages, 'module.school_timetables.subtitle')}</p>
        </div>
        <button type="button" className="btn-primary" onClick={startNew}><Plus size={16} /> {t(messages, 'module.school_timetables.add')}</button>
      </div>

      <div className="school-layout">
        <aside className="school-list-card">
          {timetables.length === 0 ? (
            <p className="muted">{t(messages, 'module.school_timetables.empty')}</p>
          ) : timetables.map((item) => (
            <button key={item.id} type="button" className={`school-list-item${selectedId === item.id ? ' active' : ''}`} onClick={() => selectTimetable(item)}>
              <strong>{item.name}</strong>
              <span>{item.class_label || 'Ohne Klasse'}</span>
              <small>{(item.assigned_members || []).map((m) => m.display_name).join(', ')}</small>
            </button>
          ))}
        </aside>

        <main className="school-editor-card">
          <div className="form-grid two">
            <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Klasse 4b" /></label>
            <label>{t(messages, 'module.school_timetables.class_label')}<input value={form.class_label} onChange={(e) => setForm({ ...form, class_label: e.target.value })} placeholder="4b" /></label>
          </div>
          <label className="checkbox-row"><input type="checkbox" checked={form.include_saturday} onChange={(e) => setForm({ ...form, include_saturday: e.target.checked })} /> {t(messages, 'module.school_timetables.include_saturday')}</label>

          <section>
            <h2>{t(messages, 'module.school_timetables.assigned_children')}</h2>
            <div className="school-chip-grid">
              {childCandidates.length === 0 ? <p className="muted">Keine Kinder in der Familie gefunden.</p> : childCandidates.map((member) => (
                <label key={member.user_id} className="school-child-chip">
                  <input type="checkbox" checked={(form.assigned_member_user_ids || []).includes(member.user_id)} onChange={() => toggleMember(member.user_id)} />
                  <span>{member.display_name}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="section-row">
              <h2>{t(messages, 'module.school_timetables.periods')}</h2>
              <div><button type="button" onClick={() => addPeriod('lesson')}>+ Stunde</button> <button type="button" onClick={() => addPeriod('break')}>+ Pause</button></div>
            </div>
            <div className="school-periods">
              {form.periods.map((period, index) => (
                <div key={index} className="school-period-row">
                  <input aria-label="Label" value={period.label} onChange={(e) => updatePeriod(index, 'label', e.target.value)} />
                  <select value={period.kind} onChange={(e) => updatePeriod(index, 'kind', e.target.value)}><option value="lesson">Stunde</option><option value="break">Pause</option></select>
                  <input type="time" value={normalizeTime(period.start_time)} onChange={(e) => updatePeriod(index, 'start_time', e.target.value)} />
                  <input type="time" value={normalizeTime(period.end_time)} onChange={(e) => updatePeriod(index, 'end_time', e.target.value)} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>{t(messages, 'module.school_timetables.lessons')}</h2>
            <div className="school-grid" style={{ '--school-columns': visibleWeekdays.length + 1 }}>
              <div className="school-grid-head">Zeit</div>
              {visibleWeekdays.map((day) => <div key={day.value} className="school-grid-head">{day.short}</div>)}
              {lessonPeriods.map((period) => (
                <div key={`row-${period.position}`} className="school-grid-row-contents">
                  <div className="school-grid-time"><strong>{period.label}</strong><span>{normalizeTime(period.start_time)}-{normalizeTime(period.end_time)}</span></div>
                  {visibleWeekdays.map((day) => {
                    const lesson = lessonMap.get(lessonKey(day.value, Number(period.position)));
                    return <input key={`${day.value}-${period.position}`} value={lesson?.subject || ''} onChange={(e) => updateLesson(day.value, Number(period.position), e.target.value)} placeholder="Fach" />;
                  })}
                </div>
              ))}
            </div>
          </section>

          {status && <p className="form-status">{status}</p>}
          <div className="button-row">
            <button type="button" className="btn-primary" onClick={save} disabled={saving}><Save size={16} /> {t(messages, 'module.school_timetables.save')}</button>
            {selectedId && <button type="button" className="btn-danger" onClick={remove}><Trash2 size={16} /> {t(messages, 'module.school_timetables.delete')}</button>}
          </div>
        </main>
      </div>
    </div>
  );
}
