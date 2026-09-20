import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { z } from "zod";

import type { Tx } from "./audit";
import { ownerOf } from "./intake-store";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";
import { bookSaleProceeds } from "./venture-store";

/** The Sale as the trail records it, so a Correction has the whole entry to supersede. */
export const readSale = async (tx: Tx, id: string) => {
  const row = await tx.query.sale.findFirst({
    where: { id },
    columns: {
      farmId: true,
      priceBdt: true,
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
  return { ...sold, money: await moneySnapshotOf(tx, farmId, "sale", id) };
};

/** The buyer as a Sale names them. */
export const buyerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
});

export const salePriceInput = z.number().min(0).max(100_000_000);

/**
 * Books what an animal fetched as the Sale now says it. A beast given away fetches nothing and books
 * nothing — unless she was booked at a price before, which a Correction then puts right.
 */
export const bookSaleMoney = async (
  tx: Tx,
  booking: Booking,
  id: string,
  /** Left out, the Money Event keeps the method it was booked with. */
  paymentMethod?: PaymentMethod
) => {
  const row = await tx.query.sale.findFirst({ where: { id } });
  if (!row) {
    return;
  }
  const { priceBdt } = row;
  const ventureId = await ownerOf(tx, row.animalId);
  if (priceBdt > 0 || (await moneySnapshotOf(tx, row.farmId, "sale", row.id))) {
    await bookMoney(tx, booking, {
      source: "sale",
      sourceId: row.id,
      amountBdt: priceBdt,
      occurredAt: row.soldAt,
      counterpartyId: row.counterpartyId,
      paymentMethod,
      // What she fetched belongs to whoever owned her, exactly as what she cost did.
      purseVentureId: ventureId,
    });
  }
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
      priceBdt,
      soldAt: row.soldAt,
      reference: her?.tagNumber ?? row.id,
    },
    booking.now,
    booking.actorId
  );
};
