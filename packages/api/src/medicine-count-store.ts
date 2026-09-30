import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, notInArray } from "@OpenFarm/db/operators";
import { medicineCount } from "@OpenFarm/db/schema/health";
import { roundTaka } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

// The monthly medicine count: every product on the Drug List counted in doses, blind, and set against what the store
// is thought to hold — doses bought, less doses given, with the earlier counts' differences. The count wins.

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
  perDoseBdt: number | null;
}

/**
 * What the store was thought to hold of each product at a moment, in doses — bought by then, less given by then, with
 * every other count's difference before it — and what a dose of it cost. A count is read without itself, so a count
 * put right is compared against the same book.
 */
const bookAt = async (
  tx: Tx,
  farmId: string,
  at: Date,
  excludingCompletion: string
): Promise<Map<string, { expected: number; perDoseBdt: number | null }>> => {
  const bought = await tx.query.medicinePurchase.findMany({
    where: { farmId, purchasedOn: { lte: at } },
    columns: { drugProductId: true, doses: true, priceBdt: true },
  });
  const given = await tx.query.treatment.findMany({
    where: { farmId, givenAt: { lte: at } },
    columns: { productId: true },
  });
  const earlier = await tx.query.medicineCount.findMany({
    where: {
      farmId,
      countedAt: { lte: at },
      completionId: { ne: excludingCompletion },
    },
    columns: { drugProductId: true, expected: true, counted: true },
  });
  const book = new Map<
    string,
    { doses: number; bdt: number; bought: number; expected: number }
  >();
  const of = (id: string) => {
    const one = book.get(id) ?? { doses: 0, bdt: 0, bought: 0, expected: 0 };
    book.set(id, one);
    return one;
  };
  for (const one of bought) {
    const line = of(one.drugProductId);
    line.expected += one.doses;
    line.bought += one.doses;
    line.bdt += one.priceBdt;
  }
  for (const one of given) {
    of(one.productId).expected -= 1;
  }
  for (const one of earlier) {
    of(one.drugProductId).expected += one.counted - one.expected;
  }
  return new Map(
    [...book].map(([id, line]) => [
      id,
      {
        expected: Math.max(0, line.expected),
        perDoseBdt: line.bought > 0 ? roundTaka(line.bdt / line.bought) : null,
      },
    ])
  );
};

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
      perDoseBdt: known?.perDoseBdt ?? null,
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
      perDoseBdt: line.perDoseBdt,
    }));
};

/** What a count came up short by, in taka at what each dose cost: doses found are never set against doses gone. */
export const medicineShortBdt = (
  adjustments: readonly MedicineAdjustment[]
): number => {
  let short = 0;
  for (const one of adjustments) {
    if (one.difference < 0 && one.perDoseBdt !== null) {
      short += -one.difference * one.perDoseBdt;
    }
  }
  return roundTaka(short);
};
