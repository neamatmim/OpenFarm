import { farmDayOf } from "@OpenFarm/domain";

import type { orpc } from "@/utils/orpc";

/** A Venture as the list answers it. */
export type Venture = Awaited<
  ReturnType<typeof orpc.ventures.list.call>
>[number];

/**
 * Whether the Wind-up Period has run out with Animals still hers.
 *
 * The one condition, so the warning, the act it calls for and the Owner's own page cannot disagree —
 * being told the run is over while the button that ends it is not there would be worse than not being
 * told. Written without a closing angle bracket because the guard against untranslated JSX text reads
 * one as the end of a tag.
 *
 * Worked out where it is read rather than sent down with the Venture, on purpose: a fortnight-old cached
 * answer was written before either figure existed and says nothing about either, and a stale `true` is a
 * screen telling her a run is over on the strength of a date that has since moved.
 */
export const pastWindUp = (venture: Venture) =>
  venture.state === "selling" &&
  (venture.animalsStanding ?? 0) !== 0 &&
  (venture.windUpEndsOn ?? "9999-12-31") < farmDayOf(new Date());

/**
 * How far a Venture still is from its Floor, and so whether buying may start.
 *
 * The farm judges on what the account **holds** — "money sent back is not money to start on" — and on a
 * Venture still Open nothing has gone back, so what arrived is what it holds. Should a refund ever reach
 * one before it starts buying, this is the line to move onto the balance, and the server will already be
 * refusing what this still offers.
 */
export const shortOfFloor = (venture: Venture) =>
  venture.floorBdt - venture.capitalInBdt;

/** How many days before its decision date an Open Venture short of its Floor starts asking for the Owner:
 *  a week, the time it takes to chase the signatures and the money still owed, or to decide to call it off. */
const DECIDE_BY_WARNING_DAYS = 7;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether an Open Venture is at or past the day it has to be decided by with its Floor still unmet.
 *
 * That day is when the Owner either starts buying or calls the run off and sends the money back, and a run
 * that reaches it unmet has only the second — so it is said a week ahead, while there is still time to
 * find the rest, rather than on the day.
 */
export const decisionIsDue = (venture: Venture, now = new Date()) => {
  const warnFrom = farmDayOf(
    new Date(now.getTime() + DECIDE_BY_WARNING_DAYS * ONE_DAY_MS)
  );
  // Named, and this way round, because the guard against untranslated JSX text reads a closing angle
  // bracket in an expression as the end of a tag.
  const decisionWithinTheWeek = venture.decideBy <= warnFrom;
  return (
    venture.state === "open" &&
    shortOfFloor(venture) > 0 &&
    decisionWithinTheWeek
  );
};

/** How a Venture's account stands against the bank, as it is read on both screens that read it. */
export interface BankStanding {
  lastCheckedMonth: string | null;
  monthsOut: string[];
  monthsStale?: string[];
}

/**
 * The months still out, told apart: one nobody's statement has been read against since the farm changed
 * its mind about it, and one that was read and did not agree.
 *
 * They are different problems — a stale month needs the statement read again, a disagreeing one needs
 * explaining — and a month that is both is only the first. A fortnight-old cache was written before a
 * month could go stale and says nothing about one, which is why the field is optional.
 */
export const monthsStillOut = (bank: BankStanding | undefined) => {
  const stale = bank?.monthsStale ?? [];
  return {
    stale,
    disagreed: (bank?.monthsOut ?? []).filter(
      (month) => !stale.includes(month)
    ),
  };
};

/**
 * What is wrong with a Venture, in the farm's own words.
 *
 * A bank month that disagrees and one that went stale are told apart, because they are different
 * problems: a stale month needs the statement read again, a disagreeing one needs explaining. A month
 * nobody has opened yet is not here at all — that is a gap rather than trouble, and the Venture's own
 * card says so quietly.
 */
export type VentureTrouble =
  | { word: "decision_due"; decideBy: string; shortBdt: number }
  | { word: "running_budget_low"; leftBdt: number }
  | { word: "past_wind_up"; standing: number }
  | { word: "bank_disagrees"; months: string[] }
  | { word: "bank_stale"; months: string[] };

/**
 * Everything about one Venture that wants the Owner.
 *
 * Asked of what the Venture is, never of what state it is in: each of these is already true or not on
 * its own terms, and starting from the state is how the Statements button, the Settlement button and
 * the budget line each came to be drawn for the wrong runs.
 *
 * There is deliberately nothing here for "running over cost". `drawFloat` and the Internal Sale both
 * refuse to spend more than the Cattle Budget is holding, so it cannot be overdrawn — the Running
 * Budget falling low is the farm's one way of saying a run is going over, and a second figure saying
 * the same thing differently would only disagree with it.
 */
export const troubleWith = (venture: Venture): VentureTrouble[] => {
  const troubles: VentureTrouble[] = [];
  if (decisionIsDue(venture)) {
    troubles.push({
      word: "decision_due",
      decideBy: venture.decideBy,
      shortBdt: shortOfFloor(venture),
    });
  }
  if (venture.runningBudgetLow) {
    troubles.push({
      word: "running_budget_low",
      leftBdt: venture.runningBudgetHeldBdt ?? 0,
    });
  }
  if (pastWindUp(venture)) {
    troubles.push({
      word: "past_wind_up",
      standing: venture.animalsStanding ?? 0,
    });
  }
  // A run that was called off refunded every taka and has no figures resting on it, so a month of its
  // that disagrees is history rather than something she can act on. A **settled** one is different: its
  // Settlement could not have closed while a month was out, so a month that has gone out since means
  // the figures everybody was paid on no longer read the same, and she is owed that news.
  if (venture.state !== "cancelled") {
    const { stale, disagreed } = monthsStillOut(venture.bank);
    if (stale.length > 0) {
      troubles.push({ word: "bank_stale", months: stale });
    }
    if (disagreed.length > 0) {
      troubles.push({ word: "bank_disagrees", months: disagreed });
    }
  }
  return troubles;
};

/** One Venture and what is wrong with it, for the Owner's own page. */
export interface VentureNeedingHer {
  id: string;
  name: string;
  troubles: VentureTrouble[];
}

/** The Ventures that want her, in the order the list gave them, and none of the ones that do not. */
export const venturesNeedingHer = (
  ventures: Venture[] | undefined
): VentureNeedingHer[] =>
  (ventures ?? [])
    .map((one) => ({
      id: one.id,
      name: one.name,
      troubles: troubleWith(one),
    }))
    .filter((one) => one.troubles.length > 0);
