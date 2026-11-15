import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToastProvider, useToast } from '../../contexts/ToastContext';
import { ToastContainer } from '../../components/Toast';

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({ messages: { notifications: 'Benachrichtigungen', dismiss: 'Ausblenden', 'toast.actions_available': 'Aktionen verfügbar' } }),
}));

let api;
function Grab() {
  api = useToast();
  return null;
}

function setup() {
  render(
    <ToastProvider>
      <Grab />
      <ToastContainer />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  window.PointerEvent = MouseEvent;
});
afterEach(() => jest.useRealTimers());

test('the live region is there before any toast and announces only the text', () => {
  setup();
  const announcer = document.getElementById('a11y-announcer');
  expect(announcer).toHaveAttribute('aria-live', 'polite');
  expect(screen.getByRole('region', { name: 'Benachrichtigungen' })).toBeInTheDocument();

  act(() => { api.success('Gelöscht', { label: 'Rückgängig', onClick: jest.fn() }); });
  act(() => { jest.runOnlyPendingTimers(); });
  expect(announcer).toHaveTextContent('Gelöscht Aktionen verfügbar');
  expect(screen.getByRole('button', { name: 'Ausblenden' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).toBeNull();
});

test('a toast stays while it is hovered', () => {
  setup();
  act(() => { api.info('Gespeichert'); });
  const region = screen.getByRole('region', { name: 'Benachrichtigungen' });
  const toast = within(region).getByText('Gespeichert');

  fireEvent.pointerOver(toast);
  act(() => { jest.advanceTimersByTime(20000); });
  expect(region).toHaveTextContent('Gespeichert');

  fireEvent.pointerOut(toast, { relatedTarget: document.body });
  act(() => { jest.advanceTimersByTime(6000); });
  expect(region).not.toHaveTextContent('Gespeichert');
});
