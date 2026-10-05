// A Pay-in Note (ADR 0018): an Investor's word, from the portal, that they sent money towards one of their Agreements
// outside it. It moves no money and records no capital: the Owner checks the Venture Account and records the capital
// from it, or answers not found. The lists mirror the database's, for the screens; a test holds them together.

/** How the money went: by bank, or by Mobile Money sent into the Venture Account, which lands there as a bank credit. */
export const PAY_IN_WAYS = [
  "bank_transfer",
  "cheque",
  "deposit_slip",
  "mobile_money",
] as const;
export type PayInWay = (typeof PAY_IN_WAYS)[number];

/** Where a Pay-in Note stands: waiting for the Owner, or received, not found, withdrawn or closed. */
export const PAY_IN_NOTE_STATES = [
  "waiting",
  "received",
  "not_found",
  "withdrawn",
  "closed",
] as const;
export type PayInNoteState = (typeof PAY_IN_NOTE_STATES)[number];

/** Why the farm closed a note nobody answered. */
export const PAY_IN_CLOSE_REASONS = [
  "nothing_owed",
  "venture_takes_no_capital",
  "investor_retired",
] as const;
export type PayInCloseReason = (typeof PAY_IN_CLOSE_REASONS)[number];

/** The reference as long as a bank or a provider prints one, and room to spare. */
export const PAY_IN_REFERENCE_MOST = 120;

/** The Owner's line to the Investor for a note not found. */
export const PAY_IN_LINE_MOST = 300;

/** A note the Owner has still to look at: the only one its Investor may change or withdraw. */
export const isWaitingNote = (state: PayInNoteState): boolean =>
  state === "waiting";

/**
 * How much a new note may say was sent towards one Agreement: what it still owes, less what its other notes still
 * waiting already say. Two notes for the same transfer would otherwise promise more than the paper — and each one the
 * Owner received would leave the other waiting for money that is not coming.
 */
export const roomForANote = (standing: {
  /** What the Agreement may still take now, as the capital form counts it. */
  owedMoney: number;
  /** What its notes still waiting say, the one being changed left out. */
  waitingMoney: number;
}): number => Math.max(0, standing.owedMoney - standing.waitingMoney);
