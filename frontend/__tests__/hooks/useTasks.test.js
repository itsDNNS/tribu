import { renderHook, act } from '@testing-library/react';
import { useTasks } from '../../hooks/useTasks';

const mockLoadTasks = jest.fn();
const mockContext = {
  tasks: [
    { id: 1, title: 'Task A', status: 'open', priority: 'normal' },
    { id: 2, title: 'Task B', status: 'done', priority: 'high' },
    { id: 3, title: 'Task C', status: 'open', priority: 'low' },
  ],
  familyId: '1',
  members: [],
  messages: {},
  loadTasks: mockLoadTasks,
};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockContext,
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn(), toast: jest.fn(), dismiss: jest.fn(), dismissAll: jest.fn() }),
}));

jest.mock('../../lib/api', () => ({
  apiCreateTask: jest.fn(() => Promise.resolve({ ok: true, data: { id: 4 } })),
  apiUpdateTask: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
  apiDeleteTask: jest.fn(() => Promise.resolve({ ok: true, data: {} })),
}));

describe('useTasks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filters tasks by default (open)', () => {
    const { result } = renderHook(() => useTasks());
    expect(result.current.filteredTasks).toHaveLength(2);
    expect(result.current.filteredTasks.every(t => t.status === 'open')).toBe(true);
  });

  it('shows all tasks when filter is "all"', () => {
    const { result } = renderHook(() => useTasks());
    act(() => result.current.setTaskFilter('all'));
    expect(result.current.filteredTasks).toHaveLength(3);
  });

  it('shows done tasks when filter is "done"', () => {
    const { result } = renderHook(() => useTasks());
    act(() => result.current.setTaskFilter('done'));
    expect(result.current.filteredTasks).toHaveLength(1);
    expect(result.current.filteredTasks[0].title).toBe('Task B');
  });

  it('resets form fields after successful create', async () => {
    const { result } = renderHook(() => useTasks());

    act(() => {
      result.current.setTaskTitle('New Task');
      result.current.setTaskDesc('Some desc');
    });

    await act(async () => {
      await result.current.createTask({ preventDefault: () => {} });
    });

    expect(result.current.taskTitle).toBe('');
    expect(result.current.taskDesc).toBe('');
    expect(mockLoadTasks).toHaveBeenCalled();
  });

  it('toggleTask calls apiUpdateTask with toggled status', async () => {
    const api = require('../../lib/api');
    const { result } = renderHook(() => useTasks());

    await act(async () => {
      await result.current.toggleTask(1, 'open');
    });

    expect(api.apiUpdateTask).toHaveBeenCalledWith(1, { status: 'done' });
    expect(mockLoadTasks).toHaveBeenCalled();
  });

  it('deleteTask calls apiDeleteTask', async () => {
    const api = require('../../lib/api');
    const { result } = renderHook(() => useTasks());

    await act(async () => {
      await result.current.deleteTask(2);
    });

    expect(api.apiDeleteTask).toHaveBeenCalledWith(2);
    expect(mockLoadTasks).toHaveBeenCalled();
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
