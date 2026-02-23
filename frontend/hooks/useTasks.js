import { useMemo, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { errorText, toIsoOrNull } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export function useTasks() {
  const { tasks, familyId, members, messages, loadTasks } = useApp();

  const [taskFilter, setTaskFilter] = useState('open');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('normal');
  const [taskRecurrence, setTaskRecurrence] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskMsg, setTaskMsg] = useState('');

  const filteredTasks = useMemo(
    () => tasks.filter((tk) => taskFilter === 'all' || tk.status === taskFilter),
    [tasks, taskFilter],
  );

  async function createTask(e) {
    e.preventDefault();
    setTaskMsg('');
    const payload = {
      family_id: Number(familyId),
      title: taskTitle,
      description: taskDesc || null,
      priority: taskPriority,
      due_date: toIsoOrNull(taskDueDate),
      recurrence: taskRecurrence || null,
      assigned_to_user_id: taskAssignee ? Number(taskAssignee) : null,
    };
    const { ok, data } = await api.apiCreateTask(payload);
    if (!ok) return setTaskMsg(errorText(data?.detail, 'Aufgabe erstellen fehlgeschlagen'));
    setTaskTitle(''); setTaskDesc(''); setTaskDueDate(''); setTaskPriority('normal'); setTaskRecurrence(''); setTaskAssignee('');
    await loadTasks();
    setTaskMsg(t(messages, 'module.tasks.created'));
  }

  async function toggleTask(id, currentStatus) {
    const newStatus = currentStatus === 'done' ? 'open' : 'done';
    await api.apiUpdateTask(id, { status: newStatus });
    await loadTasks();
  }

  async function deleteTask(id) {
    await api.apiDeleteTask(id);
    await loadTasks();
  }

  return {
    taskFilter, setTaskFilter,
    taskTitle, setTaskTitle,
    taskDesc, setTaskDesc,
    taskDueDate, setTaskDueDate,
    taskPriority, setTaskPriority,
    taskRecurrence, setTaskRecurrence,
    taskAssignee, setTaskAssignee,
    taskMsg,
    filteredTasks,
    createTask, toggleTask, deleteTask,
  };
}
