import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ModalDialog from '../../components/ModalDialog';
import ConfirmDialog from '../../components/ConfirmDialog';

beforeAll(() => {
  window.PointerEvent = MouseEvent;
});

// jsdom lays nothing out: the dialog's box is 0x0 at the origin, so (50, 50) is on the backdrop.
const outside = { clientX: 50, clientY: 50 };

function renderDialog(props = {}) {
  const onClose = jest.fn();
  render(
    <ModalDialog aria-label="Edit" onClose={onClose} {...props}>
      <input aria-label="Name" />
    </ModalDialog>,
  );
  return { onClose, dialog: screen.getByRole('dialog', { name: props['aria-label'] || 'Edit' }) };
}

const cancel = (dialog) => fireEvent(dialog, new Event('cancel', { cancelable: true }));

describe('ModalDialog', () => {
  it('closes on a click that starts and ends on the backdrop', () => {
    const { onClose, dialog } = renderDialog();
    fireEvent.pointerDown(dialog, outside);
    fireEvent.click(dialog, outside);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when a text selection started inside ends on the backdrop', () => {
    const { onClose, dialog } = renderDialog();
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Name' }), outside);
    fireEvent.click(dialog, outside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before Escape or an outside click discards typed input', () => {
    const { onClose, dialog } = renderDialog();
    fireEvent.input(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Oma' } });

    cancel(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(screen.queryByRole('dialog', { name: 'discard_changes_title' })).toBeNull();

    fireEvent.pointerDown(dialog, outside);
    fireEvent.click(dialog, outside);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'discard_changes_confirm' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes a pristine dialog on Escape at once, and never while busy', () => {
    const { onClose, dialog } = renderDialog({ busy: true });
    cancel(dialog);
    expect(onClose).not.toHaveBeenCalled();
    const pristine = renderDialog({ 'aria-label': 'Other' });
    cancel(pristine.dialog);
    expect(pristine.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmDialog', () => {
  it('starts on Cancel when the action is destructive', () => {
    render(<ConfirmDialog title="Delete?" confirmLabel="Delete" confirmDanger onConfirm={jest.fn()} onCancel={jest.fn()} messages={{ cancel: 'Cancel' }} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('ignores Escape while the confirmed request is running', async () => {
    let finish;
    const onCancel = jest.fn();
    render(<ConfirmDialog title="Delete?" confirmLabel="Delete" onConfirm={() => new Promise((resolve) => { finish = resolve; })} onCancel={onCancel} messages={{ cancel: 'Cancel' }} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    cancel(screen.getByRole('dialog', { name: 'Delete?' }));
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => finish());
    cancel(screen.getByRole('dialog', { name: 'Delete?' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
