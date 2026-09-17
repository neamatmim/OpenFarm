import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { z } from "zod";

import type { Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";

/** Taka. One part of what an outing cost beyond the animals: the broker, the lorry, keeping the men. */
export const tripCostInput = z.number().min(0).max(10_000_000);

/** What an outing cost the farm, its three parts added up. */
export const tripCostOf = (trip: {
  brokerBdt: string;
  transportBdt: string;
  keepBdt: string;
}): number =>
  Number(trip.brokerBdt) + Number(trip.transportBdt) + Number(trip.keepBdt);

/** The outing as the trail records it: where it went, what it cost, and who came home on it. */
export const readTrip = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.buyingTrip.findFirst({
    where: { id, farmId },
    with: { intakes: { columns: { animalId: true } } },
  });
  return row
    ? {
        wentTo: row.wentTo,
        brokerBdt: Number(row.brokerBdt),
        transportBdt: Number(row.transportBdt),
        keepBdt: Number(row.keepBdt),
        wentOn: row.wentOn,
        animals: row.intakes.length,
        money: await moneySnapshotOf(tx, row.farmId, "buying_trip", row.id),
      }
    : null;
};

/**
 * Books what an outing cost the farm. One Money Event for the whole trip, under the Trip's own Category, so
 * the same lorry cannot also be typed in by hand as an expense. An outing that cost nothing books nothing —
 * unless it was booked at a price before, which a Correction then puts right.
 */
export const bookTripMoney = async (
  tx: Tx,
  booking: Booking,
  tripId: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.buyingTrip.findFirst({ where: { id: tripId } });
  if (!row) {
    return;
  }
  const costBdt = tripCostOf(row);
  if (
    costBdt > 0 ||
    (await moneySnapshotOf(tx, row.farmId, "buying_trip", row.id))
  ) {
    await bookMoney(tx, booking, {
      source: "buying_trip",
      sourceId: row.id,
      amountBdt: costBdt,
      occurredAt: row.wentOn,
      counterpartyId: null,
      paymentMethod,
    });
  }
};
