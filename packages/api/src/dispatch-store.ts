import type { Database } from "@OpenFarm/db";
import { roundLitres } from "@OpenFarm/domain";

/** One Dispatch as the day, the record and the reports read it. */
export interface DispatchRow {
  id: string;
  dispatchedAt: Date;
  litres: number;
  buyerName: string;
  buyerAddress: string | null;
  challan: string | null;
  pricePerLitreBdt: number;
  fatPercent: number | null;
  snfPercent: number | null;
  note: string | null;
}

/** Every Dispatch in a stretch of time, oldest first, with the buyer as the farm had them that day. */
export const dispatchesBetween = async (
  db: Pick<Database, "query">,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<DispatchRow[]> => {
  const rows = await db.query.dispatch.findMany({
    where: { farmId, dispatchedAt: { gte: from, lt: until } },
    orderBy: { dispatchedAt: "asc", id: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    dispatchedAt: row.dispatchedAt,
    litres: Number(row.litres),
    buyerName: row.buyerName,
    buyerAddress: row.buyerAddress,
    challan: row.challan,
    pricePerLitreBdt: Number(row.pricePerLitreBdt),
    fatPercent: row.fatPercent === null ? null : Number(row.fatPercent),
    snfPercent: row.snfPercent === null ? null : Number(row.snfPercent),
    note: row.note,
  }));
};

/** Everything these Dispatches handed over, in litres. */
export const litresDispatched = (dispatches: readonly DispatchRow[]): number =>
  roundLitres(dispatches.reduce((sum, one) => sum + one.litres, 0));

/**
 * The litres the farm's Milk Records sent to Bulk in the Milking Sessions due in a stretch of time.
 *
 * By the Session, where a Dispatch goes by when the milk left: an evening's milk collected the next
 * morning is in the tank one day and out of the gate the next, and a day that shows both figures says
 * so rather than pretending they are the same milk.
 */
export const litresToBulkBetween = async (
  db: Pick<Database, "query">,
  farmId: string,
  { from, until }: { from: Date; until: Date }
): Promise<number> => {
  const sessions = await db.query.milkingSession.findMany({
    where: { farmId, dueAt: { gte: from, lt: until } },
    columns: { id: true },
    with: {
      records: {
        where: { destination: "bulk" },
        columns: { litres: true },
      },
    },
  });
  return roundLitres(
    sessions
      .flatMap((one) => one.records)
      .reduce((sum, record) => sum + Number(record.litres), 0)
  );
};
