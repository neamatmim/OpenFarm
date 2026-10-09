import type { GrowthHolding, VentureHolding } from "@OpenFarm/domain";
import {
  farmDayOf,
  growthOf,
  handedOverAt,
  isExitState,
  startOfFarmDay,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import {
  fatteningOf,
  gainReadDaysOf,
  READINGS_FOR_A_RATE,
  WEIGH_IN_COLUMNS,
} from "./fattening-store";
import { whenEachCame, windowInForceOn } from "./venture-store";

/**
 * A Venture's whole run, standing and gone, in one read.
 *
 * Its own animals rather than the farm's: a Venture buys twenty or thirty beasts, and a bound over that
 * cannot quietly drop the newest ones the way a bound over the farm's whole fattening history would.
 */
const VENTURE_LIMIT = 500;

/** As many readings as a rate needs: the same depth the fattening board reads. */
const READINGS_READ = READINGS_FOR_A_RATE;

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
  /** When her photograph was taken, or last replaced; null while there is none. */
  photoAt: Date | null;
}

/** The herd's average weight as the farm knew it on one day. */
export interface HerdWeight {
  /** The farm day, `YYYY-MM-DD`. */
  day: string;
  averageKg: number;
  /** How many animals it is over: those that had arrived by that day. */
  animals: number;
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
  /** Lost — strayed or stolen — and made good by the Farm at what she had cost: not a death, and no loss to him. */
  lostCount: number;
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
   * The herd's Average Daily Gain: everything it has put on, over everything it has spent on feed — every animal it
   * has had, a sold one to her weight at the gate and a dead one to her last weighing, not only those standing, or the
   * figure would fall each time the fastest went to a buyer.
   *
   * Not the mean of the per-Animal rates, and the difference is deliberate. This says "these bulls put
   * on this much a day between them", which is what a man reading a whole-herd line means. Averaging
   * the rates instead would let a beast who arrived last week count for as much as one who has been
   * here since January. An Investor who adds up the per-Animal column will land a little away from
   * this; the farm would rather he can reconcile the two than be quietly handed the easier sum.
   */
  gainKgPerDay: number | null;
  /** The latest reading off the scale among the animals the two averages are over, so a reader knows how old
   *  "now" is. Null while none of them has been weighed. */
  lastWeighedAt: Date | null;
  /**
   * The two averages followed back through every day one of their animals arrived or was weighed: on each, the
   * average of what the farm then knew each of them to weigh — her latest reading by that day, or what she came off
   * the lorry at. Over the same animals as the averages, so its first day is the average on arrival (when they came
   * together) and its last is the average now.
   *
   * Not the average of whoever was on the scale that day. A round that weighs one bull and the next that weighs
   * another would read as the herd losing weight when neither did.
   */
  weights: HerdWeight[];
  /** Whole days until the Target Window opens, and 0 once it has. A count of days, never a prediction. */
  daysToWindow: number;
  animals: HerProgress[];
}

/** Kilogrammes, as the farm reads a weight. */
const KG_SCALE = 10;
const roundedKg = (value: number) => Math.round(value * KG_SCALE) / KG_SCALE;

/** The later of two moments, either of which may be missing. */
const laterOf = (one: Date | null, other: Date | null): Date | null =>
  one && other && one > other ? one : (other ?? one);

/** One weight the farm learned of one animal, and when. */
interface Learned {
  animalId: string;
  kg: number;
  at: Date;
}

/** The average of each animal's latest weight at the end of every day one of them was weighed or arrived. */
const weightsOverTime = (learned: Learned[]): HerdWeight[] => {
  const latest = new Map<string, number>();
  const byDay = new Map<string, HerdWeight>();
  for (const one of learned.toSorted(
    (a, b) => a.at.getTime() - b.at.getTime()
  )) {
    latest.set(one.animalId, one.kg);
    const kgs = [...latest.values()];
    // A later reading the same day replaces the day's figure: it is the day as it ended.
    byDay.set(farmDayOf(one.at), {
      day: farmDayOf(one.at),
      averageKg: roundedKg(kgs.reduce((sum, kg) => sum + kg, 0) / kgs.length),
      animals: kgs.length,
    });
  }
  return [...byDay.values()];
};

const meanOf = (values: number[]): number | null =>
  values.length === 0
    ? null
    : roundedKg(values.reduce((sum, one) => sum + one, 0) / values.length);

/** The stretch an animal was one Venture's: from the Internal Sale that last brought her to it — or her arrival, bought
 *  by it — to the one that took her off it, her Sale, or now; with what she weighed at each Internal Sale. */
const theirStretch = (
  one: {
    id: string;
    intake: { arrivedAt: Date } | null;
    sale: { soldAt: Date; weightKg: string } | null;
  },
  handed: readonly {
    animalId: string;
    fromVentureId: string | null;
    toVentureId: string | null;
    soldOn: string;
    weightKg: string;
  }[],
  came: ReadonlyMap<string, Date>,
  ventureId: string,
  now: Date
) => {
  const hers = handed.filter((sale) => sale.animalId === one.id);
  const inAt = hers.findLastIndex((sale) => sale.toVentureId === ventureId);
  const offAt = hers.findLastIndex((sale) => sale.fromVentureId === ventureId);
  const broughtIn = inAt === -1 ? undefined : hers[inAt];
  const tookOff = offAt > inAt ? hers[offAt] : undefined;
  const from = broughtIn
    ? handedOverAt(broughtIn.soldOn, came.get(one.id))
    : (one.intake?.arrivedAt ?? now);
  if (tookOff) {
    return {
      from,
      until: handedOverAt(tookOff.soldOn, came.get(one.id)),
      cameKg: broughtIn ? Number(broughtIn.weightKg) : null,
      wentKg: Number(tookOff.weightKg),
      handedOn: true,
    };
  }
  return {
    from,
    until: one.sale?.soldAt ?? now,
    cameKg: broughtIn ? Number(broughtIn.weightKg) : null,
    wentKg: one.sale ? Number(one.sale.weightKg) : null,
    handedOn: false,
  };
};

/**
 * Every animal a Venture has held, with the Internal Sales that moved one to it or off it and when each came: those it
 * holds today, and those it held once. Read off whose she is today alone, a bull the Farm took off it vanished from its
 * progress while its paper charged for him.
 */
const everyOneTheyHeld = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
) => {
  const handed = await tx.query.internalSale.findMany({
    where: {
      farmId,
      OR: [{ fromVentureId: ventureId }, { toVentureId: ventureId }],
    },
    columns: {
      animalId: true,
      fromVentureId: true,
      toVentureId: true,
      soldOn: true,
      weightKg: true,
    },
    orderBy: { soldOn: "asc", id: "asc" },
  });
  const came =
    handed.length === 0
      ? new Map<string, Date>()
      : await whenEachCame(tx, farmId);
  const everHeld = [...new Set(handed.map((one) => one.animalId))];
  const rows = await tx.query.animal.findMany({
    where:
      everHeld.length === 0
        ? { farmId, ownerVentureId: ventureId }
        : {
            farmId,
            OR: [{ ownerVentureId: ventureId }, { id: { in: everHeld } }],
          },
    orderBy: { tagNumber: "asc", id: "asc" },
    limit: VENTURE_LIMIT,
    columns: {
      id: true,
      tagNumber: true,
      state: true,
      stateChangedAt: true,
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
      /** What she weighed at the gate, where she went to a buyer: the end of her gain. */
      sale: { columns: { weightKg: true, soldAt: true } },
      /** Newest first, as `fatteningOf` expects to sort them back. */
      weighIns: {
        orderBy: { weighedAt: "desc", id: "desc" },
        limit: READINGS_READ,
        columns: WEIGH_IN_COLUMNS,
      },
    },
  });
  return { rows, handed, came };
};

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
  /** The Venture as its row holds it; the window counted to is the one in force today. */
  venture: { id: string; targetWindowStart: string; targetWindowEnd: string },
  now: Date
): Promise<TheirProgress> => {
  const { rows, handed, came } = await everyOneTheyHeld(tx, farmId, venture.id);
  const readDays = await gainReadDaysOf(tx, farmId);

  const animals: HerProgress[] = [];
  const standingIntake: number[] = [];
  const standingLatest: number[] = [];
  /** Every animal it has had, as the herd's gain reads her: standing, sold or dead. */
  const holdings: GrowthHolding[] = [];
  let lastWeighedAt: Date | null = null;
  /** The animals the averages are over, with what they came off the lorry at. */
  const averaged: Learned[] = [];
  let standingCount = 0;
  let soldCount = 0;
  let diedCount = 0;
  let lostCount = 0;

  for (const one of rows) {
    const stretch = theirStretch(one, handed, came, venture.id, now);
    // Read from the day she was theirs, at what they took her on at — the Internal Sale's weight for one bought across —
    // and only what the scale said while she was: her weeks before were another owner's gain, her weeks after too.
    const theirReadings = one.weighIns.filter(
      (reading) =>
        reading.weighedAt >= stretch.from && reading.weighedAt < stretch.until
    );
    const takenOn = one.intake
      ? {
          ...one.intake,
          arrivedAt: stretch.from,
          weightKg:
            stretch.cameKg === null
              ? one.intake.weightKg
              : String(stretch.cameKg),
        }
      : null;
    const view = fatteningOf(takenOn, theirReadings, now, readDays);
    if (takenOn) {
      holdings.push({
        takenOn: stretch.from,
        until: stretch.until,
        cameKg: Number(takenOn.weightKg),
        soldKg: stretch.wentKg,
        readings: theirReadings
          .filter((reading) => reading.flaggedNote === null)
          .map((reading) => ({
            kg: Number(reading.weightKg),
            at: reading.weighedAt,
          })),
        chargedMoney: 0,
      });
    }
    // Moved off them by an Internal Sale: gone from their herd as one sold, not standing in it.
    const standing = !(stretch.handedOn || isExitState(one.state));
    const intakeKg = takenOn ? Number(takenOn.weightKg) : null;
    const since = view.sinceIntake;
    if (standing) {
      standingCount += 1;
      // Both averages are over the animals that have actually been weighed, and `sinceIntake` is what
      // says she has: it is null until a reading exists, which is why `latestKg` alone will not do.
      if (since && intakeKg !== null && view.latestKg !== null) {
        standingIntake.push(intakeKg);
        standingLatest.push(view.latestKg);
        lastWeighedAt = laterOf(lastWeighedAt, view.latestAt);
        if (takenOn) {
          averaged.push({
            animalId: one.id,
            kg: intakeKg,
            at: takenOn.arrivedAt,
          });
        }
      }
    } else if (stretch.handedOn || one.state === "sold") {
      soldCount += 1;
    } else if (one.state === "lost") {
      lostCount += 1;
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
      photoAt: one.photoUpdatedAt,
    });
  }

  // Every reading of theirs, not the latest few the rates need: the line runs back to the day they came. Only those
  // the farm did not doubt, as the averages beside it, or its last point and "average now" say two things.
  const readings =
    averaged.length === 0
      ? []
      : await tx.query.weighIn.findMany({
          where: {
            farmId,
            animalId: { in: averaged.map((one) => one.animalId) },
            flaggedNote: { isNull: true },
          },
          columns: { animalId: true, weightKg: true, weighedAt: true },
        });

  // Each animal's line from the day she was theirs, as her figures above are.
  const theirsFrom = new Map(averaged.map((one) => [one.animalId, one.at]));
  const window = await windowInForceOn(tx, farmId, venture, farmDayOf(now));
  const opensAt = startOfFarmDay(window.targetWindowStart);
  return {
    standingCount,
    soldCount,
    diedCount,
    lostCount,
    weighedCount: standingLatest.length,
    averageIntakeKg: meanOf(standingIntake),
    averageLatestKg: meanOf(standingLatest),
    // The herd's own rate, kilos on over days on feed, over every animal it has had — sold ones to the gate, dead ones
    // to their last weighing — as a Season's is (domain `fattening-growth.ts`). Over those standing alone it would
    // drift as the fast gainers went to buyers. A beast nobody weighed adds neither kilos nor days.
    gainKgPerDay: growthOf(holdings).gainKgPerDay,
    lastWeighedAt,
    weights: weightsOverTime([
      ...averaged,
      ...readings
        .filter((one) => one.weighedAt >= (theirsFrom.get(one.animalId) ?? now))
        .map((one) => ({
          animalId: one.animalId,
          kg: Number(one.weightKg),
          at: one.weighedAt,
        })),
    ]),
    // Whole days, and never negative: once the window has opened there are none left to count.
    daysToWindow: Math.max(
      0,
      Math.ceil((opensAt.getTime() - now.getTime()) / DAY_MS)
    ),
    animals,
  };
};

/**
 * Each stretch one Animal was one Venture's, in order: off the lorry where it bought her, and from every Internal Sale
 * that brought her to it, each to the Internal Sale that took her off it again, or to however she left the farm — or
 * still going. One sold across and later bought back is two stretches, not her last alone: a month inside the first is
 * told with her in it. Whose she was before any Internal Sale is the first one's seller, or her owner today where none
 * moved her.
 */
const stretchesOf = (
  one: {
    intake: { arrivedAt: Date; weightKg: string } | null;
    sale: { soldAt: Date; weightKg: string } | null;
    state: Parameters<typeof isExitState>[0];
    stateChangedAt: Date;
  },
  hers: readonly {
    fromVentureId: string | null;
    toVentureId: string | null;
    soldOn: string;
    weightKg: string;
  }[],
  came: Date | undefined,
  ventureId: string
): Omit<VentureHolding, "animalId" | "tagNumber" | "readings">[] => {
  type Open = Pick<VentureHolding, "from" | "cameBy" | "cameKg">;
  const stretches: Omit<
    VentureHolding,
    "animalId" | "tagNumber" | "readings"
  >[] = [];
  const [first] = hers;
  // Bought by this Venture: theirs from the lorry, until an Internal Sale took her off — or for good.
  const boughtByThem = first ? first.fromVentureId === ventureId : true;
  let open: Open | null =
    boughtByThem && one.intake
      ? {
          from: one.intake.arrivedAt,
          cameBy: "intake",
          cameKg: Number(one.intake.weightKg),
        }
      : null;
  for (const sale of hers) {
    const at = handedOverAt(sale.soldOn, came);
    if (open && sale.fromVentureId === ventureId) {
      stretches.push({
        ...open,
        until: at,
        wentBy: "internal_sale",
        soldKg: null,
      });
      open = null;
    }
    if (sale.toVentureId === ventureId) {
      open = {
        from: at,
        cameBy: "internal_sale",
        cameKg: Number(sale.weightKg),
      };
    }
  }
  if (open) {
    // Still theirs when she left the farm, if she has: to a buyer at her Sale, else dead, culled or lost on its day.
    const exited = isExitState(one.state) ? one.state : null;
    stretches.push({
      ...open,
      until: exited ? (one.sale?.soldAt ?? one.stateChangedAt) : null,
      wentBy: exited,
      soldKg: exited === "sold" && one.sale ? Number(one.sale.weightKg) : null,
    });
  }
  return stretches;
};

/**
 * Every animal a Venture has held, each as a past moment asks of her (`VentureHolding`): from the day she became its —
 * off the lorry, or by the Internal Sale that last brought her — to the day she stopped being, and how: to a buyer, across
 * to another owner, dead, culled or lost. With every Weigh-in the farm did not doubt, not the latest few a rate needs —
 * a month long past is read from readings the latest few no longer reach — so a month can be told as it stood
 * (`herdBetween`), whatever she has done since. Whose she was is the Internal Sales', as every Venture sum asks it.
 */
export const ventureHoldingsOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<VentureHolding[]> => {
  const { rows, handed, came } = await everyOneTheyHeld(tx, farmId, ventureId);
  const readings =
    rows.length === 0
      ? []
      : await tx.query.weighIn.findMany({
          where: {
            farmId,
            animalId: { in: rows.map((one) => one.id) },
            flaggedNote: { isNull: true },
          },
          columns: { animalId: true, weightKg: true, weighedAt: true },
        });
  const readingsOf = new Map<string, { kg: number; at: Date }[]>();
  for (const reading of readings) {
    const hers = readingsOf.get(reading.animalId) ?? [];
    hers.push({ kg: Number(reading.weightKg), at: reading.weighedAt });
    readingsOf.set(reading.animalId, hers);
  }
  return rows.flatMap((one) =>
    stretchesOf(
      one,
      handed.filter((sale) => sale.animalId === one.id),
      came.get(one.id),
      ventureId
    ).map((stretch) => ({
      animalId: one.id,
      tagNumber: one.tagNumber,
      ...stretch,
      readings: readingsOf.get(one.id) ?? [],
    }))
  );
};
