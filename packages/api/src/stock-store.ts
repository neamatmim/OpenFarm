import type { Database } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import { feeding } from "@OpenFarm/db/schema/feed";
import { weightedAveragePrice } from "@OpenFarm/domain";

/** One Feed Item as the store holds it. */
export interface StockLine {
  feedItemId: string;
  nameBn: string;
  nameEn: string | null;
  unit: string;
  /** Everything that came in, less everything the Feedings gave. Below nothing when the pens were fed
   *  from feed nobody wrote down arriving — shown, never refused. */
  onHand: number;
  /** Taka per unit, over everything bought; null for a Feed Item never bought. */
  averagePriceBdt: number | null;
  lastInOn: Date | null;
}

const ONE_DECIMAL = 10;
const roundOne = (value: number) =>
  Math.round(value * ONE_DECIMAL) / ONE_DECIMAL;

/**
 * Stock on Hand for every Feed Item the farm keeps, worked out from what came in and what the
 * Feedings gave, and never stored: a Feeding corrected, or a purchase recorded late, moves it without
 * anybody having to remember to.
 *
 * What the Feedings gave is summed in the database, because a year of twice-daily feeding across a
 * farm's Pens is thousands of sessions, and every one of them is a line on this screen.
 */
export const stockOnHand = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string
): Promise<StockLine[]> => {
  const [items, arrivals, given] = await Promise.all([
    db.query.feedItem.findMany({
      where: { farmId },
      columns: { id: true, nameBn: true, nameEn: true, unit: true },
      orderBy: { nameBn: "asc", id: "asc" },
    }),
    db.query.feedIn.findMany({
      where: { farmId },
      columns: {
        feedItemId: true,
        kind: true,
        quantity: true,
        priceBdt: true,
        receivedOn: true,
      },
    }),
    db.execute<{ feed_item_id: string; given: string }>(
      sql`select line->>'feedItemId' as feed_item_id,
                 sum((line->>'givenKg')::numeric) as given
            from ${feeding}, jsonb_array_elements(${feeding.lines}) as line
           where ${feeding.farmId} = ${farmId}
           group by 1`
    ),
  ]);
  const givenByItem = new Map(
    given.rows.map((row) => [row.feed_item_id, Number(row.given)])
  );
  return items.map((item) => {
    const mine = arrivals.filter((one) => one.feedItemId === item.id);
    const cameIn = mine.reduce((sum, one) => sum + Number(one.quantity), 0);
    const lastIn = mine
      .map((one) => one.receivedOn)
      .toSorted((a, b) => b.getTime() - a.getTime())
      .at(0);
    return {
      feedItemId: item.id,
      nameBn: item.nameBn,
      nameEn: item.nameEn,
      unit: item.unit,
      onHand: roundOne(cameIn - (givenByItem.get(item.id) ?? 0)),
      averagePriceBdt: weightedAveragePrice(
        mine
          .filter((one) => one.kind === "purchase" && one.priceBdt !== null)
          .map((one) => ({
            quantity: Number(one.quantity),
            priceBdt: Number(one.priceBdt),
          }))
      ),
      lastInOn: lastIn ?? null,
    };
  });
};
