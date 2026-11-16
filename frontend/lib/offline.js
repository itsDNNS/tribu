// Offline per action (Tribu 2.0, D6): a check-off that cannot reach the
// server stays done on screen, is marked as waiting and is sent again once
// the network is back. Only a missing network waits; a server that answers
// with an error still fails right away.

export const OFFLINE_RETRY_MS = 15000;

export function isNetworkFailure(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  // fetch() rejects with a TypeError when no response arrives at all.
  return error instanceof TypeError;
}

// Resolves when the browser reports the network back, or after a while in
// case it never says so (a captive portal, a server that was briefly away).
export function waitForNetwork(retryMs = OFFLINE_RETRY_MS) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('online', done);
      resolve();
    };
    const timer = setTimeout(done, retryMs);
    window.addEventListener('online', done);
  });
}

// Runs `send` until it gets an answer. `onWaiting` is called before every
// wait for the network, so the caller can mark the action as waiting.
// Until it got through an action exists only in this page, so a reload would drop it.
let pendingActions = 0;

export function hasPendingActions() {
  return pendingActions > 0;
}

export async function sendWhenOnline(send, onWaiting) {
  pendingActions += 1;
  try {
    for (;;) {
      try {
        return await send();
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        onWaiting?.();
        await waitForNetwork();
      }
    }
  } finally {
    pendingActions -= 1;
  }
}
