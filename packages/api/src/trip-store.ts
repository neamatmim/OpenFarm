import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { z } from "zod";

import type { Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";

/** Taka. One part of what an outing cost beyond the animals: the broker, the lorry, keeping the men. */
export const tripCostInput = z.number().min(0).max(10_000_000);

/** Which kind of outing a Money Event is for. */
type TripSource = "buying_trip" | "selling_trip";

/** What an outing cost the farm, its parts added up. A selling outing has no broker of its own: a broker's
 *  fee for one sale is recorded on that Sale. */
export const tripCostOf = (trip: {
  brokerBdt?: number;
  transportBdt: number;
  keepBdt: number;
}): number => (trip.brokerBdt ?? 0) + trip.transportBdt + trip.keepBdt;

/** What an outing's row and its animals come to, however the farm went: the trail's word for either kind. */
const snapshotOf = async (
  tx: Tx,
  row: {
    id: string;
    farmId: string;
    wentTo: string;
    transportBdt: number;
    keepBdt: number;
    wentOn: Date;
  },
  source: TripSource,
  animals: number
) => ({
  wentTo: row.wentTo,
  costBdt: tripCostOf(row),
  wentOn: row.wentOn,
  animals,
  money: await moneySnapshotOf(tx, row.farmId, source, row.id),
});

/**
 * Books what an outing cost the farm: one Money Event for the whole day, under that kind of outing's own
 * Category, so the same lorry cannot also be typed in by hand. An outing that cost nothing books nothing —
 * unless it was booked at a price before, which a Correction then puts right.
 */
const bookOuting = async (
  tx: Tx,
  booking: Booking,
  row:
    | {
        id: string;
        farmId: string;
        transportBdt: number;
        keepBdt: number;
        wentOn: Date;
        brokerBdt?: number;
      }
    | undefined,
  source: TripSource,
  paymentMethod: PaymentMethod | undefined
) => {
  if (!row) {
    return;
  }
  const costBdt = tripCostOf(row);
  if (costBdt > 0 || (await moneySnapshotOf(tx, row.farmId, source, row.id))) {
    await bookMoney(tx, booking, {
      source,
      sourceId: row.id,
      amountBdt: costBdt,
      occurredAt: row.wentOn,
      counterpartyId: null,
      paymentMethod,
    });
  }
};

/** The outing as the trail records it: where it went, what it cost, and who came home on it. */
export const readTrip = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.buyingTrip.findFirst({
    where: { id, farmId },
    with: { intakes: { columns: { animalId: true } } },
  });
  return row
    ? await snapshotOf(tx, row, "buying_trip", row.intakes.length)
    : null;
};

/** The selling outing as the trail records it, and who stood on the lorry. */
export const readSellingTrip = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.sellingTrip.findFirst({ where: { id, farmId } });
  if (!row) {
    return null;
  }
  const taken = await tx.query.sellingTripAnimal.findMany({
    where: { sellingTripId: id },
    columns: { animalId: true },
  });
  return await snapshotOf(tx, row, "selling_trip", taken.length);
};

export const bookTripMoney = async (
  tx: Tx,
  booking: Booking,
  tripId: string,
  paymentMethod: PaymentMethod | undefined
) =>
  await bookOuting(
    tx,
    booking,
    await tx.query.buyingTrip.findFirst({ where: { id: tripId } }),
    "buying_trip",
    paymentMethod
  );

export const bookSellingTripMoney = async (
  tx: Tx,
  booking: Booking,
  tripId: string,
  paymentMethod: PaymentMethod | undefined
) =>
  await bookOuting(
    tx,
    booking,
    await tx.query.sellingTrip.findFirst({ where: { id: tripId } }),
    "selling_trip",
    paymentMethod
  );
