import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickCaptureCard from '../../components/QuickCaptureCard';
import { apiCreateQuickCapture, apiConvertQuickCapture, apiDismissQuickCapture } from '../../lib/api';

jest.mock('../../lib/api', () => ({
  apiCreateQuickCapture: jest.fn(),
  apiConvertQuickCapture: jest.fn(),
  apiDismissQuickCapture: jest.fn(),
}));

const messages = {
  'module.dashboard.quick_capture_title': 'Quick capture',
  'module.dashboard.quick_capture_placeholder': 'Capture anything for later',
  'module.dashboard.quick_capture_save_inbox': 'Save to inbox',
  'module.dashboard.quick_capture_add_task': 'Add task',
  'module.dashboard.quick_capture_add_shopping': 'Add shopping',
  'module.dashboard.quick_capture_inbox_title': 'Inbox',
  'module.dashboard.quick_capture_inbox_empty': 'Nothing waiting for triage.',
  'module.dashboard.quick_capture_to_task': 'Task',
  'module.dashboard.quick_capture_to_shopping': 'Shopping',
  'module.dashboard.quick_capture_dismiss': 'Dismiss',
};

function renderCard(overrides = {}) {
  const loadQuickCaptureInbox = jest.fn();
  const loadTasks = jest.fn();
  const loadShoppingLists = jest.fn();
  const loadActivity = jest.fn();
  render(
    <QuickCaptureCard
      familyId="7"
      inbox={overrides.inbox || []}
      messages={messages}
      loadQuickCaptureInbox={loadQuickCaptureInbox}
      loadTasks={loadTasks}
      loadShoppingLists={loadShoppingLists}
      loadActivity={loadActivity}
    />
  );
  return { loadQuickCaptureInbox, loadTasks, loadShoppingLists, loadActivity };
}

describe('QuickCaptureCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures text to the inbox and refreshes the inbox', async () => {
    apiCreateQuickCapture.mockResolvedValue({ ok: true, data: { destination: 'inbox' } });
    const { loadQuickCaptureInbox } = renderCard();

    fireEvent.change(screen.getByPlaceholderText('Capture anything for later'), { target: { value: 'Bring sports shoes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to inbox' }));

    await waitFor(() => expect(apiCreateQuickCapture).toHaveBeenCalledWith({
      family_id: '7',
      text: 'Bring sports shoes',
      destination: 'inbox',
    }));
    expect(loadQuickCaptureInbox).toHaveBeenCalledWith('7');
    expect(screen.getByPlaceholderText('Capture anything for later')).toHaveValue('');
  });

  it('routes quick text directly to tasks and shopping', async () => {
    apiCreateQuickCapture.mockResolvedValue({ ok: true, data: {} });
    const { loadTasks, loadShoppingLists, loadActivity } = renderCard();

    fireEvent.change(screen.getByPlaceholderText('Capture anything for later'), { target: { value: 'Pay school lunch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(apiCreateQuickCapture).toHaveBeenCalledWith({ family_id: '7', text: 'Pay school lunch', destination: 'task' }));
    expect(loadTasks).toHaveBeenCalledWith('7');
    expect(loadActivity).toHaveBeenCalledWith('7');

    fireEvent.change(screen.getByPlaceholderText('Capture anything for later'), { target: { value: 'Milk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add shopping' }));
    await waitFor(() => expect(apiCreateQuickCapture).toHaveBeenLastCalledWith({ family_id: '7', text: 'Milk', destination: 'shopping' }));
    expect(loadShoppingLists).toHaveBeenCalledWith('7');
  });

  it('triages inbox items', async () => {
    apiConvertQuickCapture.mockResolvedValue({ ok: true, data: {} });
    apiDismissQuickCapture.mockResolvedValue({ ok: true, data: {} });
    const { loadQuickCaptureInbox, loadTasks } = renderCard({ inbox: [{ id: 3, text: 'Book dentist' }] });

    expect(screen.getByText('Book dentist')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Task' }));
    await waitFor(() => expect(apiConvertQuickCapture).toHaveBeenCalledWith(3, { destination: 'task' }));
    expect(loadTasks).toHaveBeenCalledWith('7');
    expect(loadQuickCaptureInbox).toHaveBeenCalledWith('7');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(apiDismissQuickCapture).toHaveBeenCalledWith(3));
  });
});
