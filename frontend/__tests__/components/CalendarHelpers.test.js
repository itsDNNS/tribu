import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { EventCard, mapsLinksForLocation } from '../../components/calendar/CalendarHelpers';

jest.mock('../../lib/i18n', () => ({
  t: (_messages, key) => ({
    'module.calendar.open_google_maps': 'Open in Google Maps',
    'module.calendar.open_openstreetmap': 'Open in OpenStreetMap',
    'aria.delete_event': 'Delete event: {title}',
    'aria.edit_event': 'Edit event: {title}',
  }[key] || key),
}));

describe('calendar location helpers', () => {
  it('builds route planning URLs without requiring an API key', () => {
    const links = mapsLinksForLocation('Sports Park, Field 2');

    expect(links.google).toBe('https://www.google.com/maps/search/?api=1&query=Sports%20Park%2C%20Field%202');
    expect(links.openStreetMap).toBe('https://www.openstreetmap.org/search?query=Sports%20Park%2C%20Field%202');
  });

  it('shows the location and map links on event cards', () => {
    render(
      <EventCard
        ev={{
          id: 7,
          title: 'Football practice',
          starts_at: '2026-05-12T16:00:00',
          location: 'Sports Park, Field 2',
        }}
        index={0}
        messages={{}}
        lang="en"
        timeFormat="24h"
        members={[]}
      />,
    );

    expect(screen.getByText('Sports Park, Field 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Sports%20Park%2C%20Field%202',
    );
    expect(screen.getByRole('link', { name: 'Open in OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/search?query=Sports%20Park%2C%20Field%202',
    );
  });
});
