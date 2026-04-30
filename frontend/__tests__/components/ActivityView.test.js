import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActivityView from '../../components/ActivityView';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

const messages = {
  'module.activity.title': 'Activity history',
  'module.activity.subtitle': 'See the latest changes in your household.',
  'module.dashboard.activity_title': 'Recent activity',
  'module.dashboard.activity_empty': 'No household activity yet.',
  'module.dashboard.activity_unknown_actor': 'Someone',
};

describe('ActivityView', () => {
  beforeEach(() => {
    mockAppState = {
      activity: [],
      messages,
      lang: 'en',
    };
  });

  it('shows household activity as a dedicated history view', () => {
    mockAppState = {
      ...mockAppState,
      activity: [
        {
          id: 1,
          actor_display_name: 'Dennis',
          summary: 'Dennis completed task "Pay school lunch"',
          created_at: '2026-04-29T10:00:00Z',
        },
      ],
    };

    render(<ActivityView />);

    expect(screen.getByRole('heading', { name: 'Activity history' })).toBeVisible();
    expect(screen.getByText('See the latest changes in your household.')).toBeVisible();
    const feed = screen.getByRole('region', { name: 'Recent activity' });
    expect(within(feed).getByText('Dennis completed task "Pay school lunch"')).toBeVisible();
  });
});
