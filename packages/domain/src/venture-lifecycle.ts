/**
 * Where a Venture is in its run, and where it may go from there.
 *
 * Here rather than in the API because both sides ask it — the server refuses an act the state does not
 * allow, and the screens decide which acts to draw at all — and because they had been answering
 * separately. There were fifteen bare comparisons on the server and nine more on the web, two of them
 * spelling the same three-way test under different names, and three different answers to whether a run
 * was on. A settled Venture once read "৳-১,৮৩,৩৫৯ to feed with" on the strength of one of them.
 *
 * Said here as well as in the schema because the database package depends on nothing; keep the two in
 * step, as the Animal's states and the Instance's are.
 */

/** Where a Venture is in its run. Exactly one at a time. */
export const VENTURE_STATES = [
  "open",
  "buying",
  "fattening",
  "selling",
  "settled",
  "cancelled",
] as const;
export type VentureState = (typeof VENTURE_STATES)[number];

/**
 * A Venture that is running: it holds animals, or is about to, and it spends money on them.
 *
 * The farm's own word, and the one the glossary uses of an Advance — taken only while a Venture is
 * running. Not the same as the list of runs a screen groups as current, which counts one still Open
 * as well: that one has spent nothing yet, so a figure about feeding it would mean nothing.
 */
export const RUNNING_STATES = ["buying", "fattening", "selling"] as const;
export type RunningState = (typeof RUNNING_STATES)[number];

/** Whether the run is on: money is going out and animals are standing. */
export const isRunning = (state: VentureState): state is RunningState =>
  (RUNNING_STATES as readonly VentureState[]).includes(state);

/** A Venture whose run is over, either way it ended. */
export const ENDED_STATES = ["settled", "cancelled"] as const;
export type EndedState = (typeof ENDED_STATES)[number];

/**
 * Whether the run is over: a settled Venture's books are closed and a cancelled one's money has gone
 * back. Neither takes an act that would move a figure somebody has already been paid on.
 */
export const hasEnded = (state: VentureState): state is EndedState =>
  (ENDED_STATES as readonly VentureState[]).includes(state);

/**
 * Whether there is still buying to do.
 *
 * What the Cattle Budget holds is only meaningful until buying closes; after that what it did not
 * spend is feeding money, as the glossary says of a Cattle Budget.
 */
export const isStillBuying = (state: VentureState): boolean =>
  state === "open" || state === "buying";

/**
 * Where a Venture may go from where it is — the route the farm takes it along on purpose.
 *
 * Buying reaches Selling as well as Fattening, because a Sale is what moves a Venture to Selling and
 * one may be recorded before the farm has said buying is over. Cancelled is reachable only from Open:
 * once a taka has bought an animal there is no returning capital and only capital.
 *
 * Settled is the one the farm does not move it to. `reachesSettledOnLastPayout` sets it when the last
 * payout against an approved Settlement goes out, and nothing there asks where the Venture stood — so
 * this row says where that is meant to happen, not where it is stopped from happening. Do not gate the
 * settling itself on this table without deciding that question first.
 */
const TRANSITIONS: Record<VentureState, readonly VentureState[]> = {
  open: ["buying", "cancelled"],
  buying: ["fattening", "selling"],
  fattening: ["selling"],
  selling: ["settled"],
  settled: [],
  cancelled: [],
};

/** Every state a Venture in this one may reach next. */
export const nextVentureStates = (
  from: VentureState
): readonly VentureState[] => TRANSITIONS[from];

/** Whether a Venture in one state may be moved to another. */
export const mayMoveTo = (from: VentureState, to: VentureState): boolean =>
  TRANSITIONS[from].includes(to);
