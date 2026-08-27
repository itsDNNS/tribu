import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskEditDialog from '../../components/TaskEditDialog';

describe('TaskEditDialog', () => {
  it('allows existing task titles through the shared 240 character contract', () => {
    render(
      <TaskEditDialog
        open
        onClose={jest.fn()}
        messages={{
          'module.tasks.edit_title': 'Edit task',
          'module.tasks.cancel': 'Cancel',
          'module.tasks.title': 'Title',
          'module.tasks.description': 'Description',
          'module.tasks.due': 'Due',
          'module.tasks.priority.normal': 'Normal',
          'module.tasks.priority.low': 'Low',
          'module.tasks.priority.high': 'High',
          'module.tasks.recurrence.none': 'None',
          'module.tasks.unassigned': 'Unassigned',
          'module.tasks.save': 'Save',
        }}
        members={[]}
        form={{
          title: 'T'.repeat(240),
          description: '',
          due_date: '',
          due_is_date: false,
          priority: 'normal',
          recurrence: '',
          assigned_to_user_id: '',
        }}
        setForm={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '240');
    expect(screen.getByLabelText('Title')).toHaveValue('T'.repeat(240));
  });
});
