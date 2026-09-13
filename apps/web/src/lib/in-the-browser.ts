import { useSyncExternalStore } from "react";

/** Whether the page is in the browser never changes once it is, so there is nothing to subscribe to. */
const nothingToWatch = () => () => {
  // Nothing was subscribed, so there is nothing to let go of.
};

/**
 * False while the page the server sent is being taken over, true from then on. What only the browser knows — who
 * is signed in, what this phone has kept — is drawn once this is true: drawn on the first pass, it makes the page
 * the server sent and the page the browser draws disagree, and React throws the whole page away, cancelling every
 * request it had started.
 */
export const useInTheBrowser = (): boolean =>
  useSyncExternalStore(
    nothingToWatch,
    () => true,
    () => false
  );
