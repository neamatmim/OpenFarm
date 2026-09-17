import type { orpc } from "@/utils/orpc";

/** A Feed Item as the page holds it. */
export interface FeedItemRow {
  id: string;
  nameBn: string;
  unit: string;
  retiredAt: Date | null;
}

/** A Ration: its name, its version, what one animal gets of each Feed Item in a day, and the Pens on it. */
export interface RationRow {
  id: string;
  name: { bn: string; en: string | null };
  number: number | null;
  items: { feedItemId: string; kgPerAnimalPerDay: number }[];
  penIds: string[];
}

export type StockLine = Awaited<
  ReturnType<typeof orpc.stock.onHand.call>
>[number];

export type Adjustment = Awaited<
  ReturnType<typeof orpc.stock.adjustments.call>
>[number];

export type Arrival = Awaited<
  ReturnType<typeof orpc.stock.arrivals.call>
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
  return line.lowStockAt === null ? "unwatched" : "ok";
};

/** What a line of the store is worth at the average price it was bought at; nothing for feed with no price. */
export const valueOf = (line: StockLine): number | null =>
  line.averagePriceBdt === null
    ? null
    : Math.max(line.onHand, 0) * line.averagePriceBdt;
