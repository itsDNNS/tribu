import { createPortal } from 'react-dom';

// Dialogs render at the end of the page, so the header and the phone's tab
// bar (outside the main column's stacking context) never cover them.
export function inBody(node) {
  if (typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
