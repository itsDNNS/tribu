import { useEffect, useRef, useState } from 'react';
import { apiUpdateTask } from '../lib/api';

// Completion belongs to the household that started it, even when the user navigates away.
export function useDashboardTasks({ familyId, demoMode, isChild, me, tasks, setTasks, loadTasks, loadDashboard, loadActivity }) {
  const scope = useRef(null);
  const [pendingTasks, setPendingTasks] = useState(new Set());
  const [taskError, setTaskError] = useState(false);
  useEffect(() => {
    const current = { active: true, pending: new Set() };
    scope.current = current;
    setPendingTasks(new Set());
    setTaskError(false);
    return () => { current.active = false; };
  }, [familyId, demoMode]);

  const canCompleteTask = (task) => !isChild || (me?.user_id != null && String(task.assigned_to_user_id) === String(me.user_id));
  async function completeTask(id) {
    const current = scope.current;
    const task = tasks.find((item) => item.id === id);
    if (!current?.active || current.pending.has(id) || !task || !canCompleteTask(task) || task.status !== 'open') return;
    current.pending.add(id);
    setPendingTasks(new Set(current.pending));
    setTaskError(false);
    try {
      if (demoMode) {
        setTasks((items) => items.map((item) => item.id === id ? { ...item, status: 'done', completed_at: new Date().toISOString() } : item));
      } else {
        const result = await apiUpdateTask(id, { status: 'done' });
        if (!current.active) return;
        if (!result.ok) throw new Error('Task update failed');
        await Promise.all([loadTasks(familyId), loadDashboard?.(familyId), loadActivity?.(familyId)]);
      }
    } catch {
      if (current.active) setTaskError(true);
    } finally {
      current.pending.delete(id);
      if (current.active) setPendingTasks(new Set(current.pending));
    }
  }
  return { pendingTasks, taskError, completeTask, canCompleteTask };
}
