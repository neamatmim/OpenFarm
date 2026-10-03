import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { ventureMovement } from "@OpenFarm/db/schema/venture";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf, paymentMethodOf } from "./money-store";
import { assertCattleBudgetHolds, assertTripIsOpen } from "./venture-store";

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
 * Whose she was on a given day, and whose she is now — both.
 *
 * A Correction to a record from her old owner's time moves what that owner was settled on; one from her
 * present owner's time moves this one's. Reading only today's owner lets a Correction to a settled
 * Venture's record slip through under the name of whoever holds her now, which is the whole thing a
 * settled Venture is protected from.
 */
export const herVenturesAround = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  animalId: string,
  at: Date
): Promise<readonly string[]> => {
  const sales = await tx.query.internalSale.findMany({
    where: { farmId, animalId },
    columns: { fromVentureId: true, toVentureId: true, soldOn: true },
    orderBy: { soldOn: "asc", id: "asc" },
  });
  const now = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: { ownerVentureId: true },
  });
  // Before the first sale she belonged to whoever let her go in it; after each, to whoever took her on.
  let then =
    sales.length === 0
      ? (now?.ownerVentureId ?? null)
      : (sales[0]?.fromVentureId ?? null);
  for (const one of sales) {
    if (startOfFarmDay(one.soldOn) <= at) {
      then = one.toVentureId;
    }
  }
  return [...new Set([then, now?.ownerVentureId ?? null])].filter(
    (one) => one !== null
  );
};

/** Whose each of these animals is, in one query. */
export const theOwnersOf = async (
  tx: Pick<Tx, "query">,
  animalIds: readonly string[]
): Promise<(string | null)[]> => {
  if (animalIds.length === 0) {
    return [];
  }
  const rows = await tx.query.animal.findMany({
    where: { id: { in: [...animalIds] } },
    columns: { ownerVentureId: true },
  });
  return rows.map((one) => one.ownerVentureId);
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
  // What the farm handed over for her: the price and the livestock market's toll on her, which is not a second
  // payment to a second party but part of what she cost.
  const priceMoney = row.purchasePriceMoney + row.marketTollMoney;
  if (
    priceMoney > 0 ||
    (await moneySnapshotOf(tx, row.farmId, "intake", row.id))
  ) {
    await bookMoney(tx, booking, {
      source: "intake",
      sourceId: row.id,
      amountMoney: priceMoney,
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

/** This Farm's outing, and one still open — a Float already reconciled takes no more animals. */
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
  await assertTripIsOpen(tx, farmId, tripId);
};

/**
 * That an animal bought on a funded outing belongs to the purse that funded it: the Venture whose Float went, or the
 * Farm where the Owner handed the Farm's own.
 *
 * The Manager went to the livestock market with one purse's money, so every beast she brought home on that lorry
 * was bought with it. One written down as another purse's would be an animal one purse paid for and
 * another owns — and the Float could never be made to balance again.
 */
export const assertSheBelongsWithTheFloat = async (
  tx: Tx,
  farmId: string,
  { buyingTripId, ventureId }: { buyingTripId?: string; ventureId?: string }
) => {
  if (!buyingTripId) {
    return;
  }
  const float = await tx.query.ventureMovement.findFirst({
    where: { farmId, buyingTripId, kind: "float_out" },
    columns: { ventureId: true },
  });
  // The Farm's own Float is a Handover of cash naming the outing, not a Venture Movement.
  const farms = float
    ? null
    : await tx.query.handover.findFirst({
        where: { farmId, buyingTripId, float: "out" },
        columns: { id: true },
      });
  // Whose money the lorry went on: a Venture's, the Farm's (null), or nobody's yet.
  let paidBy: string | null | undefined;
  if (float) {
    paidBy = float.ventureId;
  } else if (farms) {
    paidBy = null;
  }
  if (paidBy !== undefined && paidBy !== (ventureId ?? null)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "That outing went to the livestock market on another purse's money",
      data: { refusal: "not_whose_float_bought_her" },
    });
  }
  // A Venture pays for a bull on an outing with its own Float, drawn before the lorry went: on an outing nobody's
  // Float paid for, her price would be in nobody's counted hand.
  if (paidBy === undefined && ventureId !== undefined) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No Float of this Venture's went on that outing",
      data: { refusal: "no_float_on_the_trip" },
    });
  }
};

/** The transfer or cheque a Venture's bull bought with no outing was paid by, or nothing where none was. */
export const boughtByBankReference = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  intakeId: string
): Promise<string | null> => {
  const paid = await tx.query.ventureMovement.findFirst({
    where: { farmId, intakeId, kind: "intake_out" },
    columns: { reference: true },
  });
  return paid?.reference ?? null;
};

/** That a Venture's Cattle Budget still holds what a bull at the gate cost, less what her own payment already took
 *  (`assertCattleBudgetHolds`). Nothing to ask of a Venture that is not there. */
const assertTheCattleBudgetHolds = async (
  tx: Tx,
  farmId: string,
  ventureId: string,
  {
    amountMoney,
    alreadyPaidMoney,
  }: { amountMoney: number; alreadyPaidMoney: number }
) => {
  const venture = await tx.query.venture.findFirst({
    where: { id: ventureId, farmId },
  });
  if (venture) {
    await assertCattleBudgetHolds(tx, farmId, venture, amountMoney, {
      alreadyPaidMoney,
    });
  }
};

/**
 * A Venture's bull bought with no outing — at the farm gate, from a neighbour — is paid straight from its account by
 * bank, and that payment is one `intake_out` Venture Movement written from her Intake, as a Sale's money is from the
 * Sale. Decided after every Intake and every Intake Correction, from the Intake as it now stands: written where she is
 * a Venture's with no outing, its amount moved with her price and Market toll, and taken away where she is the Farm's or on
 * an outing. Never cash, so no pocket carries Investors' money; never more than the Cattle Budget still holds.
 */
export const bookBoughtByBank = async (
  tx: Tx,
  intakeId: string,
  paid: {
    /** The transfer or cheque, for a payment not written yet; left out, the one already written stands. */
    reference?: string;
    /** The day the bank moved it; left out, the day she came. */
    movedOn?: string;
    /** Whether whoever is writing may move the Venture Account's money: the Owner's alone. */
    mayWrite: boolean;
    /** Held to what the Cattle Budget holds, as a bull taken in is. A Correction is not: it says what was so when
     *  she was bought, and by then buying may have closed and its money rolled into what keeps the animals. */
    withinTheCattleBudget: boolean;
    recordedBy: string;
    now: Date;
  }
) => {
  const row = await tx.query.intake.findFirst({
    where: { id: intakeId },
    columns: {
      id: true,
      farmId: true,
      animalId: true,
      buyingTripId: true,
      purchasePriceMoney: true,
      marketTollMoney: true,
      arrivedAt: true,
    },
  });
  if (!row) {
    return;
  }
  const ventureId = await ownerOf(tx, row.animalId);
  const already = await tx.query.ventureMovement.findFirst({
    where: { farmId: row.farmId, intakeId: row.id, kind: "intake_out" },
    columns: { id: true, ventureId: true, amountMoney: true },
  });
  if (!ventureId || row.buyingTripId !== null) {
    if (already) {
      await tx
        .delete(ventureMovement)
        .where(
          and(
            eq(ventureMovement.id, already.id),
            eq(ventureMovement.farmId, row.farmId)
          )
        );
    }
    return;
  }
  if (!(already || paid.mayWrite)) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "A Venture's bull bought with no outing is the Owner's to take in: it is paid from the Venture Account",
      data: { refusal: "owner_only" },
    });
  }
  const method = await paymentMethodOf(tx, row.farmId, "intake", row.id);
  const reference = paid.reference?.trim() || undefined;
  if (method !== "bank" || !(already || reference)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A Venture's bull bought with no outing is paid from its account by bank, with the reference",
      data: { refusal: "venture_buys_by_bank" },
    });
  }
  const amountMoney = row.purchasePriceMoney + row.marketTollMoney;
  if (paid.withinTheCattleBudget) {
    await assertTheCattleBudgetHolds(tx, row.farmId, ventureId, {
      amountMoney,
      alreadyPaidMoney:
        already?.ventureId === ventureId ? already.amountMoney : 0,
    });
  }
  if (already) {
    await tx
      .update(ventureMovement)
      .set({ ventureId, amountMoney, ...(reference ? { reference } : {}) })
      .where(
        and(
          eq(ventureMovement.id, already.id),
          eq(ventureMovement.farmId, row.farmId)
        )
      );
    return;
  }
  await tx.insert(ventureMovement).values({
    id: uuidv7(paid.now),
    farmId: row.farmId,
    ventureId,
    kind: "intake_out",
    intakeId: row.id,
    amountMoney,
    movedOn: paid.movedOn ?? farmDayOf(row.arrivedAt),
    reference: reference ?? "",
    recordedBy: paid.recordedBy,
    createdAt: paid.now,
  });
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

/** The livestock market's toll on one beast, as its slip gives it. Taka, like everything else the arrival cost. */
export const marketTollInput = z.number().min(0).max(10_000_000);
