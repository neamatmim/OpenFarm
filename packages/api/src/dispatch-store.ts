import type { Database } from "@OpenFarm/db";
import { roundLitres, startOfFarmDay } from "@OpenFarm/domain";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The farm days from `from` to `to`, both included, as the instants that bound them. */
export const farmDaysBetween = (from: string, to: string) => ({
  from: startOfFarmDay(from),
  until: new Date(startOfFarmDay(to).getTime() + DAY_MS),
});

/** Every Dispatch in a stretch of farm days, oldest first, with the buyer it went to. */
export const dispatchesBetween = async (
  db: Pick<Database, "query">,
  farmId: string,
  { from, until }: { from: Date; until: Date }
) => {
  const rows = await db.query.dispatch.findMany({
    where: { farmId, dispatchedAt: { gte: from, lt: until } },
    with: { buyer: { columns: { name: true, address: true, phone: true } } },
    orderBy: { dispatchedAt: "asc", id: "asc" },
  });
  return rows.map(({ buyer, ...row }) => ({
    id: row.id,
    dispatchedAt: row.dispatchedAt,
    litres: Number(row.litres),
    buyerName: buyer.name,
    buyerAddress: buyer.address,
    buyerPhone: buyer.phone,
    challan: row.challan,
    pricePerLitreBdt: Number(row.pricePerLitreBdt),
    fatPercent: row.fatPercent === null ? null : Number(row.fatPercent),
    snfPercent: row.snfPercent === null ? null : Number(row.snfPercent),
    note: row.note,
  }));
};

/** The litres the farm's Milk Records sent to Bulk in a stretch of time, by the Session they belong to. */
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
