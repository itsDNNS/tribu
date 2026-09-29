import { renderHook, act } from '@testing-library/react';
import { useTasks, UNDO_WINDOW_MS } from '../../hooks/useTasks';

const mockLoadTasks = jest.fn();
const mockContext = {
  tasks: [
    { id: 1, title: 'Task A', status: 'open', priority: 'normal' },
    { id: 2, title: 'Task B', status: 'done', priority: 'high' },
    { id: 3, title: 'Task C', status: 'open', priority: 'low', assigned_to_user_id: 7 },
  ],
  familyId: '1',
  members: [],
  messages: {},
  loadTasks: mockLoadTasks,
  setTasks: jest.fn(),
  weekStart: 'monday',
};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockContext,
}));

const mockToastSuccess = jest.fn();
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: jest.fn(), info: jest.fn(), toast: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn() }),
}));

jest.mock('../../lib/api', () => ({
  apiCreateTask: jest.fn(() => Promise.resolve({ ok: true, data: { id: 4 } })),
  apiUpdateTask: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  apiDeleteTask: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
}));

describe('useTasks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filters tasks by assignee', () => {
    const { result } = renderHook(() => useTasks());
    expect(result.current.visibleTasks).toHaveLength(3);
    act(() => result.current.setAssigneeFilter('7'));
    expect(result.current.visibleTasks.map((task) => task.title)).toEqual(['Task C']);
  });

  it('creates a task from the dialog form and closes it', async () => {
    const api = require('../../lib/api');
    const { result } = renderHook(() => useTasks());
    act(() => result.current.openCreate());
    expect(result.current.creating).toBe(true);
    act(() => result.current.setEditForm({ ...result.current.editForm, title: 'New Task', priority: 'high' }));

    await act(async () => {
      await result.current.createTask({ preventDefault: () => {} });
    });

    expect(api.apiCreateTask).toHaveBeenCalledWith(expect.objectContaining({ family_id: 1, title: 'New Task', priority: 'high' }));
    expect(result.current.creating).toBe(false);
    expect(mockLoadTasks).toHaveBeenCalled();
  });

  describe('undo window', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('shows a task as done at once and sends it after the undo window', async () => {
      const api = require('../../lib/api');
      const { result } = renderHook(() => useTasks());

      await act(async () => { await result.current.toggleTask(mockContext.tasks[0]); });
      expect(result.current.visibleTasks.find((task) => task.id === 1).status).toBe('done');
      expect(api.apiUpdateTask).not.toHaveBeenCalled();
      expect(mockToastSuccess).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ onClick: expect.any(Function) }));

      await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
      expect(api.apiUpdateTask).toHaveBeenCalledWith(1, { status: 'done' });
    });

    it('undo keeps a completion from ever reaching the server', async () => {
      const api = require('../../lib/api');
      const { result } = renderHook(() => useTasks());

      await act(async () => { await result.current.toggleTask(mockContext.tasks[0]); });
      const undo = mockToastSuccess.mock.calls[0][1];
      act(() => undo.onClick());
      expect(result.current.visibleTasks.find((task) => task.id === 1).status).toBe('open');

      await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS * 2); });
      expect(api.apiUpdateTask).not.toHaveBeenCalled();
    });

    it('hides a deleted task at once and deletes it after the undo window', async () => {
      const api = require('../../lib/api');
      const { result } = renderHook(() => useTasks());

      act(() => result.current.deleteTask(mockContext.tasks[1]));
      expect(result.current.visibleTasks.find((task) => task.id === 2)).toBeUndefined();
      expect(api.apiDeleteTask).not.toHaveBeenCalled();

      await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
      expect(api.apiDeleteTask).toHaveBeenCalledWith(2);
    });

    it('keeps a completion without network as waiting and sends it once online', async () => {
      const api = require('../../lib/api');
      api.apiUpdateTask.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useTasks());

      await act(async () => { await result.current.toggleTask(mockContext.tasks[0]); });
      await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
      const waiting = result.current.visibleTasks.find((task) => task.id === 1);
      expect(waiting).toEqual(expect.objectContaining({ status: 'done', waiting: true }));

      // Tapping it meanwhile does not reopen it on the server.
      await act(async () => { await result.current.toggleTask(waiting); });
      expect(api.apiUpdateTask).toHaveBeenCalledTimes(1);

      await act(async () => { window.dispatchEvent(new Event('online')); });
      expect(api.apiUpdateTask).toHaveBeenCalledTimes(2);
      expect(api.apiUpdateTask).toHaveBeenLastCalledWith(1, { status: 'done' });
      expect(mockLoadTasks).toHaveBeenCalled();
      expect(result.current.visibleTasks.find((task) => task.id === 1).waiting).toBeUndefined();
    });

    it('sends what is still waiting when the view goes away', async () => {
      const api = require('../../lib/api');
      const { result, unmount } = renderHook(() => useTasks());

      act(() => result.current.deleteTask(mockContext.tasks[1]));
      await act(async () => { unmount(); });
      expect(api.apiDeleteTask).toHaveBeenCalledWith(2);
    });
  });

  it('says when a recurring task comes back (T7)', () => {
    mockContext.messages = { 'module.tasks.completed_next': 'Done · next on {date}', 'module.tasks.completed': 'Task done' };
    mockContext.lang = 'en';
    const { result } = renderHook(() => useTasks());
    const weekly = { id: 9, title: 'Bins', status: 'open', recurrence: 'weekly', due_date: '2026-09-30T00:00:00' };
    act(() => { result.current.toggleTask(weekly); });
    expect(mockToastSuccess.mock.calls.at(-1)[0]).toBe('Done · next on Wed, 10/7');
    act(() => { result.current.toggleTask({ ...weekly, id: 10, recurrence: null }); });
    expect(mockToastSuccess.mock.calls.at(-1)[0]).toBe('Task done');
    mockContext.messages = {};
  });

  it('reopens a done task right away', async () => {
    const api = require('../../lib/api');
    const { result } = renderHook(() => useTasks());

    await act(async () => { await result.current.toggleTask(mockContext.tasks[1]); });

    expect(api.apiUpdateTask).toHaveBeenCalledWith(2, { status: 'open' });
    expect(mockLoadTasks).toHaveBeenCalled();
  });

  it('postpones a task and offers to move it back', async () => {
    const api = require('../../lib/api');
    const { result } = renderHook(() => useTasks());
    const task = { id: 1, title: 'Task A', status: 'open', due_date: '2026-09-29T18:30:00', due_is_date: false };

    await act(async () => { await result.current.postponeTask(task, 'tomorrow'); });
    expect(api.apiUpdateTask).toHaveBeenCalledWith(1, expect.objectContaining({ due_is_date: false }));
    expect(api.apiUpdateTask.mock.calls[0][1].due_date).toMatch(/T18:30:00$/);

    const undo = mockToastSuccess.mock.calls[0][1];
    await act(async () => { await undo.onClick(); });
    expect(api.apiUpdateTask).toHaveBeenLastCalledWith(1, { due_date: '2026-09-29T18:30:00', due_is_date: false });
  });

  it('openEdit prefills the edit form from an existing task', () => {
    const { result } = renderHook(() => useTasks());
    const task = {
      id: 5,
      title: 'Edit me',
      description: 'original desc',
      priority: 'high',
      recurrence: 'weekly',
      assigned_to_user_id: 7,
      due_date: null,
    };

    act(() => result.current.openEdit(task));

    expect(result.current.editingTask).toBe(task);
    expect(result.current.editForm.title).toBe('Edit me');
    expect(result.current.editForm.description).toBe('original desc');
    expect(result.current.editForm.priority).toBe('high');
    expect(result.current.editForm.recurrence).toBe('weekly');
    expect(result.current.editForm.assigned_to_user_id).toBe('7');
  });

  it('preserves date-only precision when editing another task field', async () => {
    const api = require('../../lib/api');
    const { result } = renderHook(() => useTasks());
    act(() => result.current.openEdit({
      id: 6,
      title: 'Date-only task',
      description: '',
      priority: 'normal',
      recurrence: '',
      assigned_to_user_id: null,
      due_date: '2099-12-31T00:00:00',
      due_is_date: true,
    }));
    await act(async () => {
      await result.current.updateTask({ preventDefault: () => {} });
    });
    expect(api.apiUpdateTask).toHaveBeenCalledWith(6, expect.objectContaining({ due_is_date: true }));
  });

  it('closeEdit clears the edit state', () => {
    const { result } = renderHook(() => useTasks());
    act(() => result.current.openEdit({ id: 1, title: 'x', priority: 'normal' }));
    act(() => result.current.closeEdit());
    expect(result.current.editingTask).toBeNull();
    expect(result.current.editForm.title).toBe('');
  });

  it('updateTask posts the edited fields and closes the dialog', async () => {
    const api = require('../../lib/api');
    const { result } = renderHook(() => useTasks());

    act(() => result.current.openEdit({
      id: 9, title: 'Old', description: '', priority: 'normal', recurrence: '',
      assigned_to_user_id: null, due_date: null,
    }));
    act(() => result.current.setEditForm({
      ...result.current.editForm,
      title: 'New title',
      priority: 'high',
      assigned_to_user_id: '3',
    }));

    await act(async () => {
      await result.current.updateTask({ preventDefault: () => {} });
    });

    expect(api.apiUpdateTask).toHaveBeenCalledWith(9, expect.objectContaining({
      title: 'New title',
      priority: 'high',
      assigned_to_user_id: 3,
    }));
    expect(result.current.editingTask).toBeNull();
    expect(mockLoadTasks).toHaveBeenCalled();
  });

  it('updateTask does not wipe the dialog if the user switched to a different task mid-save', async () => {
    const api = require('../../lib/api');
    let resolveSave;
    api.apiUpdateTask.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSave = () => resolve({ ok: true, data: {} }); }),
    );
    const { result } = renderHook(() => useTasks());

    act(() => result.current.openEdit({
      id: 1, title: 'A', description: '', priority: 'normal', recurrence: '',
      assigned_to_user_id: null, due_date: null,
    }));

    let savePromise;
    act(() => {
      savePromise = result.current.updateTask({ preventDefault: () => {} });
    });

    // User opens task B while task A's save is still in flight.
    act(() => result.current.openEdit({
      id: 2, title: 'B', description: '', priority: 'normal', recurrence: '',
      assigned_to_user_id: null, due_date: null,
    }));

    // Save for task A finishes.
    await act(async () => {
      resolveSave();
      await savePromise;
    });

    expect(result.current.editingTask).toEqual(expect.objectContaining({ id: 2 }));
    expect(result.current.editForm.title).toBe('B');
  });
});
