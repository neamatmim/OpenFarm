import type { Database } from "@OpenFarm/db";
import type { PlanLine, Projected } from "@OpenFarm/domain";
import {
  farmDayOf,
  hasEnded,
  isExitState,
  isStillBuying,
  lineFor,
  payoutOf,
  planAverages,
  projectedSettlement,
  startOfFarmDay,
  stillToBuyOf,
  whatUnitsTake,
  wholeDaysFrom,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import {
  fatteningOf,
  gainReadDaysOf,
  WEIGH_IN_COLUMNS,
} from "./fattening-store";
import { theirSpend } from "./investor-statement-store";
import { settlementOf } from "./settlement-store";
import { boughtFor } from "./venture-bought";
import { latestPlanOf } from "./venture-plan-read";
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
 * rest of its running budget is taken as spent, which errs towards the lower figure. Nothing before it has a plan.
 */

/** What a Projection is worked from: the plan in force. */
export interface ProjectionBasis {
  saleLowMoneyPerKg: number;
  saleHighMoneyPerKg: number;
  /** The share of the animals still to sell the plan expects not to live to be sold, taken off the low end. */
  deathsPercent: number;
  setAt: Date;
  /** The plan version it is worked from. */
  planVersion: number;
  /** The plan's buying lines, for animals still to buy. */
  lines: PlanLine[];
  /** The plan's buying as one average, weighted by its bands, as an offer says it. */
  buyMoneyPerKg: number | null;
  buyWeightKg: number | null;
  dailyGainKg: number | null;
}

export interface Projection extends Projected {
  basis: ProjectionBasis;
  /** What the animals already sold fetched. */
  realisedMoney: number;
  /** Everything it is taken to have been charged by the end. */
  chargedMoney: number;
  investorsPercent: number;
  units: number;
}

/** What a Venture's Projection is worked from: the latest version of its plan. Nothing while it has none. */
export const projectionBasisOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureId: string
): Promise<ProjectionBasis | null> => {
  const plan = await latestPlanOf(db, farmId, ventureId);
  if (!plan) {
    return null;
  }
  return {
    saleLowMoneyPerKg: plan.saleLowMoneyPerKg,
    saleHighMoneyPerKg: plan.saleHighMoneyPerKg,
    deathsPercent: plan.deathsPercent,
    setAt: plan.madeAt,
    planVersion: plan.version,
    lines: plan.lines,
    ...planAverages(plan.lines),
  };
};

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
    columns: { id: true, state: true, breedId: true },
    with: {
      intake: {
        columns: {
          weightKg: true,
          arrivedAt: true,
          targetWeightKg: true,
          targetWindowStart: true,
        },
      },
      weighIns: { columns: WEIGH_IN_COLUMNS },
    },
  });
  const readDays = await gainReadDaysOf(db, farmId);
  let kg = 0;
  for (const one of rows.filter((each) => !isExitState(each.state))) {
    const view = fatteningOf(one.intake, one.weighIns, now, readDays);
    // Her line's gain where she has no rate of her own: the plan said what an animal of her weight and Breed would put on.
    const band = one.intake
      ? lineFor(lines, {
          weightKg: Number(one.intake.weightKg),
          breedId: one.breedId,
        })
      : null;
    const planned = band === null ? 0 : (lines[band]?.dailyGainKg ?? 0);
    // Her whole stay's rate before her last fortnight's: an estimate months out should lean on the steadier one.
    const rate =
      view.sinceIntake?.dailyGainKg ?? view.recent?.dailyGainKg ?? planned;
    const from = view.latestAt ?? now;
    kg += (view.latestKg ?? 0) + rate * wholeDaysFrom(from, opensAt);
  }
  return kg;
};

/** A Venture as its Projection needs it. */
type Run = Pick<
  VentureRow,
  | "id"
  | "state"
  | "decideBy"
  | "targetWindowStart"
  | "targetWindowEnd"
  | "targetCapitalMoney"
  | "cattleBudgetMoney"
  | "units"
  | "unitPriceMoney"
  | "capitalPaid"
  | "cattlePartMoney"
> & {
  /** When it was opened, which its Settlement is read from. */
  createdAt: Date;
};

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
 * stops gathering capital and not before today, and grown until the window opens — and what they cost. Each band's
 * animals less those already bought in it, at the band's price: every animal counted is paid for, and nothing is paid
 * for that is not counted. Nothing once it has stopped buying.
 */
const stillToBuy = async (
  db: Pick<Tx, "query">,
  farmId: string,
  run: Run,
  basis: ProjectionBasis,
  now: Date
): Promise<{ kg: number; costMoney: number }> => {
  if (!isStillBuying(run.state)) {
    return { kg: 0, costMoney: 0 };
  }
  const buyingFrom = new Date(
    Math.max(now.getTime(), startOfFarmDay(run.decideBy).getTime())
  );
  return stillToBuyOf({
    lines: basis.lines,
    bought: run.state === "open" ? [] : await boughtFor(db, farmId, run.id),
    days: wholeDaysFrom(buyingFrom, startOfFarmDay(run.targetWindowStart)),
  });
};

/**
 * The Projection of a Venture still gathering capital, from its plan alone: every band bought and paid for, its whole
 * running budget charged, and every Unit it offers taken. Nothing while it has no plan.
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
  if (!basis) {
    return null;
  }
  const buying = await stillToBuy(
    db,
    farmId,
    { ...(await inForce(db, farmId, run, now)), state: "open" },
    basis,
    now
  );
  const figures = {
    realisedMoney: 0,
    chargedMoney:
      run.targetCapitalMoney - run.cattleBudgetMoney + buying.costMoney,
    investorsPercent: offeredPercent,
    units: run.units,
  };
  return {
    basis,
    ...figures,
    ...projectedSettlement({
      kgAtSale: buying.kg,
      ...figures,
      saleLowMoneyPerKg: basis.saleLowMoneyPerKg,
      saleHighMoneyPerKg: basis.saleHighMoneyPerKg,
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
  if (hasEnded(asOpened.state)) {
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
  const buying = await stillToBuy(db, farmId, run, basis, now);
  const figures = {
    realisedMoney: settled.proceedsMoney,
    chargedMoney:
      settled.chargedMoney +
      Math.max(0, spend.runningBudgetMoney - spend.runningSpentMoney) +
      buying.costMoney,
    investorsPercent: settled.investorsPercent,
    units: settled.units,
  };
  return {
    basis,
    ...figures,
    ...projectedSettlement({
      kgAtSale: standingKg + buying.kg,
      ...figures,
      saleLowMoneyPerKg: basis.saleLowMoneyPerKg,
      saleHighMoneyPerKg: basis.saleHighMoneyPerKg,
      deathsPercent: basis.deathsPercent,
    }),
  };
};

/** Where a Projection comes from, as an Investor is told it: the prices, when they were set, the herd's weight, and
 *  the share of it the lower figure allows not to live to be sold. */
const saidBasis = (projection: Projection) => ({
  setAt: projection.basis.setAt,
  saleLowMoneyPerKg: projection.basis.saleLowMoneyPerKg,
  saleHighMoneyPerKg: projection.basis.saleHighMoneyPerKg,
  kgAtSale: Math.round(projection.kgAtSale),
  deathsPercent: projection.basis.deathsPercent,
});

/**
 * A Projection as the portal says it to an Investor in the Venture: what the herd might fetch and make, and what that
 * comes to for their own Units — their share and what they would be paid — at each end. Nobody else's figure.
 */
export const hisProjection = (
  projection: Projection,
  his: { units: number; capitalMoney: number }
) => {
  const end = (one: Projection["low"]) => ({
    proceedsMoney: one.proceedsMoney,
    profitMoney: one.profitMoney,
    shareMoney: whatUnitsTake(one.perUnitMoney, his.units),
    payoutMoney: payoutOf(his.capitalMoney, his.units, one.perUnitMoney),
  });
  return {
    ...saidBasis(projection),
    realisedMoney: projection.realisedMoney,
    chargedMoney: projection.chargedMoney,
    low: end(projection.low),
    high: end(projection.high),
  };
};

/** A Projection as an offer says it: per Unit, with the plan it was worked from. */
export const offeredProjection = (projection: Projection) => ({
  ...saidBasis(projection),
  buyMoneyPerKg: projection.basis.buyMoneyPerKg,
  buyWeightKg: projection.basis.buyWeightKg,
  dailyGainKg: projection.basis.dailyGainKg,
  low: {
    profitMoney: projection.low.profitMoney,
    perUnitMoney: projection.low.perUnitMoney,
  },
  high: {
    profitMoney: projection.high.profitMoney,
    perUnitMoney: projection.high.perUnitMoney,
  },
});
