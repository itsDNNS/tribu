import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText, toIsoOrNull } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

const EMPTY_EDIT_FORM = {
  title: '',
  description: '',
  due_date: '',
  priority: 'normal',
  recurrence: '',
  assigned_to_user_id: '',
};

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

export function useTasks() {
  const { tasks, setTasks, familyId, messages, loadTasks, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [taskFilter, setTaskFilter] = useState('open');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('normal');
  const [taskRecurrence, setTaskRecurrence] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');

  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  const filteredTasks = useMemo(
    () => tasks.filter((tk) => taskFilter === 'all' || tk.status === taskFilter),
    [tasks, taskFilter],
  );

  async function createTask(e) {
    e.preventDefault();
    const payload = {
      family_id: Number(familyId),
      title: taskTitle,
      description: taskDesc || null,
      priority: taskPriority,
      due_date: toIsoOrNull(taskDueDate),
      recurrence: taskRecurrence || null,
      assigned_to_user_id: taskAssignee ? Number(taskAssignee) : null,
    };
    if (demoMode) {
      const newTask = { id: Date.now(), ...payload, status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      setTasks((prev) => [newTask, ...prev]);
    } else {
      const { ok, data } = await api.apiCreateTask(payload);
      if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      await loadTasks();
    }
    setTaskTitle(''); setTaskDesc(''); setTaskDueDate(''); setTaskPriority('normal'); setTaskRecurrence(''); setTaskAssignee('');
    const msg = t(messages, 'module.tasks.created');
    toastSuccess(msg);
    announce(msg);
  }

  async function toggleTask(id, currentStatus) {
    const newStatus = currentStatus === 'done' ? 'open' : 'done';
    if (demoMode) {
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t));
    } else {
      const { ok } = await api.apiUpdateTask(id, { status: newStatus });
      if (!ok) toastError(t(messages, 'toast.error'));
      await loadTasks();
    }
  }

  async function deleteTask(id) {
    if (demoMode) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } else {
      const { ok } = await api.apiDeleteTask(id);
      if (!ok) toastError(t(messages, 'toast.error'));
      await loadTasks();
    }
  }

  function openEdit(task) {
    setEditingTask(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      due_date: toDateTimeLocal(task.due_date),
      priority: task.priority || 'normal',
      recurrence: task.recurrence || '',
      assigned_to_user_id: task.assigned_to_user_id ? String(task.assigned_to_user_id) : '',
    });
  }

  function closeEdit() {
    setEditingTask(null);
    setEditForm(EMPTY_EDIT_FORM);
  }

  async function updateTask(e) {
    e.preventDefault();
    if (!editingTask) return;
    const taskId = editingTask.id;
    const payload = {
      title: editForm.title,
      description: editForm.description || null,
      due_date: toIsoOrNull(editForm.due_date),
      priority: editForm.priority,
      recurrence: editForm.recurrence || null,
      assigned_to_user_id: editForm.assigned_to_user_id ? Number(editForm.assigned_to_user_id) : null,
    };
    if (demoMode) {
      setTasks((prev) => prev.map((t) => t.id === taskId
        ? { ...t, ...payload, updated_at: new Date().toISOString() }
        : t));
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
    taskFilter, setTaskFilter,
    taskTitle, setTaskTitle,
    taskDesc, setTaskDesc,
    taskDueDate, setTaskDueDate,
    taskPriority, setTaskPriority,
    taskRecurrence, setTaskRecurrence,
    taskAssignee, setTaskAssignee,
    filteredTasks,
    createTask, toggleTask, deleteTask,
    editingTask, editForm, setEditForm,
    openEdit, closeEdit, updateTask,
  };
}
