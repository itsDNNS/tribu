import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HouseholdActivityFeed from '../../components/HouseholdActivityFeed';

const messages = {
  'module.dashboard.activity_title': 'Recent activity',
  'module.dashboard.activity_empty': 'No household activity yet.',
  'module.dashboard.activity_unknown_actor': 'Someone',
};

describe('HouseholdActivityFeed', () => {
  it('renders public activity entries without internal fields', () => {
    render(
      <HouseholdActivityFeed
        messages={messages}
        lang="en"
        activity={[
          {
            id: 7,
            actor_display_name: 'Dennis',
            summary: 'Dennis completed task "Pay school lunch"',
            created_at: '2026-04-29T10:00:00Z',
            object_id: 123,
            details: 'private detail should not render',
          },
        ]}
      />,
    );

    expect(screen.getByRole('region', { name: 'Recent activity' })).toBeInTheDocument();
    expect(screen.getByText('Dennis')).toBeInTheDocument();
    expect(screen.getByText('Dennis completed task "Pay school lunch"')).toBeInTheDocument();
    expect(screen.queryByText('private detail should not render')).not.toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();
  });

  it('renders calendar-related activity entries', () => {
    render(
      <HouseholdActivityFeed
        messages={messages}
        lang="en"
        activity={[
          {
            id: 8,
            actor_display_name: 'Alex',
            summary: 'Alex created calendar event "Piano lesson"',
            object_type: 'calendar_event',
            object_id: 456,
            created_at: '2026-05-01T15:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Alex created calendar event "Piano lesson"')).toBeInTheDocument();
    expect(screen.queryByText('calendar_event')).not.toBeInTheDocument();
    expect(screen.queryByText('456')).not.toBeInTheDocument();
  });

  it('renders an empty state', () => {
    render(<HouseholdActivityFeed messages={messages} activity={[]} />);
    expect(screen.getByText('No household activity yet.')).toBeInTheDocument();
  });
});
