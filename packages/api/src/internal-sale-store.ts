import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { internalSale } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import type { TargetWindow } from "@OpenFarm/domain";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { joinTheFattening } from "./joining-store";
import type { Booking } from "./money-store";
import { bookMoney } from "./money-store";
import { priceAtWeight } from "./venture-store";

/** What she last weighed, and the reading the price is struck from: none for one never weighed since her Intake. */
export interface Weighed {
  id: string | null;
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
  rateMoneyPerKg: number;
  /** Where the Farm takes her on: the Target Window of the Season she joins — the next Eid where none is said. */
  targetWindow?: TargetWindow;
  /** Where the rate came from. An Investor asking years later why his bull was worth that is owed a
   *  figure and a reason. */
  note: string;
  soldOn: string;
  paymentMethod: PaymentMethod;
  reference: string;
  /**
   * Paid for already, and at what: a Venture's lost animal the Farm made good, found again. The made-good transfer
   * was the Farm paying for her, so the sale moves no money of its own — no Venture Movement, no Money Event — and is
   * struck at what was made good rather than at a rate a kilo.
   */
  madeGood?: { priceMoney: number };
}

/**
 * Refuses an Internal Sale dated before she came off the lorry, or before the last that changed her hands: she cannot
 * have been sold by an owner who did not have her yet, and whose she was on each day is read from these days.
 */
const assertSoldAfterShe = async (
  tx: Tx,
  farmId: string,
  animalId: string,
  soldOn: string
): Promise<void> => {
  const [arrived, last] = await Promise.all([
    tx.query.intake.findFirst({
      where: { farmId, animalId },
      columns: { arrivedAt: true },
    }),
    tx.query.internalSale.findFirst({
      where: { farmId, animalId },
      orderBy: { soldOn: "desc", id: "desc" },
      columns: { soldOn: true },
    }),
  ]);
  const cameOn = arrived ? farmDayOf(arrived.arrivedAt) : null;
  if ((cameOn && soldOn < cameOn) || (last && soldOn < last.soldOn)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "She cannot be sold on a day before she came, or before she last changed hands",
      data: { refusal: "sold_before_she_came" },
    });
  }
};

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
): Promise<{ id: string; weightKg: number; priceMoney: number }> => {
  const { now, actorId } = booking;
  const farmId = booking.farm.id;
  // A day that has not come yet: she would be the new owner's at once, and her death or Sale before that day refused.
  if (hand.soldOn > farmDayOf(now)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "She cannot change hands on a day that has not come yet",
      data: { refusal: "sold_in_the_future" },
    });
  }
  await assertSoldAfterShe(tx, farmId, hand.animalId, hand.soldOn);
  const priceMoney =
    hand.madeGood?.priceMoney ??
    priceAtWeight(hand.weighed.weightKg, hand.rateMoneyPerKg);
  await tx.insert(internalSale).values({
    id: hand.id,
    farmId,
    animalId: hand.animalId,
    fromVentureId: hand.from,
    toVentureId: hand.to,
    weightKg: hand.weighed.weightKg.toFixed(2),
    weighInId: hand.weighed.id,
    rateMoneyPerKg: hand.rateMoneyPerKg.toFixed(2),
    priceMoney,
    note: hand.note,
    soldOn: hand.soldOn,
    recordedBy: actorId,
    createdAt: now,
  });
  // One movement per Venture side. Where the Farm is one of the sides it has none: a Venture Account is
  // the only account here, and the Farm's own books are answered separately. Made good already, none at all.
  const sides = (
    hand.madeGood
      ? []
      : [
          hand.to === null
            ? null
            : { ventureId: hand.to, kind: "internal_buy" as const },
          hand.from === null
            ? null
            : { ventureId: hand.from, kind: "internal_sell" as const },
        ]
  ).filter((side) => side !== null);
  for (const side of sides) {
    // oxlint-disable-next-line no-await-in-loop -- one transaction, one statement at a time
    await tx.insert(ventureMovement).values({
      id: uuidv7(now),
      farmId,
      ventureId: side.ventureId,
      kind: side.kind,
      internalSaleId: hand.id,
      amountMoney: priceMoney,
      movedOn: hand.soldOn,
      reference: hand.reference,
      recordedBy: actorId,
      createdAt: now,
    });
  }
  // The Farm's own side is a Money Event, because taka really enters or leaves the Farm: it sold a bull,
  // or it bought one. Only where the Farm is a side — between two Ventures no money of the Farm's has
  // moved, and its books say nothing.
  if (!hand.madeGood && (hand.from === null || hand.to === null)) {
    await bookMoney(tx, booking, {
      // The Farm letting her go is money in; the Farm taking her on is money out.
      source: hand.from === null ? "internal_sale_in" : "internal_sale_out",
      sourceId: hand.id,
      amountMoney: priceMoney,
      occurredAt: startOfFarmDay(hand.soldOn),
      counterpartyId: null,
      paymentMethod: hand.paymentMethod,
    });
  }
  await tx
    .update(animal)
    .set({ ownerVentureId: hand.to, updatedAt: now })
    .where(eq(animal.id, hand.animalId));
  // Taken on by the Farm, she joins one of its Seasons at the price it paid: the discretionary sale and the buy-back
  // at wind-up alike.
  if (hand.to === null) {
    await joinTheFattening(tx, {
      farmId,
      animalId: hand.animalId,
      joinedAt: now,
      how: "bought_from_venture",
      internalSaleId: hand.id,
      targetWindow: hand.targetWindow,
      price: {
        priceMoney,
        weighInId: hand.weighed.id,
        weightKg: hand.weighed.weightKg,
        rateMoneyPerKg: hand.rateMoneyPerKg,
        note: hand.note,
        pricedBy: actorId,
        pricedAt: now,
      },
      recordedBy: actorId,
      now,
    });
  }
  return { id: hand.id, weightKg: hand.weighed.weightKg, priceMoney };
};
