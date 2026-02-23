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
});
