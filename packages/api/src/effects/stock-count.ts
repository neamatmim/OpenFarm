import { farmDayOf, roundKg, shortfallOf } from "@OpenFarm/domain";

import { clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import { tell } from "../notice";
import { recordStockCount } from "../stock-store";
import type { StockAdjustment } from "../stock-store";
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
 * Tells the Owner and the Manager of a count that found more feed missing than the Owner's line, in taka at what the
 * feed cost — told once for the count, in the evening's post. A count put right later is not told again: the Notice is
 * about the count, and the feed page shows what it says now. One put right to no shortfall, or to a skip, takes its
 * Notice down.
 */
const tellIfTheStoreCameUpShort = async (
  tx: Tx,
  input: StockCountFacts,
  adjustments: readonly StockAdjustment[]
) => {
  const { shortMoney } = shortfallOf(adjustments);
  const farm = await tx.query.farm.findFirst({
    where: { id: input.instance.farmId },
    columns: { storeShortfallTellMoney: true },
  });
  if (!farm || shortMoney <= farm.storeShortfallTellMoney) {
    // Put right to no shortfall, or skipped: the notice of one goes, in the post and in the app.
    await clearNoticesAbout(
      tx,
      input.instance.farmId,
      [input.completionId],
      input.now,
      ["store_shortfall"]
    );
    return;
  }
  await tell(
    tx,
    input.instance.farmId,
    {
      kind: "store_shortfall",
      about: { id: input.completionId },
      // To the taka: a notice read on a phone, not a ledger.
      facts: {
        shortMoney: Math.round(shortMoney),
        countedOn: farmDayOf(input.recordedAt),
      },
    },
    input.now
  );
};

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
  await tellIfTheStoreCameUpShort(tx, input, adjustments);
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
