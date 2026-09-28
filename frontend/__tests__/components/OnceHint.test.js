import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OnceHint from '../../components/OnceHint';

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({ messages: { 'module.hints.got_it': 'Got it' } }),
}));

function pointer(coarse) {
  window.matchMedia = jest.fn().mockReturnValue({ matches: coarse });
}

describe('OnceHint', () => {
  beforeEach(() => localStorage.clear());

  it('shows once until someone closes it', () => {
    pointer(true);
    const { unmount } = render(<OnceHint id="tasks_swipe" text="Swipe to finish" touchOnly />);
    expect(screen.getByRole('note')).toHaveTextContent('Swipe to finish');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    unmount();

    render(<OnceHint id="tasks_swipe" text="Swipe to finish" touchOnly />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('keeps swipe tips away from mouse users', () => {
    pointer(false);
    render(<OnceHint id="shopping_swipe" text="Swipe right" touchOnly />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
