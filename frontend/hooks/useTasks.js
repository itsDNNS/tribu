import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText, toIsoOrNull } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import { weekStartIndex } from '../lib/dates';
import { postponeTarget } from '../lib/taskGroups';
import { UNDO_WINDOW_MS } from '../lib/undo';
import * as api from '../lib/api';

const EMPTY_EDIT_FORM = {
  title: '',
  description: '',
  due_date: '',
  due_is_date: false,
  priority: 'normal',
  recurrence: '',
  assigned_to_user_id: '',
};

export { UNDO_WINDOW_MS };

function toDateTimeLocal(iso) {
  if (!iso) return '';
  // Slice to "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. The API
  // returns naive local wall-clock (no trailing Z), which Date parses as
  // local, so getFullYear/getMonth/etc. reproduce the stored values.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function payloadFromForm(form) {
  return {
    title: form.title,
    description: form.description || null,
    due_date: toIsoOrNull(form.due_date),
    due_is_date: Boolean(form.due_is_date),
    priority: form.priority,
    recurrence: form.recurrence || null,
    assigned_to_user_id: form.assigned_to_user_id ? Number(form.assigned_to_user_id) : null,
  };
}

export function useTasks() {
  const { tasks, setTasks, familyId, messages, loadTasks, demoMode, weekStart } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [editingTask, setEditingTask] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  // Completing and deleting wait for the undo window before they are sent,
  // so an undone action never awards points, creates the next occurrence of
  // a recurring task or fires a webhook. Until then the list shows them as
  // done or gone.
  const pendingRef = useRef(new Map());
  const [overrides, setOverrides] = useState({});

  const setOverride = useCallback((id, value) => {
    setOverrides((current) => {
      const next = { ...current };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }, []);

  const runPending = useCallback(async (id) => {
    const pending = pendingRef.current.get(id);
    if (!pending) return;
    pendingRef.current.delete(id);
    clearTimeout(pending.timer);
    const { ok } = pending.kind === 'delete'
      ? await api.apiDeleteTask(id)
      : await api.apiUpdateTask(id, { status: 'done' });
    if (!ok) toastError(t(messages, 'toast.error'));
    await loadTasks();
    setOverride(id, null);
  }, [loadTasks, messages, setOverride, toastError]);

  // Leaving the page or the view sends what is still waiting. The ref keeps
  // the listeners stable, so re-renders never send early.
  const runPendingRef = useRef(runPending);
  runPendingRef.current = runPending;

  useEffect(() => {
    const flush = () => {
      for (const id of [...pendingRef.current.keys()]) runPendingRef.current(id);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const visibleTasks = useMemo(() => tasks
    .filter((task) => overrides[task.id] !== 'deleted')
    .map((task) => (overrides[task.id] === 'done' ? { ...task, status: 'done' } : task))
    .filter((task) => !assigneeFilter || String(task.assigned_to_user_id || '') === String(assigneeFilter)),
  [tasks, overrides, assigneeFilter]);

  function schedule(task, kind, doneMessage) {
    if (demoMode) {
      const before = tasks;
      setTasks((prev) => (kind === 'delete'
        ? prev.filter((item) => item.id !== task.id)
        : prev.map((item) => (item.id === task.id ? { ...item, status: 'done' } : item))));
      toastSuccess(doneMessage, { label: t(messages, 'module.shopping.undo'), onClick: () => setTasks(before) });
      announce(doneMessage);
      return;
    }
    setOverride(task.id, kind === 'delete' ? 'deleted' : 'done');
    const timer = setTimeout(() => runPendingRef.current(task.id), UNDO_WINDOW_MS);
    pendingRef.current.set(task.id, { kind, timer });
    toastSuccess(doneMessage, {
      label: t(messages, 'module.shopping.undo'),
      onClick: () => {
        const pending = pendingRef.current.get(task.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        pendingRef.current.delete(task.id);
        setOverride(task.id, null);
      },
    });
    announce(doneMessage);
  }

  async function toggleTask(task) {
    if (task.status !== 'done') {
      schedule(task, 'done', t(messages, 'module.tasks.completed'));
      return;
    }
    // Reopening has no side effects and needs no undo.
    if (demoMode) {
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: 'open' } : item)));
      return;
    }
    const { ok } = await api.apiUpdateTask(task.id, { status: 'open' });
    if (!ok) toastError(t(messages, 'toast.error'));
    await loadTasks();
  }

  function deleteTask(task) {
    schedule(task, 'delete', t(messages, 'module.tasks.deleted'));
  }

  async function saveDue(task, due) {
    if (demoMode) {
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, ...due } : item)));
      return true;
    }
    const { ok } = await api.apiUpdateTask(task.id, due);
    if (!ok) toastError(t(messages, 'toast.error'));
    await loadTasks();
    return ok;
  }

  async function postponeTask(task, option) {
    const before = { due_date: task.due_date || null, due_is_date: Boolean(task.due_is_date) };
    const target = postponeTarget(task, option, new Date(), weekStartIndex(weekStart));
    if (!await saveDue(task, target)) return;
    const message = t(messages, 'module.tasks.postponed')
      .replace('{when}', t(messages, `module.tasks.postpone_${option}`));
    toastSuccess(message, { label: t(messages, 'module.shopping.undo'), onClick: () => saveDue(task, before) });
    announce(message);
  }

  function openCreate() {
    setEditingTask(null);
    setEditForm(EMPTY_EDIT_FORM);
    setCreating(true);
  }

  function openEdit(task) {
    setCreating(false);
    setEditingTask(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      due_date: toDateTimeLocal(task.due_date),
      due_is_date: Boolean(task.due_is_date),
      priority: task.priority || 'normal',
      recurrence: task.recurrence || '',
      assigned_to_user_id: task.assigned_to_user_id ? String(task.assigned_to_user_id) : '',
    });
  }

  function closeEdit() {
    setEditingTask(null);
    setCreating(false);
    setEditForm(EMPTY_EDIT_FORM);
  }

  async function createTask(e) {
    e.preventDefault();
    const payload = { family_id: Number(familyId), ...payloadFromForm(editForm) };
    if (demoMode) {
      const now = new Date().toISOString();
      setTasks((prev) => [{ id: Date.now(), ...payload, status: 'open', created_at: now, updated_at: now }, ...prev]);
    } else {
      const { ok, data } = await api.apiCreateTask(payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await loadTasks();
    }
    closeEdit();
    const msg = t(messages, 'module.tasks.created');
    toastSuccess(msg);
    announce(msg);
  }

  async function updateTask(e) {
    e.preventDefault();
    if (!editingTask) return;
    const taskId = editingTask.id;
    const payload = payloadFromForm(editForm);
    if (demoMode) {
      setTasks((prev) => prev.map((item) => (item.id === taskId
        ? { ...item, ...payload, updated_at: new Date().toISOString() }
        : item)));
    } else {
      const { ok, data } = await api.apiUpdateTask(taskId, payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await loadTasks();
    }
    // Only close the dialog if the user has not already opened a different
    // task while the save was in flight.
    let stillSameTask = false;
    setEditingTask((current) => {
      if (current && current.id === taskId) {
        stillSameTask = true;
        return null;
      }
      return current;
    });
    if (stillSameTask) setEditForm(EMPTY_EDIT_FORM);
    const msg = t(messages, 'module.tasks.updated');
    toastSuccess(msg);
    announce(msg);
  }

  return {
    assigneeFilter, setAssigneeFilter,
    visibleTasks,
    toggleTask, deleteTask, postponeTask,
    editingTask, creating, editForm, setEditForm,
    openCreate, openEdit, closeEdit, createTask, updateTask,
  };
}
