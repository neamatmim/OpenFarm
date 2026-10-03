import { toast as sonner } from "sonner";

type ErrorToast = typeof sonner.error;

/**
 * The app's toasts, as Sonner's, but an error waits to be read. Sonner's four seconds is right for "Saved" and wrong
 * for "Could not load" with Retry beside it: Carbon keeps a toast with an action until it is dismissed, Atlassian
 * never takes an error away on its own (docs/research/desktop-enterprise-design.md, section 11). So an error stays,
 * with a close button, until somebody closes it or acts on it.
 */
const error: ErrorToast = (message, data) =>
  sonner.error(message, {
    closeButton: true,
    duration: Number.POSITIVE_INFINITY,
    ...data,
  });

export const toast = Object.assign(
  (...args: Parameters<typeof sonner>) => sonner(...args),
  sonner,
  { error }
);
