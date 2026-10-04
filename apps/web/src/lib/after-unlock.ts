// Where a Shed Phone goes once somebody has entered their PIN again.

/** What the PIN screen is told when the phone locks under somebody: the page they were on, and who they were. */
export interface LockedOn {
  back?: string;
  for?: string;
}

/** A path inside the farm's app, safe to send somebody back to: never another site, and never the PIN screen itself. */
export const insideTheApp = (value: unknown): string | undefined =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.startsWith("/shed-phone")
    ? value
    : undefined;

/**
 * Back to the page the phone locked on — the cow half milked, the board half walked — when the person entering their PIN
 * is the one it locked under; the day's work for anybody else, whose page that was not.
 */
export const afterUnlock = (locked: LockedOn, userId: string): string =>
  locked.back && locked.for === userId ? locked.back : "/work";
