import type { ExpectedGain, RationLine, WeightBand } from "@OpenFarm/domain";
import { isByWeight } from "@OpenFarm/domain";

import type { orpc } from "@/utils/orpc";

/** A Feed Item as the page holds it. */
export interface FeedItemRow {
  id: string;
  nameBn: string;
  /** Its English name, where it has one. Optional here, as screens that build rows by hand have none to give. */
  nameEn?: string | null;
  unit: string;
  /** What one of its bags weighs, in kilos, where the farm has said: what lets it be bought by the bag. */
  bagSizeKg: number | null;
  retiredAt: Date | null;
  /** What the Owner says its home-grown fodder is worth a unit, for those who read money; missing for the rest. */
  fodderPriceMoney?: number | null;
}

/** A Ration: its name, its version, what each Feed Item is in a day — by the head or by weight — and the Pens on it. */
export interface RationRow {
  id: string;
  name: { bn: string; en: string | null };
  number: number | null;
  items: RationLine[];
  /** The weights it is written for; both ends open for a Ration that suits any weight. */
  band: WeightBand;
  /** The kilos a day it is written to put on the animals that eat it, or none. Missing from a list cached before
   *  Rations had one — which says nothing about the Ration, so an edit then leaves the figure where it is. */
  expectedGain?: ExpectedGain | null;
  penIds: string[];
  /** When it was taken off the list a Pen may be put on; null while it is on it. */
  retiredAt: Date | null;
}

/** A line's figure, whichever way it counts: kilos a head, or kilos per hundred kilos of body weight. */
export const amountOf = (line: RationLine): number =>
  isByWeight(line) ? line.kgPer100KgPerDay : line.kgPerAnimalPerDay;

export type StockLine = Awaited<
  ReturnType<typeof orpc.stock.onHand.call>
>[number];

export type Adjustment = Awaited<
  ReturnType<typeof orpc.stock.adjustments.call>
>[number];

export type Arrival = Awaited<
  ReturnType<typeof orpc.stock.feedIn.call>
>[number];

/** Where a Feed Item's Stock on Hand stands against the level set for it. */
export type StockStanding = "out" | "low" | "ok" | "unwatched";

export const standingOf = (line: StockLine): StockStanding => {
  if (line.onHand <= 0) {
    return "out";
  }
  if (line.runningLow) {
    return "low";
  }
  // A feed that is fed is watched by its days, level or no level; an answer kept from before days were said has none.
  const watchedByDays = (line.daysLeft ?? null) !== null;
  return line.lowStockAt === null && !watchedByDays ? "unwatched" : "ok";
};

/** What a line of the store is worth at the average price it was bought at; nothing for feed with no price. */
export const valueOf = (line: StockLine): number | null =>
  line.averagePriceMoney === null
    ? null
    : Math.max(line.onHand, 0) * line.averagePriceMoney;
