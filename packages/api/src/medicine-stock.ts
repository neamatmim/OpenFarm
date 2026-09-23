import { leftOfEachLot } from "@OpenFarm/domain/lots";

import type { Tx } from "./audit";

/** What is left of one Medicine Purchase's Lot, and what it says on the box. */
export interface LotLeft {
  purchaseId: string;
  lotNumber: string | null;
  expiresOn: string | null;
  doses: number;
  left: number;
}

/** A product's medicine in the store: doses bought, doses given, what is left, and of which Lots. */
export interface MedicineStock {
  dosesIn: number;
  dosesGiven: number;
  onHand: number;
  /** In the order the store is used in: first to expire first. */
  lots: LotLeft[];
  /** The soonest day any Lot with doses left expires, or null when none with a day has any left. */
  nextExpiresOn: string | null;
}

const NOTHING: MedicineStock = {
  dosesIn: 0,
  dosesGiven: 0,
  onHand: 0,
  lots: [],
  nextExpiresOn: null,
};

/**
 * Every product's medicine in the store, worked out rather than counted, as a Feed Item's Stock on Hand is: the
 * doses of every Medicine Purchase in, less every dose given, each taken from the Lot that expires first.
 *
 * On hand is never below nothing. A farm that gave more doses than it wrote down buying had a purchase nobody
 * recorded, and says it holds none rather than a debt of doses.
 */
export const medicineStockOf = async (
  tx: Pick<Tx, "query">,
  farmId: string
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
  for (const productId of new Set([...boughtOf.keys(), ...givenOf.keys()])) {
    const bought = boughtOf.get(productId) ?? [];
    const dosesGiven = givenOf.get(productId) ?? 0;
    const dosesIn = bought.reduce((sum, one) => sum + one.doses, 0);
    const byId = new Map(bought.map((one) => [one.id, one] as const));
    const lots = leftOfEachLot(
      bought.map((one) => ({
        id: one.id,
        quantity: one.doses,
        expiresOn: one.expiresOn,
        cameInOn: one.purchasedOn.toISOString(),
      })),
      dosesGiven
    ).flatMap(({ id, left }) => {
      const one = byId.get(id);
      return one
        ? [
            {
              purchaseId: id,
              lotNumber: one.lotNumber,
              expiresOn: one.expiresOn,
              doses: one.doses,
              left,
            },
          ]
        : [];
    });
    const firstToGo = lots.find((one) => one.left > 0 && one.expiresOn);
    stock.set(productId, {
      dosesIn,
      dosesGiven,
      onHand: Math.max(0, dosesIn - dosesGiven),
      lots,
      nextExpiresOn: firstToGo?.expiresOn ?? null,
    });
  }
  return stock;
};

/** A product nobody has bought or given yet: nothing in the store, and nothing going off. */
export const noMedicine = (): MedicineStock => ({ ...NOTHING, lots: [] });
