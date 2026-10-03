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
  realisedMoney: number;
  /** Everything the Venture is expected to have been charged by the end. */
  chargedMoney: number;
  investorsPercent: number;
  /** Every Unit signed for, or offered, across the Venture. */
  units: number;
  saleLowMoneyPerKg: number;
  saleHighMoneyPerKg: number;
  /** The share of the animals still to sell the Owner expects not to live to be sold, taken at the low end only: the
   *  high end is every one of them living. Nothing expected to die, when not said. */
  deathsPercent?: number;
}

/** One end of a Projection: what the herd fetches at that price, what that makes, and how it divides. */
export interface ProjectedEnd extends Split {
  saleMoneyPerKg: number;
  /** What the animals still to sell weigh between them at this end: fewer at the low end, by the deaths expected. */
  kgAtSale: number;
  proceedsMoney: number;
  /** Negative where that price does not cover what the Venture was charged. */
  profitMoney: number;
}

export interface Projected {
  kgAtSale: number;
  low: ProjectedEnd;
  high: ProjectedEnd;
}

/** What a herd's weight comes to once the share expected to die is taken off it. */
export const livingKg = (kg: number, deathsPercent: number): number =>
  kg * (1 - Math.min(100, Math.max(0, deathsPercent)) / 100);

/** The Settlement a Venture would come to at the low and at the high sale price, in whole taka — the low end with the
 *  deaths expected taken off what is still to sell. */
export const projectedSettlement = ({
  kgAtSale,
  realisedMoney,
  chargedMoney,
  investorsPercent,
  units,
  saleLowMoneyPerKg,
  saleHighMoneyPerKg,
  deathsPercent = 0,
}: ToProject): Projected => {
  // What an animal that dies cost stays charged: only what she would have fetched is lost.
  const at = (saleMoneyPerKg: number, kg: number): ProjectedEnd => {
    const proceedsMoney = Math.round(realisedMoney + kg * saleMoneyPerKg);
    const profitMoney = Math.round(proceedsMoney - chargedMoney);
    return {
      saleMoneyPerKg,
      kgAtSale: kg,
      proceedsMoney,
      profitMoney,
      ...splitOfProfit({ profitMoney, investorsPercent, units }),
    };
  };
  return {
    kgAtSale,
    low: at(saleLowMoneyPerKg, livingKg(kgAtSale, deathsPercent)),
    high: at(saleHighMoneyPerKg, kgAtSale),
  };
};
