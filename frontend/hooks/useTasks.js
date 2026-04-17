import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText, toIsoOrNull } from '../lib/helpers';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import * as api from '../lib/api';

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
  };
}
