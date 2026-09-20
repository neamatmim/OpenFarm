import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { internalSale } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { ventureMovement } from "@OpenFarm/db/schema/venture";
import { startOfFarmDay } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney } from "./money-store";
import { priceAtWeight } from "./venture-store";

/** What she last weighed, and the reading the price is struck from. */
export interface Weighed {
  id: string;
  weightKg: number;
}

/** One animal changing hands inside the farm: who is letting her go, who is taking her on, and at what. */
export interface Handover {
  /** The Internal Sale's own id, so the caller can key its Audit Event on it before the write. */
  id: string;
  animalId: string;
  /** A Venture's id, or nothing for the Farm's own herd. */
  from: string | null;
  to: string | null;
  weighed: Weighed;
  rateBdtPerKg: number;
  /** Where the rate came from. An Investor asking years later why his bull was worth that is owed a
   *  figure and a reason. */
  note: string;
  soldOn: string;
  paymentMethod: PaymentMethod;
  reference: string;
}

/**
 * Records one Internal Sale, whole: the sale itself, a movement for each Venture side, the Farm's own
 * Money Event where the Farm is one of the sides, and her owner changing with the money.
 *
 * One place, because the Owner's discretionary sale and the buy-back at wind-up are the same act at
 * different moments — and two copies of "what an animal changing purses does to the books" would be two
 * copies to keep in step. What differs between them is who may do it and when, which is their own to say.
 */
export const recordInternalSale = async (
  tx: Tx,
  /** Whose farm, whose hand and when, all off the one Booking the Money Event is written from: a second
   *  farm id passed beside it would be a second answer nothing reconciles. */
  booking: Booking,
  hand: Handover
): Promise<{ id: string; weightKg: number; priceBdt: number }> => {
  const { now, actorId } = booking;
  const farmId = booking.farm.id;
  const priceBdt = priceAtWeight(hand.weighed.weightKg, hand.rateBdtPerKg);
  await tx.insert(internalSale).values({
    id: hand.id,
    farmId,
    animalId: hand.animalId,
    fromVentureId: hand.from,
    toVentureId: hand.to,
    weightKg: hand.weighed.weightKg.toFixed(2),
    weighInId: hand.weighed.id,
    rateBdtPerKg: hand.rateBdtPerKg.toFixed(2),
    priceBdt: priceBdt.toFixed(2),
    note: hand.note,
    soldOn: hand.soldOn,
    recordedBy: actorId,
    createdAt: now,
  });
  // One movement per Venture side. Where the Farm is one of the sides it has none: a Venture Account is
  // the only account here, and the Farm's own books are answered separately.
  const sides = [
    hand.to === null
      ? null
      : { ventureId: hand.to, kind: "internal_buy" as const },
    hand.from === null
      ? null
      : { ventureId: hand.from, kind: "internal_sell" as const },
  ].filter((side) => side !== null);
  for (const side of sides) {
    // oxlint-disable-next-line no-await-in-loop -- one transaction, one statement at a time
    await tx.insert(ventureMovement).values({
      id: uuidv7(now),
      farmId,
      ventureId: side.ventureId,
      kind: side.kind,
      internalSaleId: hand.id,
      amountBdt: priceBdt,
      movedOn: hand.soldOn,
      reference: hand.reference,
      recordedBy: actorId,
      createdAt: now,
    });
  }
  // The Farm's own side is a Money Event, because taka really enters or leaves the Farm: it sold a bull,
  // or it bought one. Only where the Farm is a side — between two Ventures no money of the Farm's has
  // moved, and its books say nothing.
  if (hand.from === null || hand.to === null) {
    await bookMoney(tx, booking, {
      // The Farm letting her go is money in; the Farm taking her on is money out.
      source: hand.from === null ? "internal_sale_in" : "internal_sale_out",
      sourceId: hand.id,
      amountBdt: priceBdt,
      occurredAt: startOfFarmDay(hand.soldOn),
      counterpartyId: null,
      paymentMethod: hand.paymentMethod,
    });
  }
  await tx
    .update(animal)
    .set({ ownerVentureId: hand.to, updatedAt: now })
    .where(eq(animal.id, hand.animalId));
  return { id: hand.id, weightKg: hand.weighed.weightKg, priceBdt };
};
