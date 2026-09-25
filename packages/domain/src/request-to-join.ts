import { farmDayOf } from "./farm-clock";

/**
 * Where a Request to Join stands, and which of those places are still waiting on somebody.
 *
 * Here rather than in the API because both sides ask it: the server keeps one live Request per Investor per Venture,
 * and the portal decides whether to offer the form or the Request already made. Said here as well as in the schema,
 * because the database package depends on nothing; a test holds the two lists together.
 */

/** Where a Request to Join stands. Exactly one at a time. */
export const REQUEST_TO_JOIN_STATES = [
  "waiting",
  "come_and_sign",
  "not_this_time",
  "withdrawn",
  "signed",
  "closed",
] as const;
export type RequestToJoinState = (typeof REQUEST_TO_JOIN_STATES)[number];

/** A Request somebody is still waiting on: waiting for the Owner, or told to come and sign. At most one of these per
 *  Investor per Venture, and one the Investor may still withdraw. */
export const LIVE_REQUEST_STATES = [
  "waiting",
  "come_and_sign",
] as const satisfies readonly RequestToJoinState[];

/** Whether a Request in this state is still waiting on somebody. */
export const isLiveRequest = (state: RequestToJoinState): boolean =>
  LIVE_REQUEST_STATES.some((live) => live === state);

/** The longest note an Investor may send with a Request: a line for the Owner, such as when they can pay. */
export const REQUEST_NOTE_MOST = 300;

/** The longest line the Owner may send with "not this time". */
export const ANSWER_LINE_MOST = 300;

/** A Request that has been answered: told to come and sign, told not this time, or answered by a signed Agreement. */
export const ANSWERED_REQUEST_STATES = [
  "come_and_sign",
  "not_this_time",
  "signed",
] as const satisfies readonly RequestToJoinState[];

/** Whether a Request in this state has had its answer. */
export const isAnsweredRequest = (state: RequestToJoinState): boolean =>
  ANSWERED_REQUEST_STATES.some((answered) => answered === state);

/**
 * Whether a Venture is past its decide-by day, on the farm's own calendar. Its Floor question is then answered, so
 * nothing asked or promised now could change it: no Request is made, no yes is given, and it is not shown again.
 */
export const isPastDecideBy = (decideBy: string, now: Date): boolean =>
  farmDayOf(now) > decideBy;
