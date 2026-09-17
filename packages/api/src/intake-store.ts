import type { PaymentMethod } from "@OpenFarm/db/schema/money";
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
    });
  }
};

/** Taka. Whole animals are bought in thousands; the column keeps poisha so finance can too. */
export const purchasePriceInput = z.number().min(0).max(100_000_000);

/** The haat's toll on one beast, as its slip gives it. Taka, like everything else the arrival cost. */
export const hasilInput = z.number().min(0).max(10_000_000);
