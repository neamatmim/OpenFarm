import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { paidAtTheGate } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { ownerOf } from "./intake-store";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf, paymentMethodOf } from "./money-store";
import { bookSaleProceeds } from "./venture-store";

/** The Sale as the trail records it, so a Correction has the whole entry to supersede. */
export const readSale = async (tx: Tx, id: string) => {
  const row = await tx.query.sale.findFirst({
    where: { id },
    columns: {
      farmId: true,
      priceMoney: true,
      bakiMoney: true,
      brokerMoney: true,
      promisedBy: true,
      weightKg: true,
      destination: true,
      vehicle: true,
      driver: true,
      note: true,
      soldAt: true,
    },
    with: { buyer: { columns: { name: true } } },
  });
  if (!row) {
    return null;
  }
  const { farmId, ...sold } = row;
  return {
    ...sold,
    money: await moneySnapshotOf(tx, farmId, "sale", id),
    brokerMoneyEvent: await moneySnapshotOf(tx, farmId, "sale_broker", id),
  };
};

/** The buyer as a Sale names them. */
export const buyerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
});

export const salePriceInput = z.number().min(0).max(100_000_000);

/** What a broker at the haat took for one Sale, in taka. */
export const brokerInput = z.number().int().min(0).max(1_000_000);

/**
 * Books what the broker at the haat took for this Sale as the Sale now says it: out of the Farm's own purse, as a
 * Selling Trip is, and repaid by a Venture in its Reimbursement where she was its animal. Nothing where there was no
 * broker — unless one was booked before, which a Correction then puts right.
 */
const bookBrokerMoney = async (
  tx: Tx,
  booking: Booking,
  row: { id: string; farmId: string; brokerMoney: number; soldAt: Date }
) => {
  if (
    row.brokerMoney > 0 ||
    (await moneySnapshotOf(tx, row.farmId, "sale_broker", row.id))
  ) {
    await bookMoney(tx, booking, {
      source: "sale_broker",
      sourceId: row.id,
      amountMoney: row.brokerMoney,
      occurredAt: row.soldAt,
      counterpartyId: null,
    });
  }
};

/**
 * Books what the buyer paid for her as the Sale now says it: her price, less whatever he still owed as she left. A
 * beast given away fetches nothing and books nothing, and nor does one taken all on Baki — unless she was booked at a
 * price before, which a Correction then puts right.
 *
 * A Venture's animal leaves paid in full, so one with anything owing is refused here, where every way a Sale is
 * written or put right comes through: Investors' money is never lent to a trader, and a Venture Account holds what
 * a buyer paid, not what he promised.
 */
export const bookSaleMoney = async (
  tx: Tx,
  booking: Booking,
  id: string,
  /** Left out, the Money Event keeps the method it was booked with. */
  paymentMethod?: PaymentMethod,
  /** Whose hand took the notes, where the record names one (`assertTheHand`); left out, as `handOf` decides. */
  heldBy?: string
) => {
  const row = await tx.query.sale.findFirst({ where: { id } });
  if (!row) {
    return;
  }
  const { priceMoney } = row;
  const ventureId = await ownerOf(tx, row.animalId);
  if (ventureId && row.bakiMoney > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture's animal leaves paid in full",
      data: { refusal: "venture_paid_in_full" },
    });
  }
  // A Venture Account takes a buyer's money by bank, or as cash deposited with its slip — never by bKash, whose number
  // is the Farm's own.
  const method =
    paymentMethod ??
    (await paymentMethodOf(tx, row.farmId, "sale", row.id)) ??
    undefined;
  if (ventureId && method === "bkash") {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A Venture's animal is paid for by bank or in cash, never by bKash",
      data: { refusal: "venture_sale_not_by_bkash" },
    });
  }
  const paidMoney = paidAtTheGate(priceMoney, row.bakiMoney);
  if (
    paidMoney > 0 ||
    (await moneySnapshotOf(tx, row.farmId, "sale", row.id))
  ) {
    await bookMoney(tx, booking, {
      source: "sale",
      sourceId: row.id,
      amountMoney: paidMoney,
      occurredAt: row.soldAt,
      counterpartyId: row.counterpartyId,
      paymentMethod,
      ...(heldBy === undefined ? {} : { heldBy }),
      // What she fetched belongs to whoever owned her, exactly as what she cost did.
      purseVentureId: ventureId,
    });
  }
  await bookBrokerMoney(tx, booking, row);
  const her = await tx.query.animal.findFirst({
    where: { id: row.animalId, farmId: row.farmId },
    columns: { tagNumber: true },
  });
  // Asked whether she is a Venture's or not: a Correction saying she was the Farm's all along has a
  // movement of its own to undo.
  await bookSaleProceeds(
    tx,
    {
      id: row.id,
      farmId: row.farmId,
      ventureId,
      priceMoney,
      soldAt: row.soldAt,
      // By bank, the transfer's own reference, which is what the Venture Account's statement reads; otherwise her tag.
      reference:
        (method === "bank" && booking.account?.sources.includes("sale")
          ? booking.account.reference?.trim()
          : undefined) ||
        (her?.tagNumber ?? row.id),
      // Taken in cash, it is in the hand that took it until it is deposited with its slip.
      inCash:
        (await paymentMethodOf(tx, row.farmId, "sale", row.id)) === "cash",
    },
    booking.now,
    booking.actorId
  );
};
