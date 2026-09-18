import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";

/** The arrival as the trail records it: the Animal it made and what the farm paid for it. */
export const readIntake = async (tx: Tx, animalId: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: {
      tagNumber: true,
      sex: true,
      side: true,
      state: true,
      penId: true,
      // Whose she is, so a Correction that moves her between owners has a before and an after that
      // differ. Without it the trail would record the act and show nothing changed by it.
      ownerVentureId: true,
    },
    with: { intake: true },
  });
  return row
    ? {
        ...row,
        money: row.intake
          ? await moneySnapshotOf(
              tx,
              row.intake.farmId,
              "intake",
              row.intake.id
            )
          : null,
      }
    : null;
};

/** The seller as an Intake names them. */
export const sellerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
});

/** Whose animal she is, as her row says it: a Venture's id, or nothing for the Farm's own. */
export const ownerOf = async (tx: Tx, animalId: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: { ownerVentureId: true },
  });
  return row?.ownerVentureId ?? null;
};

/**
 * That this animal is one a Venture may own at all: bought in, and on the Fattening side. A calf born
 * here is the Farm's, and so is every cow in the milking herd — Investor money funds Fattening.
 */
export const assertAVentureMayOwnHer = async (tx: Tx, animalId: string) => {
  const her = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: { side: true, source: true },
  });
  if (her && (her.side !== "fattening" || her.source !== "bought")) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture owns bought-in Fattening animals and no others",
      data: { refusal: "not_a_ventures_animal" },
    });
  }
};

/**
 * Books what the farm paid for an animal as the Intake now says it. A bull given to the farm costs
 * nothing and books nothing — unless he was booked at a price before, which a Correction then puts right.
 */
export const bookIntakeMoney = async (
  tx: Tx,
  booking: Booking,
  intakeId: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.intake.findFirst({ where: { id: intakeId } });
  if (!row) {
    return;
  }
  // What the farm handed over for her: the price and the haat's toll on her, which is not a second
  // payment to a second party but part of what she cost.
  const priceBdt = Number(row.purchasePriceBdt) + Number(row.hasilBdt);
  if (
    priceBdt > 0 ||
    (await moneySnapshotOf(tx, row.farmId, "intake", row.id))
  ) {
    await bookMoney(tx, booking, {
      source: "intake",
      sourceId: row.id,
      amountBdt: priceBdt,
      occurredAt: row.arrivedAt,
      counterpartyId: row.counterpartyId,
      paymentMethod,
      // Whose money bought her. A Venture's buying is its own cost from the first beast, and the
      // Farm's books never carry a taka of it.
      purseVentureId: await ownerOf(tx, row.animalId),
    });
  }
};

/** Taka. Whole animals are bought in thousands; the column keeps poisha so finance can too. */
export const purchasePriceInput = z.number().min(0).max(100_000_000);

/**
 * Refuses an outing that is not this Farm's. An Intake names the Trip it came home on by id, and an id from
 * somewhere else would attach silently: her share would be lost, and another farm's outing would show an
 * animal it never carried.
 */
export const assertTripIsOurs = async (
  tx: Tx,
  farmId: string,
  tripId: string | undefined
) => {
  if (tripId === undefined) {
    return;
  }
  const ours = await tx.query.buyingTrip.findFirst({
    where: { id: tripId, farmId },
    columns: { id: true },
  });
  if (!ours) {
    throw new ORPCError("NOT_FOUND", { message: "No such outing" });
  }
};

/**
 * The Venture an arrival is bought for, checked before anything is written: this Farm's, and buying.
 * A Venture that has not started buying has no business owning cattle, and one that has finished has
 * its Investors' shares fixed against the animals it already holds.
 */
export const assertVentureIsBuying = async (
  tx: Tx,
  farmId: string,
  ventureId: string | undefined,
  { correcting = false } = {}
) => {
  if (ventureId === undefined) {
    return;
  }
  const ours = await tx.query.venture.findFirst({
    where: { id: ventureId, farmId },
    columns: { state: true },
  });
  if (!ours) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  // Buying to take an animal in. Putting a slip right is a different question: the Venture was buying
  // when she arrived, and by the time the mistake is noticed it may have moved on to fattening — the
  // Correction Window is thirty days and a Venture does not wait that long. What a Correction may never
  // do is hand her to a Venture whose books are closed.
  const allowed = correcting ? ["buying", "fattening", "selling"] : ["buying"];
  if (!allowed.includes(ours.state)) {
    throw new ORPCError("BAD_REQUEST", {
      message: correcting
        ? "That Venture's run is over"
        : "A Venture takes animals only while it is buying",
      data: { refusal: "venture_wrong_state" },
    });
  }
};

/** The haat's toll on one beast, as its slip gives it. Taka, like everything else the arrival cost. */
export const hasilInput = z.number().min(0).max(10_000_000);
