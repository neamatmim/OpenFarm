import { roundKg } from "@OpenFarm/domain";

import type { Tx } from "../audit";
import { recordStockCount } from "../stock-store";
import type { EffectInput, EffectResult, EffectKind } from "./effect";

type StockCountFacts = Pick<
  EffectInput,
  | "instance"
  | "completionId"
  | "counts"
  | "skipped"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/**
 * Counts the store: what is really there of each Feed Item, and why it differs. The Manager's alone
 * (roles matrix: Stock Count — Manager C R U): the Owner steps into shifts, and a count moves what the
 * farm's feed is worth.
 */
const countTheStore = async (
  tx: Tx,
  input: StockCountFacts
): Promise<EffectResult> => {
  const adjustments = await recordStockCount(tx, {
    farmId: input.instance.farmId,
    completionId: input.completionId,
    counts: input.counts,
    skipped: input.skipped,
    countedAt: input.recordedAt,
    countedBy: input.recordedBy,
    now: input.now,
  });
  return { kind: "stock_count", adjustments };
};

/** A Step that counts the store. */
export const stockCountEffect: EffectKind<StockCountFacts> = {
  kind: "stock_count",
  recordableBy: {
    roles: ["owner", "manager"],
    refusal: {
      message: "Counting the store is the Manager's or the Owner's",
      reason: "manager_only",
    },
  },
  apply: countTheStore,
  recorded: async (db, completionId) => {
    const lines = await db.query.stockCount.findMany({
      where: { completionId },
      columns: { feedItemId: true, counted: true, reason: true },
      orderBy: { feedItemId: "asc" },
    });
    return lines.length > 0
      ? {
          counts: lines.map((line) => ({
            feedItemId: line.feedItemId,
            counted: Number(line.counted),
            ...(line.reason ? { reason: line.reason } : {}),
          })),
        }
      : {};
  },
  // A reason left out, or only spaces, is none; the lines are in the farm's order and rounding.
  asShown: ({ counts }) =>
    counts
      ? {
          counts: counts
            .map((line) => ({
              feedItemId: line.feedItemId,
              counted: roundKg(line.counted),
              ...(line.reason?.trim() ? { reason: line.reason.trim() } : {}),
            }))
            .toSorted((a, b) => a.feedItemId.localeCompare(b.feedItemId)),
        }
      : {},
};
