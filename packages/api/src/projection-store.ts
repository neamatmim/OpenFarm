import type { Database } from "@OpenFarm/db";
import type { PlanLine, Projected } from "@OpenFarm/domain";
import {
  bandOf,
  buyingAgainstPlan,
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
import { boughtFor } from "./venture-bought";
import type { VentureRow } from "./venture-store";
import { windowInForceOn } from "./venture-store";

/**
 * A Venture's **Projection**: what its Settlement might come to at the low and the high of the sale prices the Owner
 * expects (ADR 0010). An estimate worked from the Owner's own figures and the farm's readings, never a promise, and
 * never printed on a paper.
 *
 * Worked from its **Venture Plan** (ADR 0011) — the version in force, since a projection is what the Owner expects now,
 * where plan-against-actual measures against the baseline. A Venture still gathering capital has no animals, so it is
 * the plan alone: every band bought at its middle once the decide-by day comes, at its own price, and grown to the
 * window at its own gain. Once it is buying, the animals it stands on are its own — each grown at her own rate over her
 * whole stay, or her band's planned gain while nobody has weighed her — and, while it is still buying, what each band
 * has still to buy comes from the plan, at its price. Every animal counted is paid for, over the cattle budget or
 * under it. What it has sold fetched what it fetched; what it has been charged is what the Settlement counts, and the
 * rest of its running budget is taken as spent, which errs towards the lower figure. A Venture whose prices were set
 * before it had a plan is projected from those until it has one.
 */

/** What a Projection is worked from: the plan in force, or the prices set before the Venture had a plan. */
export interface ProjectionBasis {
  saleLowBdtPerKg: number;
  saleHighBdtPerKg: number;
  /** The share of the animals still to sell expected not to live to be sold, taken off the low end: the plan's, or
   *  none for prices set before it. */
  deathsPercent: number;
  setAt: Date;
  /** The plan version it is worked from; nothing for prices set before the Venture had a plan. */
  planVersion: number | null;
  /** The plan's buying lines, for animals still to buy; none for prices set before the plan. */
  lines: PlanLine[];
  /** The buying figures as one average — the plan's own, weighted by its bands, or those set before it — as an offer
   *  says them. */
  buyBdtPerKg: number | null;
  buyWeightKg: number | null;
  dailyGainKg: number | null;
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

const middleOf = (line: PlanLine) => (line.fromKg + line.toKg) / 2;

/** A plan's buying as one average: the price a kilo and the weight each is bought at, and the gain a day, each
 *  weighted as the plan buys — the kilo price by kilos, the rest by head. */
const averagesOf = (lines: readonly PlanLine[]) => {
  const animals = lines.reduce((sum, line) => sum + line.animals, 0);
  const kg = lines.reduce(
    (sum, line) => sum + line.animals * middleOf(line),
    0
  );
  if (animals === 0 || kg === 0) {
    return { buyBdtPerKg: null, buyWeightKg: null, dailyGainKg: null };
  }
  const cost = lines.reduce(
    (sum, line) => sum + line.animals * middleOf(line) * line.buyBdtPerKg,
    0
  );
  const gain = lines.reduce(
    (sum, line) => sum + line.animals * line.dailyGainKg,
    0
  );
  return {
    buyBdtPerKg: Math.round((cost / kg) * 100) / 100,
    buyWeightKg: Math.round((kg / animals) * 10) / 10,
    dailyGainKg: Math.round((gain / animals) * 100) / 100,
  };
};

/**
 * What a Venture's Projection is worked from: the latest version of its plan, or — for one whose prices were set before
 * it had a plan — those prices. Nothing while it has neither.
 */
export const projectionBasisOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<ProjectionBasis | null> => {
  const plan = await db.query.venturePlan.findFirst({
    where: { farmId, ventureId },
    orderBy: { version: "desc" },
    with: { lines: { orderBy: { position: "asc" } } },
  });
  if (plan) {
    const lines = plan.lines.map((line): PlanLine => ({
      animals: line.animals,
      fromKg: Number(line.fromKg),
      toKg: Number(line.toKg),
      buyBdtPerKg: line.buyBdtPerKg,
      dailyGainKg: Number(line.dailyGainKg),
    }));
    return {
      saleLowBdtPerKg: plan.saleLowBdtPerKg,
      saleHighBdtPerKg: plan.saleHighBdtPerKg,
      deathsPercent: Number(plan.deathsPercent),
      setAt: plan.madeAt,
      planVersion: plan.version,
      lines,
      ...averagesOf(lines),
    };
  }
  const row = await db.query.ventureProjection.findFirst({
    where: { farmId, ventureId },
  });
  if (!row) {
    return null;
  }
  return {
    saleLowBdtPerKg: row.saleLowBdtPerKg,
    saleHighBdtPerKg: row.saleHighBdtPerKg,
    deathsPercent: 0,
    setAt: row.setAt,
    planVersion: null,
    lines: [],
    buyBdtPerKg: row.buyBdtPerKg,
    buyWeightKg: kgOf(row.buyWeightKg),
    dailyGainKg: kgOf(row.dailyGainKg),
  };
};

/** The buying figures set before the Venture had a plan, when all three were given. */
const buyingFiguresOf = (basis: ProjectionBasis) =>
  basis.buyBdtPerKg !== null &&
  basis.buyWeightKg !== null &&
  basis.dailyGainKg !== null
    ? {
        buyBdtPerKg: basis.buyBdtPerKg,
        buyWeightKg: basis.buyWeightKg,
        dailyGainKg: basis.dailyGainKg,
      }
    : null;

/** Whether a basis says what the Venture will buy: a plan with bands, or the buying figures set before it. */
const saysWhatItBuys = (basis: ProjectionBasis) =>
  basis.lines.length > 0 || buyingFiguresOf(basis) !== null;

/**
 * What the animals standing on the Venture would weigh between them when its window opens: each at her own rate over
 * her whole stay, or her last fortnight's; one nobody has weighed since she came, at her band's planned gain.
 */
const standingKgAtWindow = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string,
  lines: readonly PlanLine[],
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
    // Her band's gain where she has no rate of her own: the plan said what an animal of her weight would put on.
    const band = one.intake ? bandOf(lines, Number(one.intake.weightKg)) : null;
    const planned = band === null ? 0 : (lines[band]?.dailyGainKg ?? 0);
    // Her whole stay's rate before her last fortnight's: an estimate months out should lean on the steadier one.
    const rate =
      view.sinceIntake?.dailyGainKg ?? view.recent?.dailyGainKg ?? planned;
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
  targetWindowEnd: string;
  targetCapitalBdt: number;
  cattleBudgetBdt: number;
  units: number;
}

/** The Venture with the Target Window in force today, which an Amendment may have moved from the one it opened with. */
const inForce = async (
  db: Pick<Tx, "query">,
  farmId: string,
  run: Run,
  now: Date
): Promise<Run> => ({
  ...run,
  ...(await windowInForceOn(db, farmId, run, farmDayOf(now))),
});

/**
 * What the Venture has still to buy: what those animals would weigh between them when its window opens — bought once it
 * stops gathering capital and not before today, and grown until the window opens — and what they cost. From the plan,
 * each band's animals less those already bought in it, at the band's price; from prices set before the plan, as many
 * as the cattle budget left pays for, and so the whole of it. Every animal counted is paid for, and nothing is paid
 * for that is not counted. Nothing once it has stopped buying.
 */
const stillToBuy = async (
  db: Pick<Tx, "query">,
  farmId: string,
  run: Run,
  basis: ProjectionBasis,
  cattleBudgetLeftBdt: number,
  now: Date
): Promise<{ kg: number; costBdt: number }> => {
  if (run.state !== "open" && run.state !== "buying") {
    return { kg: 0, costBdt: 0 };
  }
  const buyingFrom = new Date(
    Math.max(now.getTime(), startOfFarmDay(run.decideBy).getTime())
  );
  const days = daysFromTo(buyingFrom, startOfFarmDay(run.targetWindowStart));
  if (basis.lines.length > 0) {
    const bought =
      run.state === "open" ? [] : await boughtFor(db, farmId, run.id);
    const { bands } = buyingAgainstPlan(basis.lines, bought);
    let kg = 0;
    let costBdt = 0;
    for (const [at, line] of basis.lines.entries()) {
      const left = Math.max(0, line.animals - (bands[at]?.bought.animals ?? 0));
      kg += left * (middleOf(line) + line.dailyGainKg * days);
      costBdt += left * middleOf(line) * line.buyBdtPerKg;
    }
    return { kg, costBdt: Math.round(costBdt) };
  }
  const figures = buyingFiguresOf(basis);
  if (!figures) {
    return { kg: 0, costBdt: 0 };
  }
  const left = Math.max(0, cattleBudgetLeftBdt);
  return {
    kg: unboughtKgAtWindow({
      cattleBudgetLeftBdt: left,
      ...figures,
      daysToWindow: days,
    }),
    costBdt: left,
  };
};

/**
 * The Projection of a Venture still gathering capital, from its plan alone: every band bought and paid for, its whole
 * running budget charged, and every Unit it offers taken. Nothing while it has no plan, or only prices set before one
 * with no buying.
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
  if (!basis || !saysWhatItBuys(basis)) {
    return null;
  }
  const buying = await stillToBuy(
    db,
    farmId,
    { ...(await inForce(db, farmId, run, now)), state: "open" },
    basis,
    run.cattleBudgetBdt,
    now
  );
  const figures = {
    realisedBdt: 0,
    chargedBdt: run.targetCapitalBdt - run.cattleBudgetBdt + buying.costBdt,
    investorsPercent: offeredPercent,
    units: run.units,
  };
  return {
    basis,
    ...figures,
    ...projectedSettlement({
      kgAtSale: buying.kg,
      ...figures,
      saleLowBdtPerKg: basis.saleLowBdtPerKg,
      saleHighBdtPerKg: basis.saleHighBdtPerKg,
      deathsPercent: basis.deathsPercent,
    }),
  };
};

/**
 * The Projection of one Venture today, or nothing: while it has no plan and no prices, once it is settled or called
 * off, and for one still gathering capital whose plan says nothing of buying.
 */
export const projectionOf = async (
  db: Database,
  farmId: string,
  asOpened: Run,
  /** The share of profit an offer's Investors would take, for one still gathering capital. */
  offeredPercent: number,
  now: Date
): Promise<Projection | null> => {
  if (asOpened.state === "settled" || asOpened.state === "cancelled") {
    return null;
  }
  if (asOpened.state === "open") {
    return offerProjectionOf(db, farmId, asOpened, offeredPercent, now);
  }
  const run = await inForce(db, farmId, asOpened, now);
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
      basis.lines,
      startOfFarmDay(run.targetWindowStart),
      now
    ),
  ]);
  const buying = await stillToBuy(
    db,
    farmId,
    run,
    basis,
    spend.cattleBudgetLeftBdt,
    now
  );
  const figures = {
    realisedBdt: settled.proceedsBdt,
    chargedBdt:
      settled.chargedBdt +
      Math.max(0, spend.runningBudgetBdt - spend.runningSpentBdt) +
      buying.costBdt,
    investorsPercent: settled.investorsPercent,
    units: settled.units,
  };
  return {
    basis,
    ...figures,
    ...projectedSettlement({
      kgAtSale: standingKg + buying.kg,
      ...figures,
      saleLowBdtPerKg: basis.saleLowBdtPerKg,
      saleHighBdtPerKg: basis.saleHighBdtPerKg,
      deathsPercent: basis.deathsPercent,
    }),
  };
};

/** Where a Projection comes from, as an Investor is told it: the prices, when they were set, the herd's weight, and
 *  the share of it the lower figure allows not to live to be sold. */
const saidBasis = (projection: Projection) => ({
  setAt: projection.basis.setAt,
  saleLowBdtPerKg: projection.basis.saleLowBdtPerKg,
  saleHighBdtPerKg: projection.basis.saleHighBdtPerKg,
  kgAtSale: Math.round(projection.kgAtSale),
  deathsPercent: projection.basis.deathsPercent,
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
