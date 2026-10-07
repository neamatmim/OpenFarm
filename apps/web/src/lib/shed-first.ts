/**
 * The screens a Shed Phone opens first — the day's work, today's list, the PIN pad, what is waiting to send — which are
 * drawn with the farm's shed words alone. Every other page waits for the desk's words (`@OpenFarm/i18n`'s
 * `loadDeskWords`), which a Shed Phone fetches once its first screen is drawn.
 */
const SHED_FIRST = ["/work", "/today", "/shed-phone", "/outbox"] as const;

/** Whether this path is one of a Shed Phone's first screens, drawn before the desk's words arrive. */
export const isShedFirst = (pathname: string): boolean =>
  SHED_FIRST.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
