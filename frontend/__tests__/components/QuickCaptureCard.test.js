import fs from 'fs';
import path from 'path';
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
  'module.dashboard.quick_capture_add_task': 'Add task',
  'module.dashboard.quick_capture_add_shopping': 'Add shopping',
  'module.dashboard.quick_event': 'Event',
  'module.dashboard.quick_meal': 'Meal',
  'module.dashboard.quick_note': 'Note',
  'module.dashboard.quick_capture_inbox_title': 'Inbox',
  'module.dashboard.quick_capture_inbox_count': '{count} inbox items',
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
  const setActiveView = jest.fn();
  const result = render(
    <QuickCaptureCard
      familyId="7"
      inbox={overrides.inbox || []}
      messages={messages}
      setActiveView={setActiveView}
      loadQuickCaptureInbox={loadQuickCaptureInbox}
      loadTasks={loadTasks}
      loadShoppingLists={loadShoppingLists}
      loadActivity={loadActivity}
    />
  );
  return { ...result, loadQuickCaptureInbox, loadTasks, loadShoppingLists, loadActivity, setActiveView };
}

describe('QuickCaptureCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures text to the inbox and refreshes the inbox', async () => {
    apiCreateQuickCapture.mockResolvedValue({ ok: true, data: { destination: 'inbox' } });
    const { loadQuickCaptureInbox } = renderCard();

    expect(screen.getByRole('textbox', { name: 'Capture anything for later' })).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText('Capture anything for later'), { target: { value: 'Bring sports shoes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));

    await waitFor(() => expect(apiCreateQuickCapture).toHaveBeenCalledWith({
      family_id: '7',
      text: 'Bring sports shoes',
      destination: 'inbox',
    }));
    expect(loadQuickCaptureInbox).toHaveBeenCalledWith('7');
    expect(screen.getByPlaceholderText('Capture anything for later')).toHaveValue('');
  });

  it('offers event and meal actions that open the existing views', () => {
    const { setActiveView } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Meal' }));

    expect(setActiveView).toHaveBeenCalledWith('calendar');
    expect(setActiveView).toHaveBeenCalledWith('meal_plans');
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
    const { container, loadQuickCaptureInbox, loadTasks } = renderCard({
      inbox: [
        null,
        { id: 3, text: 'Book dentist', status: 'open' },
        undefined,
        { id: 4, text: 'Done note', status: 'dismissed' },
      ],
    });

    expect(screen.queryByText('Book dentist')).not.toBeVisible();
    expect(container.querySelector('.quick-capture-inbox-summary')).toHaveTextContent('1');
    expect(container.querySelector('.quick-capture-inbox-title')).toHaveAttribute('aria-label', '1 inbox items');
    expect(screen.queryByText('Done note')).not.toBeInTheDocument();
    fireEvent.click(container.querySelector('.quick-capture-inbox-title'));
    expect(screen.getByText('Book dentist')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Task' }));
    await waitFor(() => expect(apiConvertQuickCapture).toHaveBeenCalledWith(3, { destination: 'task' }));
    expect(loadTasks).toHaveBeenCalledWith('7');
    expect(loadQuickCaptureInbox).toHaveBeenCalledWith('7');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(apiDismissQuickCapture).toHaveBeenCalledWith(3));
  });

  it('keeps the dashboard command capture in a single clean desktop row', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'styles', 'globals.css'), 'utf8');

    expect(css).toMatch(/\.quick-capture-form--command \{[^}]*grid-template-columns: minmax\(220px, 1fr\) auto;[^}]*align-items: center;/);
    expect(css).toMatch(/\.quick-capture-actions \{[^}]*flex-wrap: nowrap;[^}]*justify-content: flex-start;/);
    expect(css).toMatch(/\.bento-quick-capture \.bento-card-title \{[^}]*color: var\(--text-primary\);/);
    expect(css).toMatch(/\.quick-capture-inbox:not\(\[open\]\) \{[^}]*right: 16px;/);
    expect(css).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.quick-capture-inbox:not\(\[open\]\) \{ right: 12px; \}/);
    expect(css).toMatch(/\.quick-capture-inbox:not\(\[open\]\) \.quick-capture-inbox-label,[^}]*\.quick-capture-inbox:not\(\[open\]\) \.quick-capture-inbox-title::before \{ display: none;/);
    expect(css).not.toMatch(/\.bento-card-visual-quick/);
  });
});
