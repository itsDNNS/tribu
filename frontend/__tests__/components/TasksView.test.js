import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TasksView from '../../components/TasksView';

const mockToggleTask = jest.fn();
const mockDeleteTask = jest.fn();
const mockPostponeTask = jest.fn();
const mockOpenEdit = jest.fn();
const mockOpenCreate = jest.fn();
const mockSetAssigneeFilter = jest.fn();
let mockIsChild = false;

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    members: [{ user_id: 10, display_name: 'Max' }, { user_id: 11, display_name: 'Anna' }],
    messages: {
      'module.tasks.name': 'Aufgaben',
      'module.tasks.all': 'Alle',
      'module.tasks.done': 'Erledigt',
      'module.tasks.overdue': 'Überfällig',
      'module.tasks.group_today': 'Heute',
      'module.tasks.group_upcoming': 'Demnächst',
      'module.tasks.group_no_date': 'Ohne Datum',
      'module.tasks.priority.high': 'Hoch',
      'module.tasks.recurrence.weekly': 'Wöchentlich',
      'module.tasks.new_task': 'Neue Aufgabe',
      'module.tasks.postpone': 'Verschieben',
      'module.tasks.postpone_tomorrow': 'Morgen',
      'module.tasks.actions': 'Aktionen für {title}',
      'module.tasks.edit': 'Bearbeiten',
      'module.tasks.delete_task': 'Aufgabe löschen',
      'module.tasks.filter_assignee': 'Nach Person filtern',
      'aria.mark_task': 'Aufgabe abhaken: {title}',
      'aria.edit_task': 'Aufgabe bearbeiten: {title}',
    },
    lang: 'de',
    timeFormat: '24h',
    isChild: mockIsChild,
  }),
}));

jest.mock('../../hooks/useTasks', () => ({
  useTasks: () => ({
    assigneeFilter: '',
    setAssigneeFilter: mockSetAssigneeFilter,
    visibleTasks: [
      { id: 1, title: 'Buy milk', status: 'open', priority: 'normal', description: 'From the store' },
      { id: 2, title: 'Clean house', status: 'done', priority: 'high', recurrence: 'weekly', assigned_to_user_id: 10 },
      { id: 3, title: 'Date only', status: 'open', priority: 'low', due_date: '2099-12-31T00:00:00', due_is_date: true },
      { id: 4, title: 'Late one', status: 'open', priority: 'high', due_date: '2000-01-01T18:00:00', recurrence: 'weekly', assigned_to_user_id: 11 },
    ],
    toggleTask: mockToggleTask,
    deleteTask: mockDeleteTask,
    postponeTask: mockPostponeTask,
    editingTask: null,
    creating: false,
    editForm: {},
    setEditForm: jest.fn(),
    openCreate: mockOpenCreate,
    openEdit: mockOpenEdit,
    closeEdit: jest.fn(),
    createTask: jest.fn(),
    updateTask: jest.fn(),
  }),
}));

// The action sheet uses <dialog>, which jsdom does not implement.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; };
});

describe('TasksView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsChild = false;
  });

  it('groups open tasks by due date and folds the done ones away', () => {
    render(<TasksView />);
    const groups = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(groups).toEqual(['Überfällig', 'Demnächst', 'Ohne Datum', 'Erledigt']);
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.queryByText('Clean house')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Erledigt/ }));
    expect(screen.getByText('Clean house')).toBeInTheDocument();
  });

  it('keeps rows calm: priority only when high, dates without midnight, no description', () => {
    render(<TasksView />);
    const late = screen.getByText('Late one').closest('.task-row');
    expect(late).toHaveTextContent('Hoch');
    expect(late).toHaveTextContent('Wöchentlich');
    expect(late.querySelector('.task-row-due.overdue')).toBeInTheDocument();
    const dateOnly = screen.getByText('Date only').closest('.task-row');
    expect(dateOnly).not.toHaveTextContent(/Niedrig|Low/);
    expect(dateOnly.querySelector('.task-row-due')).not.toHaveTextContent(/00:00|12:00 AM/);
    expect(screen.queryByText('From the store')).not.toBeInTheDocument();
    expect(document.querySelector('.task-edit-btn, .task-delete-btn')).toBeNull();
  });

  it('checks a task, opens it for editing and offers postpone, edit and delete', () => {
    render(<TasksView />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Aufgabe abhaken: Buy milk' }));
    expect(mockToggleTask).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

    fireEvent.click(screen.getByRole('button', { name: 'Aufgabe bearbeiten: Buy milk' }));
    expect(mockOpenEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen für Buy milk' }));
    const sheet = screen.getByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /Morgen/ }));
    expect(mockPostponeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'tomorrow');

    fireEvent.click(screen.getByRole('button', { name: 'Aktionen für Buy milk' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Aufgabe löschen/ }));
    expect(mockDeleteTask).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('filters by person and creates tasks from one button', () => {
    render(<TasksView />);
    fireEvent.click(screen.getByRole('button', { name: /Anna/ }));
    expect(mockSetAssigneeFilter).toHaveBeenCalledWith('11');
    fireEvent.click(screen.getByRole('button', { name: /Neue Aufgabe/ }));
    expect(mockOpenCreate).toHaveBeenCalled();
    expect(document.querySelector('.quick-add-input')).toBeNull();
  });

  it('lets children tick off tasks but not edit, postpone or create', () => {
    mockIsChild = true;
    render(<TasksView />);
    expect(screen.getByRole('checkbox', { name: 'Aufgabe abhaken: Buy milk' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aufgabe bearbeiten: Buy milk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aktionen für Buy milk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Neue Aufgabe/ })).not.toBeInTheDocument();
  });

  it('opens the task dialog when "New task" comes from the + sheet', () => {
    const handled = jest.fn();
    render(<TasksView createRequest={{ kind: 'task', id: 1 }} onCreateHandled={handled} />);
    expect(mockOpenCreate).toHaveBeenCalled();
    expect(handled).toHaveBeenCalled();
  });
});
