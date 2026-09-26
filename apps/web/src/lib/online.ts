import { useSyncExternalStore } from "react";

/** Tells the page when the phone goes off or back on the network. */
const listen = (changed: () => void) => {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
};

/** Whether the phone is on the network, as the browser knows it; on it while the server writes the page. */
export const useOnline = (): boolean =>
  useSyncExternalStore(
    listen,
    () => navigator.onLine,
    () => true
  );
