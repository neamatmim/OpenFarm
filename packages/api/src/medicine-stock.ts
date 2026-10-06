import { dosePriceOf, roundMoney } from "@OpenFarm/domain";
import type { ExpiryStanding, ExpiryWindow } from "@OpenFarm/domain/lots";
import { expiryWindow } from "@OpenFarm/domain/lots";
import type { MedicineHappening } from "@OpenFarm/domain/medicine-store";
import { medicineStoreOf } from "@OpenFarm/domain/medicine-store";

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

/** A product's purchases, as a dose is costed from them. */
interface Purchase {
  id: string;
  purchasedOn: Date;
  priceMoney: number;
  doses: number;
}

/** Each product's purchases and everything that happened to its medicine, in the order it happened. */
interface ProductHistory {
  purchases: Purchase[];
  happenings: MedicineHappening[];
}

/**
 * Everything that happened to the farm's medicine, product by product: each Medicine Purchase coming in, each dose
 * given, each count. Up to a moment and without one count's own lines, for the book a count is set against.
 */
const historyOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  upTo?: { at: Date; excludingCompletion: string }
): Promise<Map<string, ProductHistory>> => {
  const purchases = await tx.query.medicinePurchase.findMany({
    where: { farmId, ...(upTo ? { purchasedOn: { lte: upTo.at } } : {}) },
    columns: {
      id: true,
      drugProductId: true,
      doses: true,
      priceMoney: true,
      lotNumber: true,
      expiresOn: true,
      purchasedOn: true,
    },
  });
  // One client to a transaction: read one after another.
  const given = await tx.query.treatment.findMany({
    where: {
      farmId,
      givenAt: upTo ? { isNotNull: true, lte: upTo.at } : { isNotNull: true },
    },
    columns: { id: true, productId: true, givenAt: true },
  });
  const counts = await tx.query.medicineCount.findMany({
    where: {
      farmId,
      ...(upTo
        ? {
            countedAt: { lte: upTo.at },
            completionId: { ne: upTo.excludingCompletion },
          }
        : {}),
    },
    columns: { drugProductId: true, counted: true, countedAt: true },
  });
  const history = new Map<string, ProductHistory>();
  const of = (productId: string) => {
    const known = history.get(productId) ?? { purchases: [], happenings: [] };
    history.set(productId, known);
    return known;
  };
  for (const one of purchases) {
    const line = of(one.drugProductId);
    line.purchases.push(one);
    line.happenings.push({
      kind: "bought",
      at: one.purchasedOn,
      lot: {
        id: one.id,
        quantity: one.doses,
        expiresOn: one.expiresOn,
        cameInOn: one.purchasedOn.toISOString(),
        lotNumber: one.lotNumber,
      },
    });
  }
  for (const one of given) {
    if (one.givenAt) {
      of(one.productId).happenings.push({
        kind: "given",
        at: one.givenAt,
        doseId: one.id,
      });
    }
  }
  for (const one of counts) {
    of(one.drugProductId).happenings.push({
      kind: "counted",
      at: one.countedAt,
      counted: one.counted,
    });
  }
  return history;
};

/**
 * Every product's medicine in the store, replayed in the order it happened (`medicineStoreOf`): Medicine Purchases
 * in, each dose out of the Lot first to expire among those already bought, and each count what was on the shelf. The
 * count wins, and nothing written afterwards about the days before it moves it.
 *
 * On hand is never below nothing. A farm that gave more doses than it wrote down buying had a purchase nobody
 * recorded, and says it holds none rather than a debt of doses — until a count says what was there.
 */
export const medicineStockOf = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  /** The farm's day and warning its Lots are read against. */
  window: ExpiryWindow
): Promise<Map<string, MedicineStock>> => {
  const history = await historyOf(tx, farmId);
  const stock = new Map<string, MedicineStock>();
  for (const [productId, { purchases, happenings }] of history) {
    const store = medicineStoreOf(happenings, window);
    stock.set(productId, {
      dosesIn: purchases.reduce((sum, one) => sum + one.doses, 0),
      dosesGiven: happenings.filter((one) => one.kind === "given").length,
      countedDifference: store.countedDifference,
      onHand: store.onHand,
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
        purchases
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
 * The Lot a dose came out of, as the store is replayed: the one first to expire among the Lots bought by then and not
 * yet used up or written off by a count. Null for a dose given from a box nobody wrote down — not a Lot the farm can
 * name. Once read as the Lot the doses-given-so-far reached in the order of use, which named a Lot a count had
 * already thrown out, or one bought after the dose.
 */
export const lotOfDose = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  dose: { id: string; productId: string },
  /** The day the dose was given and the farm's warning, which the Lot's standing is read against. */
  window: ExpiryWindow
): Promise<LotLeft | null> => {
  const everything = await historyOf(tx, farmId);
  const history = everything.get(dose.productId);
  if (!history) {
    return null;
  }
  const store = medicineStoreOf(history.happenings, window);
  const lotId = store.takenFrom.get(dose.id);
  const lot = store.lots.find((one) => one.id === lotId);
  return lot
    ? {
        purchaseId: lot.id,
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn,
        doses: lot.quantity,
        left: lot.left,
        standing: lot.standing,
      }
    : null;
};

/**
 * What the store was thought to hold of each product at a moment, in doses — the store replayed up to then, without
 * the count being set against it, so a count put right is compared against the same book — and what a dose of it
 * cost then, as a dose given then is costed (`dosePriceOf`): a count's shortfall and a dose given are one price.
 */
export const bookAt = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  at: Date,
  excludingCompletion: string
): Promise<Map<string, { expected: number; perDoseMoney: number | null }>> => {
  const history = await historyOf(tx, farmId, { at, excludingCompletion });
  const window = expiryWindow(at, 0);
  return new Map(
    [...history].map(([productId, { purchases, happenings }]) => {
      const price = dosePriceOf(purchases, at);
      return [
        productId,
        {
          expected: medicineStoreOf(happenings, window).onHand,
          perDoseMoney: price === null ? null : roundMoney(price),
        },
      ];
    })
  );
};
