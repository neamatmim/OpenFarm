import type { Database } from "@OpenFarm/db";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import { tell } from "./notice";
import {
  signedForEach,
  windUpEndsOn,
  withWindowsInForce,
} from "./venture-store";

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

/** The four moments an Investor hears at. */
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
 * be told about after January was. Prefixed with the Venture so that `alerts.mine({ about })` can ask
 * for one run's tellings and no other's.
 */
const noticeId = (ventureId: string, occasion: Occasion): string =>
  occasion.kind === "month"
    ? `${ventureId}:${occasion.month}`
    : `${ventureId}:${occasion.kind}`;

/** What the occasion is called where a person reads it. Bangla with the English alongside, as a paper's
 *  labels are — the stored word would print `buying_closed` into the middle of a Bangla sentence. */
const OCCASION_WORDS = {
  buying_closed: "পশু কেনা শেষ / buying closed",
  first_sale: "প্রথম বিক্রি / first sale",
  wind_up: "গুটিয়ে আনার সময় / wind-up",
} as const;

/** Said in Bangla whoever is reading, as a paper's own labels are and as the three worded occasions
 *  above already were: the month is kept as `YYYY-MM` because the notice's id is built from it, and
 *  printing that shape would drop Arabic numerals into the middle of a Bangla sentence. */
const BANGLA = "bn" as const;

const said = (occasion: Occasion): string =>
  occasion.kind === "month"
    ? formatDate(startOfFarmDay(`${occasion.month}-01`), BANGLA, "monthYear")
    : OCCASION_WORDS[occasion.kind];

/**
 * The Ventures whose Investors can be owed a progress paper.
 *
 * Not one still **Open**: it has taken money but bought nothing, and অগ্রগতি is what the animals weigh
 * and what has been spent on them. A Settled or Cancelled run tells nobody either — its books are shut.
 */
const RUNNING = ["buying", "fattening", "selling"] as const;

/** One telling waiting to be made: which Venture, which occasion, and the id it is filed under. */
export interface PaperDue {
  venture: { id: string; name: string; state: string };
  occasion: Occasion;
  noticeId: string;
}

/**
 * Tells the Owner that one Venture's Investors are due their paper, once for that occasion ever.
 *
 * Silent for a Venture nobody has signed — there is nobody to send a paper to — and silent for one whose
 * run is not on. Both are asked here rather than at each of the four call sites, so a fifth occasion
 * cannot forget them.
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
 * What the clock has brought round and nobody has been told about yet: the month, and the day the
 * **Wind-up Period** starts.
 *
 * Asked before any transaction is opened, as the low-stock sweep asks its own question — a farm whose
 * Ventures have all been told about this month must not write an Audit Event saying so every time
 * somebody opens the app.
 */
export const papersToTell = async (
  db: Pick<Database, "query">,
  farmId: string,
  now: Date,
  windUpDays: number
): Promise<PaperDue[]> => {
  const today = farmDayOf(now);
  // Each with the window its Investors signed last: an Amendment that moved it moved their Wind-up too.
  const ventures = await withWindowsInForce(
    db,
    farmId,
    await db.query.venture.findMany({
      where: { farmId, state: { in: [...RUNNING] } },
      columns: {
        id: true,
        name: true,
        state: true,
        targetWindowStart: true,
        targetWindowEnd: true,
      },
    }),
    today
  );
  if (ventures.length === 0) {
    return [];
  }
  const thisMonth = today.slice(0, "YYYY-MM".length);
  const due = ventures.flatMap((one) => {
    const occasions: Occasion[] = [{ kind: "month", month: thisMonth }];
    // The Wind-up Period begins the day after the Target Window closes. Told while it runs, because
    // the point of telling is that there is still time to sell.
    if (
      today > one.targetWindowEnd &&
      today <= windUpEndsOn(one.targetWindowEnd, windUpDays)
    ) {
      occasions.push({ kind: "wind_up" });
    }
    return occasions.map((occasion) => ({
      venture: one,
      occasion,
      noticeId: noticeId(one.id, occasion),
    }));
  });
  const owners = await holdersOf(db as Tx, farmId, ["owner"]);
  if (owners.length === 0) {
    return [];
  }
  const already = await db.query.alert.findMany({
    where: {
      farmId,
      kind: "investor_statement_due",
      entityId: { in: due.map((one) => one.noticeId) },
    },
    columns: { entityId: true, userId: true },
  });
  const told = new Set(already.map((one) => `${one.userId}|${one.entityId}`));
  return due.filter((one) =>
    owners.some((userId) => !told.has(`${userId}|${one.noticeId}`))
  );
};

/** Raises the tellings `papersToTell` found. Idempotent all the same: the unique index behind `tell` is
 *  what actually stops two sweeps racing into two notices. */
export const tellAboutPapersDue = async (
  tx: Tx,
  farmId: string,
  due: readonly PaperDue[],
  now: Date
): Promise<number> => {
  let raised = 0;
  for (const one of due) {
    // oxlint-disable-next-line no-await-in-loop -- one Venture at a time, against one unique index
    const told = await tellTheOwnerAPaperIsDue(
      tx,
      farmId,
      one.venture,
      one.occasion,
      now
    );
    raised += told ? 1 : 0;
  }
  return raised;
};
