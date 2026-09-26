import type { Split } from "./venture";
import { splitOfProfit } from "./venture";

/**
 * The arithmetic of a Projection: what a Venture's Settlement might come to, at the low and the high of the sale
 * prices the Owner expects. An estimate, never a promise — it is worked through the Settlement's own split so that
 * what an Investor is shown as an estimate and what the farm would pay on those figures can only differ in the
 * figures, never in the sum.
 */

/** What one end of a Projection is worked from, besides its price. */
export interface ToProject {
  /** What the animals still to sell are expected to weigh between them when they are sold. */
  kgAtSale: number;
  /** What the animals already sold fetched: a fact, the same at both ends. */
  realisedBdt: number;
  /** Everything the Venture is expected to have been charged by the end. */
  chargedBdt: number;
  investorsPercent: number;
  /** Every Unit signed for, or offered, across the Venture. */
  units: number;
  saleLowBdtPerKg: number;
  saleHighBdtPerKg: number;
}

/** One end of a Projection: what the herd fetches at that price, what that makes, and how it divides. */
export interface ProjectedEnd extends Split {
  saleBdtPerKg: number;
  proceedsBdt: number;
  /** Negative where that price does not cover what the Venture was charged. */
  profitBdt: number;
}

export interface Projected {
  kgAtSale: number;
  low: ProjectedEnd;
  high: ProjectedEnd;
}

/** The Settlement a Venture would come to at the low and at the high sale price, in whole taka. */
export const projectedSettlement = ({
  kgAtSale,
  realisedBdt,
  chargedBdt,
  investorsPercent,
  units,
  saleLowBdtPerKg,
  saleHighBdtPerKg,
}: ToProject): Projected => {
  const at = (saleBdtPerKg: number): ProjectedEnd => {
    const proceedsBdt = Math.round(realisedBdt + kgAtSale * saleBdtPerKg);
    const profitBdt = Math.round(proceedsBdt - chargedBdt);
    return {
      saleBdtPerKg,
      proceedsBdt,
      profitBdt,
      ...splitOfProfit({ profitBdt, investorsPercent, units }),
    };
  };
  return { kgAtSale, low: at(saleLowBdtPerKg), high: at(saleHighBdtPerKg) };
};

/** What the Owner expects of animals the Venture has still to buy. */
export interface ToBuy {
  cattleBudgetLeftBdt: number;
  buyBdtPerKg: number;
  /** What each is expected to weigh when bought. */
  buyWeightKg: number;
  dailyGainKg: number;
  /** From the day they are bought to the day the window opens; none past it. */
  daysToWindow: number;
}

/**
 * What the animals the cattle budget has still to buy would weigh between them when the window opens: as many
 * whole animals as the budget left pays for, each put on the expected gain for the days until then.
 */
export const unboughtKgAtWindow = ({
  cattleBudgetLeftBdt,
  buyBdtPerKg,
  buyWeightKg,
  dailyGainKg,
  daysToWindow,
}: ToBuy): number => {
  const eachBdt = buyBdtPerKg * buyWeightKg;
  const animals = eachBdt > 0 ? Math.floor(cattleBudgetLeftBdt / eachBdt) : 0;
  return animals * (buyWeightKg + dailyGainKg * Math.max(0, daysToWindow));
};
