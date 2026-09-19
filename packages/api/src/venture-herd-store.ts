import { isExitState, startOfFarmDay } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { fatteningOf } from "./fattening-store";

/**
 * A Venture's whole run, standing and gone, in one read.
 *
 * Its own animals rather than the farm's: a Venture buys twenty or thirty beasts, and a bound over that
 * cannot quietly drop the newest ones the way a bound over the farm's whole fattening history would.
 */
const VENTURE_LIMIT = 500;

/** As many readings as a rate needs; the same depth the fattening board reads. */
const READINGS_READ = 12;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One Animal as an Investor's paper shows her: what she weighed off the lorry, what she weighs now, and
 * what she has put on in a day.
 *
 * No projection. `fatteningView` also works out where a rate would land her at the window and whether
 * that makes her target weight, and the Farm's own board shows both — but neither goes on a paper a man
 * keeps, because a future weight under the Farm's name reads as a promise (CONTEXT: Investor Statement).
 */
export interface HerProgress {
  tagNumber: string;
  /** Whether she is still standing; false once she is sold, dead or culled. */
  standing: boolean;
  /** Kilogrammes off the lorry. Null for an Animal the Farm did not buy in. */
  intakeKg: number | null;
  /** What the farm believes she weighs, and the day it learned it: her latest **Weigh-in**, or what she
   *  weighed off the lorry while nobody has put her on the scale since. `dailyGainKg` tells the two
   *  apart — it is null for exactly the second case. */
  latestKg: number | null;
  latestAt: Date | null;
  /**
   * Kilogrammes a day since Intake, and the days it was measured over.
   *
   * Null for an Animal nobody has weighed since she arrived. That is not the same fact as no gain, and
   * an Investor is owed the difference: one says the farm does not know, the other says she is not
   * growing.
   */
  dailyGainKg: number | null;
  overDays: number | null;
  /** Whether the Farm holds a photograph of her, so a sheet knows whether to leave room for one. */
  hasPhoto: boolean;
}

/** What a Venture's cattle are doing, on the day it is asked. */
export interface TheirProgress {
  /** Still standing in the shed. */
  standingCount: number;
  /** Gone on a buyer's lorry. */
  soldCount: number;
  /** Gone any other way — died, or culled. An Investor asks how many he lost, not by which of the
   *  two, and the Farm would rather say one number than seem to be sorting the answer. */
  diedCount: number;
  /**
   * How many of the standing have been on the scale since they arrived, which is how many animals the
   * two averages below are over. Said, because the averages are silent about it otherwise and an
   * Investor counting heads would make them of the wrong number.
   */
  weighedCount: number;
  /**
   * Kilogrammes at Intake and at the latest **Weigh-in**, averaged over the standing animals that have
   * been weighed — the same animals in both, so that then and now can be read against each other.
   *
   * A beast nobody has weighed is in neither. Her "now" would be her arrival weight, which is not a
   * reading, and dropping it into the second average would quietly flatten the very growth the two
   * figures exist to show.
   */
  averageIntakeKg: number | null;
  averageLatestKg: number | null;
  /**
   * The herd's Average Daily Gain: everything it has put on, over everything it has spent on feed.
   *
   * Not the mean of the per-Animal rates, and the difference is deliberate. This says "these bulls put
   * on this much a day between them", which is what a man reading a whole-herd line means. Averaging
   * the rates instead would let a beast who arrived last week count for as much as one who has been
   * here since January. An Investor who adds up the per-Animal column will land a little away from
   * this; the farm would rather he can reconcile the two than be quietly handed the easier sum.
   */
  gainKgPerDay: number | null;
  /** Whole days until the Target Window opens, and 0 once it has. A count of days, never a prediction. */
  daysToWindow: number;
  animals: HerProgress[];
}

/** Kilogrammes, as the farm reads a weight. */
const KG_SCALE = 10;
/** Rates carry a decimal more, as the domain's own do: a fattening bull's whole day's work is the
 *  second decimal place. */
const RATE_SCALE = 100;

const roundedKg = (value: number) => Math.round(value * KG_SCALE) / KG_SCALE;
const roundedRate = (value: number) =>
  Math.round(value * RATE_SCALE) / RATE_SCALE;

const meanOf = (values: number[]): number | null =>
  values.length === 0
    ? null
    : roundedKg(values.reduce((sum, one) => sum + one, 0) / values.length);

/**
 * What one Venture's cattle are doing: how many stand, how many have gone, what they weigh, and what
 * they are putting on.
 *
 * Whose an Animal is, is asked of the day rather than off her record. An **Internal Sale** moves her
 * between purses, and reading `ownerVentureId` would move her retrospectively — off one Venture's paper
 * and onto another's for months she was never theirs. `ownedThenByOf` is how every other Venture sum
 * asks it, and the Settlement is worked out through it.
 */
export const theirProgress = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  venture: { id: string; targetWindowStart: string },
  now: Date
): Promise<TheirProgress> => {
  const rows = await tx.query.animal.findMany({
    where: { farmId, ownerVentureId: venture.id },
    orderBy: { tagNumber: "asc", id: "asc" },
    limit: VENTURE_LIMIT,
    columns: {
      id: true,
      tagNumber: true,
      state: true,
      photoUpdatedAt: true,
    },
    with: {
      intake: {
        columns: {
          weightKg: true,
          arrivedAt: true,
          targetWeightKg: true,
          targetWindowStart: true,
        },
      },
      /** Newest first, as `fatteningOf` expects to sort them back. */
      weighIns: {
        orderBy: { weighedAt: "desc", id: "desc" },
        limit: READINGS_READ,
        columns: { weightKg: true, weighedAt: true },
      },
    },
  });

  const animals: HerProgress[] = [];
  const standingIntake: number[] = [];
  const standingLatest: number[] = [];
  let gainKg = 0;
  let gainDays = 0;
  let standingCount = 0;
  let soldCount = 0;
  let diedCount = 0;

  for (const one of rows) {
    const view = fatteningOf(one.intake, one.weighIns, now);
    const standing = !isExitState(one.state);
    const intakeKg = one.intake ? Number(one.intake.weightKg) : null;
    const since = view.sinceIntake;
    if (standing) {
      standingCount += 1;
      // Both averages are over the animals that have actually been weighed, and `sinceIntake` is what
      // says she has: it is null until a reading exists, which is why `latestKg` alone will not do.
      if (since && intakeKg !== null && view.latestKg !== null) {
        standingIntake.push(intakeKg);
        standingLatest.push(view.latestKg);
      }
      // The herd's own rate: kilogrammes on over days on feed. A beast nobody has weighed contributes
      // neither, rather than a zero that would drag the figure down for a fact the farm does not have.
      //
      // The days are counted here rather than taken from `overDays`, which is rounded to whole days for
      // the reader. Exact kilogrammes over rounded days is a third rate, agreeing with neither the
      // animals' own nor the farm's own arithmetic; `sinceIntake` still decides *whether* she counts,
      // because it holds the floor that keeps two weighings on one morning out of a daily rate.
      if (
        since &&
        intakeKg !== null &&
        view.latestKg !== null &&
        one.intake &&
        view.latestAt
      ) {
        gainKg += view.latestKg - intakeKg;
        gainDays +=
          (view.latestAt.getTime() - one.intake.arrivedAt.getTime()) / DAY_MS;
      }
    } else if (one.state === "sold") {
      soldCount += 1;
    } else {
      // Died or culled: both are an Animal his money did not get back on a lorry.
      diedCount += 1;
    }
    animals.push({
      tagNumber: one.tagNumber,
      standing,
      intakeKg,
      latestKg: view.latestKg,
      latestAt: view.latestAt,
      dailyGainKg: since?.dailyGainKg ?? null,
      overDays: since?.overDays ?? null,
      hasPhoto: one.photoUpdatedAt !== null,
    });
  }

  const opensAt = startOfFarmDay(venture.targetWindowStart);
  return {
    standingCount,
    soldCount,
    diedCount,
    weighedCount: standingLatest.length,
    averageIntakeKg: meanOf(standingIntake),
    averageLatestKg: meanOf(standingLatest),
    gainKgPerDay: gainDays > 0 ? roundedRate(gainKg / gainDays) : null,
    // Whole days, and never negative: once the window has opened there are none left to count.
    daysToWindow: Math.max(
      0,
      Math.ceil((opensAt.getTime() - now.getTime()) / DAY_MS)
    ),
    animals,
  };
};
