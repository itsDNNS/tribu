import { X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

function Toast({ id, message, type, action, exiting }) {
  const { dismiss } = useToast();

  return (
    <div
      className={`toast toast--${type}${exiting ? ' toast--exiting' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="toast__message">{message}</span>
      {action && (
        <button className="toast__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button
        className="toast__dismiss"
        onClick={() => dismiss(id)}
        aria-label="Dismiss"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} />
      ))}
    </div>
  );
}
