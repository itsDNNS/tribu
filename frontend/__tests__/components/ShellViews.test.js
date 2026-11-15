import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ViewLoading } from '../../components/shell/views';

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    messages: {
      loading: 'Loading…',
      view_load_error: 'This page could not be loaded.',
      view_load_retry: 'Try again',
    },
  }),
}));

test('a loading area is announced as busy', () => {
  render(<ViewLoading isLoading error={null} retry={jest.fn()} />);
  expect(screen.getByRole('status', { name: 'Loading…' })).toHaveAttribute('aria-busy', 'true');
});

test('an area that could not be fetched offers a retry and retries when the network is back', () => {
  const retry = jest.fn();
  const { unmount } = render(<ViewLoading error={new Error('ChunkLoadError')} retry={retry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('This page could not be loaded.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
  act(() => { window.dispatchEvent(new Event('online')); });
  expect(retry).toHaveBeenCalledTimes(2);
  unmount();
  window.dispatchEvent(new Event('online'));
  expect(retry).toHaveBeenCalledTimes(2);
});
