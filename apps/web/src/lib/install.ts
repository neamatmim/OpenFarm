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

/**
 * Takes away any service worker this address has: the portal's own address runs none, keeping nothing on the phone to
 * open with (ADR 0009), and one left from an older visit would go on answering from what it kept.
 */
export const forgetShell = async (): Promise<void> => {
  if (!navigator.serviceWorker) {
    return;
  }
  try {
    const registered = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registered.map((one) => one.unregister()));
  } catch {
    // Nothing the page may reach: the wipe on signing out takes it instead.
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
