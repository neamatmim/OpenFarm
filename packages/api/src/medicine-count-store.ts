import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, notInArray } from "@OpenFarm/db/operators";
import { medicineCount } from "@OpenFarm/db/schema/health";
import { roundMoney } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { bookAt } from "./medicine-stock";

// The monthly medicine count: every product on the Drug List counted in doses, blind, and set against what the store
// is thought to hold — the store replayed up to the count (medicine-stock's bookAt). The count wins.

/** One product as a medicine count Step recorded it. */
export interface MedicineCountLine {
  drugProductId: string;
  counted: number;
  reason?: string;
}

/** A product whose count differed from the book: by how many doses, and what a dose of it cost. */
export interface MedicineAdjustment {
  drugProductId: string;
  difference: number;
  /** What its purchases cost a dose, on average; nothing for a product never bought. */
  perDoseMoney: number | null;
}

/**
 * Books a medicine count: for each product on the Drug List, what the store was thought to hold at the moment it was
 * counted, what was really there, and why they differ. Every product still on the list is counted, or none is; a
 * difference without a reason is refused, naming every product that needs one. Recorded again — a phone replaying, a
 * Correction — its lines are replaced, so its difference is booked once.
 */
export const recordMedicineCount = async (
  tx: Tx,
  entry: {
    farmId: string;
    completionId: string;
    /** Empty when the Step was skipped: nothing was counted. */
    counts: MedicineCountLine[];
    skipped: boolean;
    countedAt: Date;
    countedBy: string;
    now: Date;
  }
): Promise<MedicineAdjustment[]> => {
  if (entry.skipped) {
    await tx
      .delete(medicineCount)
      .where(eq(medicineCount.completionId, entry.completionId));
    return [];
  }
  const products = await tx.query.drugProduct.findMany({
    where: { farmId: entry.farmId },
    columns: { id: true, retiredAt: true },
  });
  const byId = new Map(products.map((one) => [one.id, one]));
  if (entry.counts.some((line) => !byId.has(line.drugProductId))) {
    throw new ORPCError("NOT_FOUND", { message: "No such medicine" });
  }
  if (entry.counts.some((line) => byId.get(line.drugProductId)?.retiredAt)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A retired medicine is not counted",
      data: { refusal: "product_retired" },
    });
  }
  const countedIds = new Set(entry.counts.map((line) => line.drugProductId));
  // One line a product: two said different things, and the row kept and the difference told disagreed.
  if (countedIds.size < entry.counts.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A medicine count counts each medicine once",
      data: { refusal: "counted_twice" },
    });
  }
  const missing = products
    .filter((one) => !(one.retiredAt || countedIds.has(one.id)))
    .map((one) => one.id);
  if (missing.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A medicine count counts every medicine on the list",
      data: { refusal: "medicine_count_incomplete", drugProductIds: missing },
    });
  }
  const book = await bookAt(
    tx,
    entry.farmId,
    entry.countedAt,
    entry.completionId
  );
  const lines = entry.counts.map((line) => {
    const counted = Math.round(line.counted);
    const known = book.get(line.drugProductId);
    const expected = known?.expected ?? 0;
    return {
      drugProductId: line.drugProductId,
      counted,
      expected,
      difference: counted - expected,
      perDoseMoney: known?.perDoseMoney ?? null,
      reason: line.reason?.trim() || null,
    };
  });
  const unexplained = lines.filter(
    (line) => line.difference !== 0 && !line.reason
  );
  if (unexplained.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A count that differs from the book says why",
      data: {
        refusal: "difference_needs_reason",
        drugProductIds: unexplained.map((line) => line.drugProductId),
      },
    });
  }
  for (const line of lines) {
    const values = {
      expected: line.expected,
      counted: line.counted,
      reason: line.difference === 0 ? null : line.reason,
      countedAt: entry.countedAt,
      countedBy: entry.countedBy,
      recordedAt: entry.now,
    };
    // Sequential: one row per product against one unique index.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .insert(medicineCount)
      .values({
        id: uuidv7(entry.now),
        farmId: entry.farmId,
        drugProductId: line.drugProductId,
        completionId: entry.completionId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [medicineCount.completionId, medicineCount.drugProductId],
        set: values,
      });
  }
  // A product a corrected count no longer counts — retired since — is not a count any more.
  await tx
    .delete(medicineCount)
    .where(
      and(
        eq(medicineCount.completionId, entry.completionId),
        notInArray(medicineCount.drugProductId, [...countedIds])
      )
    );
  return lines
    .filter((line) => line.difference !== 0)
    .map((line) => ({
      drugProductId: line.drugProductId,
      difference: line.difference,
      perDoseMoney: line.perDoseMoney,
    }));
};

/** What a count came up short by, in taka at what each dose cost: doses found are never set against doses gone. */
export const medicineShortMoney = (
  adjustments: readonly MedicineAdjustment[]
): number => {
  let short = 0;
  for (const one of adjustments) {
    if (one.difference < 0 && one.perDoseMoney !== null) {
      short += -one.difference * one.perDoseMoney;
    }
  }
  return roundMoney(short);
};
