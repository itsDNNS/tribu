import { act, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useVisualViewport } from '../../hooks/useResponsiveUI';

describe('useVisualViewport keyboard detection', () => {
  let viewport;
  const originalViewport = window.visualViewport;

  beforeEach(() => {
    viewport = Object.assign(new EventTarget(), { height: 678, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 678 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport });
    document.body.innerHTML = '';
    document.body.classList.remove('ui-keyboard');
  });

  const resizeViewport = (height) => act(() => {
    viewport.height = height;
    viewport.dispatchEvent(new Event('resize'));
  });

  test('a fold that briefly shrinks the viewport does not hide the bottom navigation', () => {
    renderHook(() => useVisualViewport());
    // While an iPhone Duo folds, the last event can pair the cover height with the inner viewport height.
    resizeViewport(537);
    expect(document.body).not.toHaveClass('ui-keyboard');
  });

  test('the on-screen keyboard for a focused field still hides the bottom navigation', () => {
    renderHook(() => useVisualViewport());
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    resizeViewport(330);
    expect(document.body).toHaveClass('ui-keyboard');

    field.blur();
    resizeViewport(678);
    expect(document.body).not.toHaveClass('ui-keyboard');
  });
});
