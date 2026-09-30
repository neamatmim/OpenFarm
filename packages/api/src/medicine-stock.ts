import type { ExpiryStanding, ExpiryWindow } from "@OpenFarm/domain/lots";
import { storeOfLots } from "@OpenFarm/domain/lots";

import type { Tx } from "./audit";

/** What is left of one Medicine Purchase's Lot, and what it says on the box. */
export interface LotLeft {
  purchaseId: string;
  lotNumber: string | null;
  expiresOn: string | null;
  doses: number;
  left: number;
  /** Where it stands against its Expiry, on the farm's day and by the farm's warning. */
  standing: ExpiryStanding;
}

/** A product's medicine in the store: doses bought, doses given, what is left, and of which Lots. */
export interface MedicineStock {
  dosesIn: number;
  dosesGiven: number;
  /** Doses the monthly counts found over what the store was thought to hold — less than nothing where they found
   *  fewer: doses gone that no Treatment says went into an animal. */
  countedDifference: number;
  onHand: number;
  /** In the order the store is used in: first to expire first. */
  lots: LotLeft[];
  /** The soonest day any Lot with doses left expires, or null when none with a day has any left. */
  nextExpiresOn: string | null;
  /** That Lot's number, so the box can be found on the shelf. */
  nextLotNumber: string | null;
  /** Where that Lot stands against its day; none when there is no such Lot. */
  nextStanding: ExpiryStanding;
  /** Doses still on the shelf from Lots already past their day. */
  expiredOnHand: number;
  /** When it was last bought; null for a product never bought. */
  lastPurchasedOn: Date | null;
}

const NOTHING: MedicineStock = {
  dosesIn: 0,
  dosesGiven: 0,
  countedDifference: 0,
  onHand: 0,
  lots: [],
  nextExpiresOn: null,
  nextLotNumber: null,
  nextStanding: "none",
  expiredOnHand: 0,
  lastPurchasedOn: null,
};

/**
 * Every product's medicine in the store, worked out as a Feed Item's Stock on Hand is: the doses of every Medicine
 * Purchase in, less every dose given, each taken from the Lot that expires first — and the monthly counts' differences
 * besides, so the count wins: doses the count did not find are gone from the Lot that expires first too.
 *
 * On hand is never below nothing. A farm that gave more doses than it wrote down buying had a purchase nobody
 * recorded, and says it holds none rather than a debt of doses.
 */
export const medicineStockOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  /** The farm's day and warning its Lots are read against. */
  window: ExpiryWindow
): Promise<Map<string, MedicineStock>> => {
  const [purchases, given] = await Promise.all([
    tx.query.medicinePurchase.findMany({
      where: { farmId },
      columns: {
        id: true,
        drugProductId: true,
        doses: true,
        lotNumber: true,
        expiresOn: true,
        purchasedOn: true,
      },
    }),
    tx.query.treatment.findMany({
      where: { farmId, givenAt: { isNotNull: true } },
      columns: { productId: true },
    }),
  ]);
  const givenOf = new Map<string, number>();
  for (const one of given) {
    givenOf.set(one.productId, (givenOf.get(one.productId) ?? 0) + 1);
  }
  // Read after the others, one client to a transaction: what each count found over, or under, the book.
  const counted = await tx.query.medicineCount.findMany({
    where: { farmId },
    columns: { drugProductId: true, expected: true, counted: true },
  });
  const foundOf = new Map<string, number>();
  for (const one of counted) {
    foundOf.set(
      one.drugProductId,
      (foundOf.get(one.drugProductId) ?? 0) + one.counted - one.expected
    );
  }
  const boughtOf = new Map<string, typeof purchases>();
  for (const one of purchases) {
    const already = boughtOf.get(one.drugProductId);
    if (already) {
      already.push(one);
    } else {
      boughtOf.set(one.drugProductId, [one]);
    }
  }
  const stock = new Map<string, MedicineStock>();
  for (const productId of new Set([
    ...boughtOf.keys(),
    ...givenOf.keys(),
    ...foundOf.keys(),
  ])) {
    const bought = boughtOf.get(productId) ?? [];
    const dosesGiven = givenOf.get(productId) ?? 0;
    const countedDifference = foundOf.get(productId) ?? 0;
    // Doses gone from the shelf: given, and — where the count found fewer — gone without a Treatment.
    const dosesGone = Math.max(0, dosesGiven - countedDifference);
    const dosesIn = bought.reduce((sum, one) => sum + one.doses, 0);
    const store = storeOfLots(
      bought.map((one) => ({
        id: one.id,
        quantity: one.doses,
        expiresOn: one.expiresOn,
        cameInOn: one.purchasedOn.toISOString(),
        lotNumber: one.lotNumber,
      })),
      dosesGone,
      window
    );
    stock.set(productId, {
      dosesIn,
      dosesGiven,
      countedDifference,
      onHand: Math.max(0, dosesIn - dosesGone),
      lots: store.lots.map((one) => ({
        purchaseId: one.id,
        lotNumber: one.lotNumber,
        expiresOn: one.expiresOn,
        doses: one.quantity,
        left: one.left,
        standing: one.standing,
      })),
      nextExpiresOn: store.next?.expiresOn ?? null,
      nextLotNumber: store.next?.lotNumber ?? null,
      nextStanding: store.next?.standing ?? "none",
      expiredOnHand: store.pastItsDay,
      lastPurchasedOn:
        bought
          .map((one) => one.purchasedOn)
          .toSorted((a, b) => b.getTime() - a.getTime())
          .at(0) ?? null,
    });
  }
  return stock;
};

/** A product nobody has bought or given yet: nothing in the store, and nothing going off. */
export const noMedicine = (): MedicineStock => ({ ...NOTHING, lots: [] });

/**
 * The Lot the latest dose of a product came out of: the one whose place in the order the store is used in — first to
 * expire, first used — holds the dose that brought the doses given to where they are now. Null when more has been
 * given than was ever written down as bought, which is a box nobody recorded rather than a Lot the farm can name.
 */
export const lotOfTheLatestDose = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  productId: string,
  /** The day the dose was given and the farm's warning, which the Lot's standing is read against. */
  window: ExpiryWindow
): Promise<LotLeft | null> => {
  const all = await medicineStockOf(tx, farmId, window);
  const stock = all.get(productId);
  if (!stock) {
    return null;
  }
  let through = 0;
  for (const lot of stock.lots) {
    through += lot.doses;
    // Named, and this way round, because the doses given reach into this Lot once those before it are used up.
    const itReachesThisLot = stock.dosesGiven <= through;
    if (itReachesThisLot) {
      return lot;
    }
  }
  return null;
};
