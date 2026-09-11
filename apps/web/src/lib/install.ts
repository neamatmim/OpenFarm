/**
 * Asks the browser to keep this app's storage rather than evicting it when the phone runs
 * short. A barn phone's Outbox is the only copy of a morning's work until it syncs, so
 * eviction is data loss; the browser can still say no, and the caller is told.
 */
export const keepStorage = async (): Promise<boolean> => {
  if (!navigator.storage?.persist) {
    return false;
  }
  try {
    if (await navigator.storage.persisted()) {
      return true;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

/** Registers the service worker that lets the app open with no signal. */
export const installShell = async (): Promise<void> => {
  if (!navigator.serviceWorker) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // No service worker means no offline shell; the app still works with signal, and the
    // Outbox — which is what protects the work — does not depend on it.
  }
};
