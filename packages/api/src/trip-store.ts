import { eq } from "@OpenFarm/db/operators";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import { z } from "zod";

import type { Trail, Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";

/** Taka. One part of what an outing cost beyond the animals: the broker, the lorry, keeping the men. */
export const tripCostInput = z.number().min(0).max(10_000_000);

/** Which kind of outing a Money Event is for. */
type TripSource = "buying_trip" | "selling_trip";

/** What an outing cost the farm, its parts added up. A selling outing has no broker of its own: a broker's
 *  fee for one sale is recorded on that Sale. */
export const tripCostOf = (trip: {
  brokerMoney?: number;
  transportMoney: number;
  keepMoney: number;
}): number => (trip.brokerMoney ?? 0) + trip.transportMoney + trip.keepMoney;

/** What an outing's row and its animals come to, however the farm went: the trail's word for either kind. */
const snapshotOf = async (
  tx: Tx,
  row: {
    id: string;
    farmId: string;
    wentTo: string;
    transportMoney: number;
    keepMoney: number;
    wentOn: Date;
  },
  source: TripSource,
  animals: number
) => ({
  wentTo: row.wentTo,
  costMoney: tripCostOf(row),
  wentOn: row.wentOn,
  animals,
  money: await moneySnapshotOf(tx, row.farmId, source, row.id),
});

/**
 * Books what an outing cost the farm: one Money Event for the whole day, under that kind of outing's own
 * Category, so the same lorry cannot also be typed in by hand. An outing that cost nothing books nothing —
 * unless it was booked at a price before, which a Correction then puts right. In the purse given, or left as
 * it was booked where none is.
 */
const bookOuting = async (
  tx: Tx,
  booking: Booking,
  row:
    | {
        id: string;
        farmId: string;
        transportMoney: number;
        keepMoney: number;
        wentOn: Date;
        brokerMoney?: number;
      }
    | undefined,
  source: TripSource,
  paymentMethod: PaymentMethod | undefined,
  purseVentureId?: string | null
) => {
  if (!row) {
    return;
  }
  const costMoney = tripCostOf(row);
  if (
    costMoney > 0 ||
    (await moneySnapshotOf(tx, row.farmId, source, row.id))
  ) {
    await bookMoney(tx, booking, {
      source,
      sourceId: row.id,
      amountMoney: costMoney,
      occurredAt: row.wentOn,
      counterpartyId: null,
      paymentMethod,
      purseVentureId,
    });
  }
};

/** The Venture whose Buying Float paid for an outing, or nothing for one the Farm paid for itself. */
export const fundedBy = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  tripId: string
): Promise<string | null> => {
  const float = await tx.query.ventureMovement.findFirst({
    where: { farmId, buyingTripId: tripId, kind: "float_out" },
    columns: { ventureId: true },
  });
  return float?.ventureId ?? null;
};

/**
 * Moves what an outing cost into the purse of the Venture whose Float has just been drawn for it. Written up before the
 * Float went, as a day at the haat usually is, it was booked as the Farm's; the Float is what paid it. Only the purse
 * moves: the amount and whether it waits for the Owner stand as they were.
 */
export const paidFromTheFloat = async (
  tx: Tx,
  trail: Trail,
  {
    farmId,
    tripId,
    ventureId,
  }: { farmId: string; tripId: string; ventureId: string }
) => {
  const booked = await tx.query.moneyEvent.findFirst({
    where: { farmId, source: "buying_trip", sourceId: tripId },
    columns: { id: true, purseVentureId: true },
  });
  if (!booked || booked.purseVentureId === ventureId) {
    return;
  }
  await tx
    .update(moneyEvent)
    .set({ purseVentureId: ventureId })
    .where(eq(moneyEvent.id, booked.id));
  await trail(tx, {
    entity: "money_event",
    entityId: booked.id,
    action: "update",
    before: { purseVentureId: booked.purseVentureId },
    after: { purseVentureId: ventureId },
  });
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

/**
 * Books what a buying outing cost: in the purse of the Venture whose Float paid for it — the Float is the Animals
 * bought, the outing's costs and the cash brought back, so that money was the Venture's, as the Animals' prices are —
 * or the Farm's, where no Float did.
 */
export const bookTripMoney = async (
  tx: Tx,
  booking: Booking,
  tripId: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.buyingTrip.findFirst({ where: { id: tripId } });
  await bookOuting(
    tx,
    booking,
    row,
    "buying_trip",
    paymentMethod,
    row ? await fundedBy(tx, row.farmId, row.id) : undefined
  );
};

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
