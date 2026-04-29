import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TemplatesView from '../../components/TemplatesView';
import {
  apiGetHouseholdTemplates,
  apiCreateHouseholdTemplate,
  apiUpdateHouseholdTemplate,
  apiDeleteHouseholdTemplate,
  apiApplyHouseholdTemplate,
} from '../../lib/api';

jest.mock('../../lib/api', () => ({
  apiGetHouseholdTemplates: jest.fn(),
  apiCreateHouseholdTemplate: jest.fn(),
  apiUpdateHouseholdTemplate: jest.fn(),
  apiDeleteHouseholdTemplate: jest.fn(),
  apiApplyHouseholdTemplate: jest.fn(),
}));

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

const messages = {
  'module.templates.name': 'Templates',
  'module.templates.subtitle': 'Reusable plans for your household.',
  'module.templates.gallery': 'Built-in gallery',
  'module.templates.custom': 'Your templates',
  'module.templates.builtin': 'Built-in',
  'module.templates.custom_badge': 'Custom',
  'module.templates.new': 'New template',
  'module.templates.name_label': 'Name',
  'module.templates.description_label': 'Description',
  'module.templates.task_title': 'Task title',
  'module.templates.task_offset': 'Days after start',
  'module.templates.shopping_name': 'Shopping item',
  'module.templates.shopping_spec': 'Amount/details',
  'module.templates.add_task': 'Add task',
  'module.templates.add_shopping': 'Add shopping item',
  'module.templates.save': 'Save template',
  'module.templates.cancel': 'Cancel',
  'module.templates.apply': 'Use template',
  'module.templates.edit': 'Edit',
  'module.templates.delete': 'Delete',
  'module.templates.target_date': 'Start date',
  'module.templates.shopping_list_name': 'Shopping list name',
  'module.templates.created': 'Template saved',
  'module.templates.applied': 'Template applied',
  'module.templates.deleted': 'Template deleted',
  'module.templates.empty': 'No custom templates yet.',
  'module.templates.loading': 'Loading templates…',
  'module.templates.error': 'Templates are unavailable right now.',
  'module.templates.adult_only': 'Only adults can manage templates.',
};

const templates = [
  {
    id: 'school-morning',
    name: 'School morning routine',
    description: 'Get ready calmly.',
    is_builtin: true,
    task_count: 2,
    shopping_count: 1,
    task_items: [{ title: 'Pack bag', description: '', priority: 'normal', days_offset: 0 }],
    shopping_items: [{ name: 'Lunch snacks', spec: '', category: 'School' }],
  },
  {
    id: 12,
    name: 'Weekend reset',
    description: 'Chores and groceries.',
    is_builtin: false,
    task_count: 1,
    shopping_count: 1,
    task_items: [{ title: 'Vacuum', description: '', priority: 'normal', days_offset: 0 }],
    shopping_items: [{ name: 'Trash bags', spec: '1 roll', category: 'Household' }],
  },
];

function setup(overrides = {}) {
  mockAppState = {
    familyId: 7,
    messages,
    isChild: false,
    ...overrides,
  };
  apiGetHouseholdTemplates.mockResolvedValue({ ok: true, data: templates });
  apiCreateHouseholdTemplate.mockResolvedValue({ ok: true, data: { ...templates[1], id: 13, name: 'New plan' } });
  apiUpdateHouseholdTemplate.mockResolvedValue({ ok: true, data: { ...templates[1], name: 'Updated plan' } });
  apiDeleteHouseholdTemplate.mockResolvedValue({ ok: true, data: {} });
  apiApplyHouseholdTemplate.mockResolvedValue({ ok: true, data: { created_task_count: 1, created_shopping_count: 1 } });
  return render(<TemplatesView />);
}

describe('TemplatesView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders built-in and custom templates with clear badges', async () => {
    setup();

    expect(await screen.findByRole('heading', { name: 'Templates' })).toBeInTheDocument();
    expect(apiGetHouseholdTemplates).toHaveBeenCalledWith(7);
    expect(screen.getByText('School morning routine')).toBeInTheDocument();
    expect(screen.getByText('Weekend reset')).toBeInTheDocument();
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText('Pack bag')).toBeInTheDocument();
    expect(screen.getByText('Lunch snacks')).toBeInTheDocument();
  });

  it('does not load templates for child members', () => {
    setup({ isChild: true });

    expect(screen.getByText('Only adults can manage templates.')).toBeInTheDocument();
    expect(apiGetHouseholdTemplates).not.toHaveBeenCalled();
  });

  it('creates, edits, applies, and deletes custom templates', async () => {
    setup();
    await screen.findByText('Weekend reset');

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Birthday party' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Prep tasks and shopping.' } });
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Order cake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    fireEvent.change(screen.getByLabelText('Shopping item'), { target: { value: 'Candles' } });
    fireEvent.change(screen.getByLabelText('Amount/details'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add shopping item' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(apiCreateHouseholdTemplate).toHaveBeenCalledWith(expect.objectContaining({
      family_id: 7,
      name: 'Birthday party',
      task_items: [expect.objectContaining({ title: 'Order cake' })],
      shopping_items: [expect.objectContaining({ name: 'Candles', spec: '10' })],
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Edit Weekend reset' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(apiUpdateHouseholdTemplate).toHaveBeenCalledWith(12, expect.objectContaining({ name: 'Updated plan' })));

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-05-04' } });
    fireEvent.change(screen.getByLabelText('Shopping list name'), { target: { value: 'Template groceries' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use template Weekend reset' }));
    await waitFor(() => expect(apiApplyHouseholdTemplate).toHaveBeenCalledWith(templates[1], expect.objectContaining({
      target_date: '2026-05-04',
      shopping_list_name: 'Template groceries',
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Weekend reset' }));
    await waitFor(() => expect(apiDeleteHouseholdTemplate).toHaveBeenCalledWith(12));
  });
});
