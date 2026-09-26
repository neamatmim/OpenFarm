import type { Database } from "@OpenFarm/db";
import type { Projected } from "@OpenFarm/domain";
import {
  farmDayOf,
  isExitState,
  payoutOf,
  projectedSettlement,
  startOfFarmDay,
  unboughtKgAtWindow,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { fatteningOf } from "./fattening-store";
import { theirSpend } from "./investor-statement-store";
import { settlementOf } from "./settlement-store";
import type { VentureRow } from "./venture-store";

/**
 * A Venture's **Projection**: what its Settlement might come to at the low and the high of the sale prices the Owner
 * expects (ADR 0010). An estimate worked from the Owner's own figures and the farm's readings, never a promise, and
 * never printed on a paper.
 *
 * A Venture still gathering capital has no animals, so it is worked from the Owner's plan: the cattle budget buys as
 * many animals as it pays for at the expected price and weight, each puts on the expected gain until the window, and
 * the whole of its capital is spent. Once it is buying, the animals it stands on are its own — each grown to the
 * window at her own rate over her whole stay — and what the cattle budget has still to buy is worked from the plan.
 * What it has sold fetched what it fetched; what it has been charged is what the Settlement counts, and the rest of
 * its running budget is taken as spent, which errs towards the lower figure.
 */

/** Its figures, as the Owner last set them. */
export interface ProjectionBasis {
  saleLowBdtPerKg: number;
  saleHighBdtPerKg: number;
  buyBdtPerKg: number | null;
  buyWeightKg: number | null;
  dailyGainKg: number | null;
  setAt: Date;
}

export interface Projection extends Projected {
  basis: ProjectionBasis;
  /** What the animals already sold fetched. */
  realisedBdt: number;
  /** Everything it is taken to have been charged by the end. */
  chargedBdt: number;
  investorsPercent: number;
  units: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one farm day's start to another's, and none backwards. */
const daysFromTo = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));

/** Kilogrammes as a numeric column holds them, or nothing. */
const kgOf = (value: string | null) => (value === null ? null : Number(value));

/** What the Owner last set for this Venture, or nothing while they have set nothing. */
export const projectionBasisOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<ProjectionBasis | null> => {
  const row = await db.query.ventureProjection.findFirst({
    where: { farmId, ventureId },
  });
  if (!row) {
    return null;
  }
  return {
    saleLowBdtPerKg: row.saleLowBdtPerKg,
    saleHighBdtPerKg: row.saleHighBdtPerKg,
    buyBdtPerKg: row.buyBdtPerKg,
    buyWeightKg: kgOf(row.buyWeightKg),
    dailyGainKg: kgOf(row.dailyGainKg),
    setAt: row.setAt,
  };
};

/** The plan's figures for buying, when the Owner has given all three. */
const buyingPlanOf = (basis: ProjectionBasis) =>
  basis.buyBdtPerKg !== null &&
  basis.buyWeightKg !== null &&
  basis.dailyGainKg !== null
    ? {
        buyBdtPerKg: basis.buyBdtPerKg,
        buyWeightKg: basis.buyWeightKg,
        dailyGainKg: basis.dailyGainKg,
      }
    : null;

/** What the animals standing on the Venture would weigh between them when its window opens. */
const standingKgAtWindow = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string,
  opensAt: Date,
  now: Date
): Promise<number> => {
  const rows = await db.query.animal.findMany({
    where: { farmId, ownerVentureId: ventureId },
    columns: { id: true, state: true },
    with: {
      intake: {
        columns: {
          weightKg: true,
          arrivedAt: true,
          targetWeightKg: true,
          targetWindowStart: true,
        },
      },
      weighIns: { columns: { weightKg: true, weighedAt: true } },
    },
  });
  let kg = 0;
  for (const one of rows.filter((each) => !isExitState(each.state))) {
    const view = fatteningOf(one.intake, one.weighIns, now);
    // Her whole stay's rate before her last fortnight's: an estimate months out should lean on the steadier one.
    const rate = view.sinceIntake?.dailyGainKg ?? view.recent?.dailyGainKg ?? 0;
    const from = view.latestAt ?? now;
    kg += (view.latestKg ?? 0) + rate * daysFromTo(from, opensAt);
  }
  return kg;
};

/** A Venture as its Projection needs it. */
interface Run {
  id: string;
  state: VentureRow["state"];
  createdAt: Date;
  decideBy: string;
  targetWindowStart: string;
  targetCapitalBdt: number;
  cattleBudgetBdt: number;
  units: number;
}

/** The animals a cattle budget has still to buy, worked from the plan: bought once the Venture stops gathering
 *  capital and not before today, and grown until the window opens. Nothing without the whole plan. */
const unboughtKg = (
  run: Run,
  basis: ProjectionBasis,
  cattleBudgetLeftBdt: number,
  now: Date
) => {
  const plan = buyingPlanOf(basis);
  if (!plan) {
    return 0;
  }
  const buyingFrom = new Date(
    Math.max(now.getTime(), startOfFarmDay(run.decideBy).getTime())
  );
  return unboughtKgAtWindow({
    cattleBudgetLeftBdt,
    ...plan,
    daysToWindow: daysFromTo(buyingFrom, startOfFarmDay(run.targetWindowStart)),
  });
};

/**
 * The Projection of a Venture still gathering capital, from the Owner's plan alone: its whole cattle budget spent at
 * the expected price and weight, its whole capital charged, and every Unit it offers taken. Nothing while the Owner
 * has set no sale prices or not the whole plan.
 */
export const offerProjectionOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  run: Run,
  /** The share of profit its Investors would take: the farm's own figure, as the offer says it. */
  offeredPercent: number,
  now: Date
): Promise<Projection | null> => {
  const basis = await projectionBasisOf(db, farmId, run.id);
  if (!basis || !buyingPlanOf(basis)) {
    return null;
  }
  const figures = {
    realisedBdt: 0,
    chargedBdt: run.targetCapitalBdt,
    investorsPercent: offeredPercent,
    units: run.units,
  };
  return {
    basis,
    ...figures,
    ...projectedSettlement({
      kgAtSale: unboughtKg(run, basis, run.cattleBudgetBdt, now),
      ...figures,
      saleLowBdtPerKg: basis.saleLowBdtPerKg,
      saleHighBdtPerKg: basis.saleHighBdtPerKg,
    }),
  };
};

/**
 * The Projection of one Venture today, or nothing: while the Owner has set no sale prices, once it is settled or
 * called off, and for one still gathering capital whose buying plan is not given.
 */
export const projectionOf = async (
  db: Database,
  farmId: string,
  run: Run,
  /** The share of profit an offer's Investors would take, for one still gathering capital. */
  offeredPercent: number,
  now: Date
): Promise<Projection | null> => {
  if (run.state === "settled" || run.state === "cancelled") {
    return null;
  }
  if (run.state === "open") {
    return offerProjectionOf(db, farmId, run, offeredPercent, now);
  }
  const basis = await projectionBasisOf(db, farmId, run.id);
  if (!basis) {
    return null;
  }
  const [settled, spend, standingKg] = await Promise.all([
    settlementOf(db, farmId, run, farmDayOf(now)),
    theirSpend(db, farmId, run),
    standingKgAtWindow(
      db,
      farmId,
      run.id,
      startOfFarmDay(run.targetWindowStart),
      now
    ),
  ]);
  const figures = {
    realisedBdt: settled.proceedsBdt,
    chargedBdt:
      settled.chargedBdt +
      Math.max(0, spend.runningBudgetBdt - spend.runningSpentBdt),
    investorsPercent: settled.investorsPercent,
    units: settled.units,
  };
  return {
    basis,
    ...figures,
    ...projectedSettlement({
      kgAtSale:
        standingKg + unboughtKg(run, basis, spend.cattleBudgetLeftBdt, now),
      ...figures,
      saleLowBdtPerKg: basis.saleLowBdtPerKg,
      saleHighBdtPerKg: basis.saleHighBdtPerKg,
    }),
  };
};

/** Where a Projection comes from, as an Investor is told it: the prices, when they were set, and the herd's weight. */
const saidBasis = (projection: Projection) => ({
  setAt: projection.basis.setAt,
  saleLowBdtPerKg: projection.basis.saleLowBdtPerKg,
  saleHighBdtPerKg: projection.basis.saleHighBdtPerKg,
  kgAtSale: Math.round(projection.kgAtSale),
});

/**
 * A Projection as the portal says it to an Investor in the Venture: what the herd might fetch and make, and what that
 * comes to for their own Units — their share and what they would be paid — at each end. Nobody else's figure.
 */
export const hisProjection = (
  projection: Projection,
  his: { units: number; capitalBdt: number }
) => {
  const end = (one: Projection["low"]) => ({
    proceedsBdt: one.proceedsBdt,
    profitBdt: one.profitBdt,
    shareBdt: one.perUnitBdt * his.units,
    payoutBdt: payoutOf(his.capitalBdt, his.units, one.perUnitBdt),
  });
  return {
    ...saidBasis(projection),
    realisedBdt: projection.realisedBdt,
    chargedBdt: projection.chargedBdt,
    low: end(projection.low),
    high: end(projection.high),
  };
};

/** A Projection as an offer says it: per Unit, with the plan it was worked from. */
export const offeredProjection = (projection: Projection) => ({
  ...saidBasis(projection),
  buyBdtPerKg: projection.basis.buyBdtPerKg,
  buyWeightKg: projection.basis.buyWeightKg,
  dailyGainKg: projection.basis.dailyGainKg,
  low: {
    profitBdt: projection.low.profitBdt,
    perUnitBdt: projection.low.perUnitBdt,
  },
  high: {
    profitBdt: projection.high.profitBdt,
    perUnitBdt: projection.high.perUnitBdt,
  },
});
