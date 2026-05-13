import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TasksView from '../../components/TasksView';

const mockToggleTask = jest.fn();
const mockDeleteTask = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    familyId: '1',
    families: [{ family_id: 1, family_name: 'TestFamily' }],
    members: [{ user_id: 10, display_name: 'Max' }],
    tokens: { surface: '#fff', border: '#eee', muted: '#999', primary: '#4f46e5', text: '#111', sidebar: '#fff', sidebarActive: '#eee', primaryText: '#fff' },
    messages: {
      'module.tasks.name': 'Aufgaben',
      'module.tasks.all': 'Alle',
      'module.tasks.open': 'Offen',
      'module.tasks.done': 'Erledigt',
      'module.tasks.title': 'Titel',
      'module.tasks.description': 'Beschreibung',
      'module.tasks.add': 'Hinzufügen',
      'module.tasks.unassigned': 'Nicht zugewiesen',
      'module.tasks.no_tasks': 'Keine Aufgaben',
      'module.tasks.overdue': 'Überfällig',
      'module.tasks.priority.low': 'Niedrig',
      'module.tasks.priority.normal': 'Normal',
      'module.tasks.priority.high': 'Hoch',
      'module.tasks.recurrence.none': 'Keine',
      'module.tasks.recurrence.daily': 'Täglich',
      'module.tasks.recurrence.weekly': 'Wöchentlich',
      'module.tasks.recurrence.monthly': 'Monatlich',
      'module.tasks.recurrence.yearly': 'Jährlich',
      'module.tasks.recurrence.monthly_first_monday': 'Erster Montag monatlich',
      'module.tasks.recurrence.monthly_first_tuesday': 'Erster Dienstag monatlich',
      'module.tasks.recurrence.monthly_first_wednesday': 'Erster Mittwoch monatlich',
      'module.tasks.recurrence.monthly_first_thursday': 'Erster Donnerstag monatlich',
      'module.tasks.recurrence.monthly_first_friday': 'Erster Freitag monatlich',
      'module.tasks.recurrence.monthly_first_saturday': 'Erster Samstag monatlich',
      'module.tasks.recurrence.monthly_first_sunday': 'Erster Sonntag monatlich',
      'module.tasks.refine': 'Aufgaben filtern und sortieren',
      'module.tasks.filter_assignee': 'Nach Person filtern',
      'module.tasks.filter_assignee_all': 'Alle Personen',
      'module.tasks.filter_priority': 'Nach Priorität filtern',
      'module.tasks.filter_priority_all': 'Alle Prioritäten',
      'module.tasks.sort': 'Aufgaben sortieren',
      'module.tasks.sort.created': 'Neueste zuerst',
      'module.tasks.sort.priority': 'Priorität',
      'module.tasks.sort.assignee': 'Person',
      'module.tasks.due_today': 'Heute fällig',
      'module.tasks.mine': 'Meine',
      'module.tasks.filters': 'Filter',
      'module.tasks.new_task': 'Neue Aufgabe',
    },
    ui: {
      card: { background: '#fff', borderColor: '#eee', color: '#111', borderRadius: 14, padding: 16, border: '1px solid #eee' },
      smallCard: { borderColor: '#eee', borderRadius: 10, padding: 10, border: '1px solid #eee', display: 'grid', gap: 4 },
      input: { border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 12px', fontSize: 16 },
      primaryBtn: { border: 'none', borderRadius: 10, padding: '10px 14px', background: '#4f46e5', color: '#fff', cursor: 'pointer' },
      secondaryBtn: { border: '1px solid #d1d5db', borderRadius: 10, padding: '9px 12px', background: '#fff', cursor: 'pointer' },
    },
    isMobile: false,
    me: { user_id: 10, display_name: 'Max' },
    switchFamily: jest.fn(),
  }),
}));

jest.mock('../../hooks/useTasks', () => ({
  useTasks: () => ({
    taskFilter: 'all',
    setTaskFilter: jest.fn(),
    priorityFilter: '',
    setPriorityFilter: jest.fn(),
    assigneeFilter: '',
    setAssigneeFilter: jest.fn(),
    taskSort: 'created',
    setTaskSort: jest.fn(),
    taskTitle: '',
    setTaskTitle: jest.fn(),
    taskDesc: '',
    setTaskDesc: jest.fn(),
    taskDueDate: '',
    setTaskDueDate: jest.fn(),
    taskPriority: 'normal',
    setTaskPriority: jest.fn(),
    taskRecurrence: '',
    setTaskRecurrence: jest.fn(),
    taskAssignee: '',
    setTaskAssignee: jest.fn(),
    filteredTasks: [
      { id: 1, title: 'Buy milk', status: 'open', priority: 'normal', description: 'From the store' },
      { id: 2, title: 'Clean house', status: 'done', priority: 'high', description: null, recurrence: 'weekly', assigned_to_user_id: 10 },
    ],
    createTask: jest.fn((e) => e.preventDefault()),
    toggleTask: mockToggleTask,
    deleteTask: mockDeleteTask,
  }),
}));

describe('TasksView', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the compact task command card with priority filters', () => {
    const { container } = render(<TasksView />);

    expect(container.querySelector('.tasks-card-header')).toBeInTheDocument();
    expect(container.querySelector('.tasks-wrapper')).toBeInTheDocument();
    expect(container.querySelector('.tasks-filter-tabs')).toHaveTextContent('Heute fällig');
    expect(container.querySelector('.tasks-filter-tabs')).toHaveTextContent('Meine');
    expect(container.querySelector('.tasks-new-btn')).toHaveTextContent('Neue Aufgabe');
  });

  it('renders task list', () => {
    render(<TasksView />);
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
    expect(screen.getByText('Clean house')).toBeInTheDocument();
  });

  it('shows task description', () => {
    render(<TasksView />);
    expect(screen.getByText('From the store')).toBeInTheDocument();
  });

  it('shows assignee initial badge', () => {
    render(<TasksView />);
    const badge = screen.getByTitle('Max');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('M');
  });

  it('shows recurrence badge', () => {
    render(<TasksView />);
    const matches = screen.getAllByText('Wöchentlich');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders task checkboxes for toggling', () => {
    const { container } = render(<TasksView />);
    const checkboxes = container.querySelectorAll('.task-checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].classList.contains('checked')).toBe(false);
    expect(checkboxes[1].classList.contains('checked')).toBe(true);
  });

  it('calls toggleTask on checkbox click', () => {
    const { container } = render(<TasksView />);
    const checkboxes = container.querySelectorAll('.task-checkbox');
    fireEvent.click(checkboxes[0]);
    expect(mockToggleTask).toHaveBeenCalledWith(1, 'open');
  });

  it('renders delete buttons', () => {
    const { container } = render(<TasksView />);
    const deleteButtons = container.querySelectorAll('.task-delete-btn');
    expect(deleteButtons).toHaveLength(2);
    // Delete now opens a ConfirmDialog; clicking the delete button sets confirmAction state
    fireEvent.click(deleteButtons[0]);
    // ConfirmDialog should now be rendered
    const confirmBtn = container.querySelector('.cal-dialog .btn-sm');
    expect(confirmBtn).toBeTruthy();
  });
});
