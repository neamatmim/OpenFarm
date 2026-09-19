import { farmDayOf } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { tell } from "./notice";
import { signedForEach, windUpEndsOn } from "./venture-store";

/**
 * Telling the Owner that a Venture's Investors are due their **অগ্রগতি**.
 *
 * Only the telling. It raises nothing to be claimed and completed, and sends nothing itself: producing
 * the paper is an **Export**, which is somebody's act and has to name who did it, so the Owner still sits
 * down and makes it. This is the farm remembering on her behalf, which is the whole of what story 79
 * asks for — "so that I hear at the moments that matter".
 *
 * A **Notice** rather than an SOP Instance, and the acceptance criteria say which: the Owner is *told*.
 * An Instance would have to be claimed, could go late, and would want a checker and a Pen it does not
 * have — and there is nothing to complete it against, because issuing a paper by hand is not yet a
 * recorded act. It goes in the **Digest** rather than as an Alert: a letter owed is the evening's post,
 * and a phone that buzzes for one is a phone nobody answers for a Withdrawal ending.
 */

/** The four moments an Investor hears at, as the notice's own id spells them. */
export type Occasion =
  | { kind: "month"; month: string }
  | { kind: "buying_closed" }
  | { kind: "first_sale" }
  | { kind: "wind_up" };

/**
 * What one telling is about: the Venture, and which occasion it is.
 *
 * A composite id, as a low-stock notice's is, because the unique index that stops a sweep saying the same
 * thing twice is on the notice's entity — so the occasion has to be *in* the id or February would never
 * be told about after January was.
 */
const noticeId = (ventureId: string, occasion: Occasion): string =>
  occasion.kind === "month"
    ? `${ventureId}:${occasion.month}`
    : `${ventureId}:${occasion.kind}`;

const said = (occasion: Occasion): string =>
  occasion.kind === "month" ? occasion.month : occasion.kind;

/** The Ventures whose Investors can still be owed anything: a Settled or Cancelled run tells nobody. */
const RUNNING = ["open", "buying", "fattening", "selling"] as const;

/**
 * Tells the Owner that one Venture's Investors are due their paper, once for that occasion ever.
 *
 * Silent for a Venture nobody has signed — there is nobody to send a paper to — and silent for one whose
 * run is over. Both are asked here rather than at each of the four call sites, so a fifth occasion cannot
 * forget them.
 */
export const tellTheOwnerAPaperIsDue = async (
  tx: Tx,
  farmId: string,
  venture: { id: string; name: string; state: string },
  occasion: Occasion,
  now: Date
): Promise<boolean> => {
  if (!(RUNNING as readonly string[]).includes(venture.state)) {
    return false;
  }
  const signed = await signedForEach(tx, farmId, [venture.id]);
  const investors = signed.get(venture.id)?.people ?? 0;
  if (investors === 0) {
    return false;
  }
  const told = await tell(
    tx,
    farmId,
    {
      kind: "investor_statement_due",
      about: { id: noticeId(venture.id, occasion) },
      facts: {
        ventureId: venture.id,
        venture: venture.name,
        investors,
        occasion: said(occasion),
      },
    },
    now
  );
  return told.length > 0;
};

/**
 * The two occasions the clock brings round, swept for every Venture still running: the month, and the day
 * the **Wind-up Period** starts.
 *
 * Idempotent, like everything else the day's turning does — the same month raises nothing the second time
 * the app is opened, because the notice's own id carries the month.
 */
export const tellAboutPapersDue = async (
  tx: Tx,
  farmId: string,
  now: Date,
  windUpDays: number
): Promise<number> => {
  const ventures = await tx.query.venture.findMany({
    where: { farmId, state: { in: [...RUNNING] } },
    columns: { id: true, name: true, state: true, targetWindowEnd: true },
  });
  let raised = 0;
  const thisMonth = farmDayOf(now).slice(0, "YYYY-MM".length);
  for (const one of ventures) {
    // oxlint-disable-next-line no-await-in-loop -- one Venture at a time, against one unique index
    const monthly = await tellTheOwnerAPaperIsDue(
      tx,
      farmId,
      one,
      { kind: "month", month: thisMonth },
      now
    );
    raised += monthly ? 1 : 0;
    // The Wind-up Period begins the day after the Target Window closes; its last day is what
    // `windUpEndsOn` gives. Told once it has begun, not on the day it ends, because the point of
    // telling is that there is still time to sell.
    const winding =
      farmDayOf(now) > one.targetWindowEnd &&
      farmDayOf(now) <= windUpEndsOn(one.targetWindowEnd, windUpDays);
    if (winding) {
      // oxlint-disable-next-line no-await-in-loop -- one Venture at a time
      const wound = await tellTheOwnerAPaperIsDue(
        tx,
        farmId,
        one,
        { kind: "wind_up" },
        now
      );
      raised += wound ? 1 : 0;
    }
  }
  return raised;
};
