import type { Database } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import { feeding } from "@OpenFarm/db/schema/feed";
import type { StockMovement } from "@OpenFarm/domain";
import { stockLedger } from "@OpenFarm/domain";

/** One Feed Item as the store holds it. */
export interface StockLine {
  feedItemId: string;
  nameBn: string;
  nameEn: string | null;
  /** The Feed Item's own unit — kg, bales, litres — which every quantity here is in. */
  unit: string;
  retiredAt: Date | null;
  /** Everything that came in, less everything the Feedings gave. Below nothing when the pens were fed
   *  from feed nobody wrote down arriving — shown, never refused. */
  onHand: number;
  /** Taka per unit, a moving weighted average over what is in the store; null for feed never bought. */
  averagePriceBdt: number | null;
  lastInOn: Date | null;
}

/**
 * Every movement in and out of the farm's store, by Feed Item: what came in, and what each Feeding
 * gave. Feedings are read in the database, a line per item per session, because a year of
 * twice-daily feeding across a farm's Pens is thousands of sessions.
 */
const movementsByItem = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string
): Promise<Map<string, StockMovement[]>> => {
  const [arrivals, given] = await Promise.all([
    db.query.feedIn.findMany({
      where: { farmId },
      columns: {
        feedItemId: true,
        quantity: true,
        priceBdt: true,
        receivedOn: true,
      },
    }),
    // A Feeding's lines are in each Feed Item's own unit; `givenKg` is the name the line was given
    // when every Ration was in kilos.
    db.execute<{ feed_item_id: string; fed_at: Date; given: string }>(
      sql`select line->>'feedItemId' as feed_item_id,
                 ${feeding.fedAt} as fed_at,
                 (line->>'givenKg')::numeric as given
            from ${feeding}, jsonb_array_elements(${feeding.lines}) as line
           where ${feeding.farmId} = ${farmId}`
    ),
  ]);
  const byItem = new Map<string, StockMovement[]>();
  const add = (feedItemId: string, movement: StockMovement) => {
    const list = byItem.get(feedItemId) ?? [];
    list.push(movement);
    byItem.set(feedItemId, list);
  };
  for (const one of arrivals) {
    add(one.feedItemId, {
      kind: "in",
      at: one.receivedOn,
      quantity: Number(one.quantity),
      priceBdt: one.priceBdt === null ? null : Number(one.priceBdt),
    });
  }
  for (const row of given.rows) {
    add(row.feed_item_id, {
      kind: "out",
      at: new Date(row.fed_at),
      quantity: Number(row.given),
    });
  }
  return byItem;
};

/**
 * Stock on Hand for every Feed Item the farm keeps, and what a unit of each cost, worked out from what
 * came in and what the Feedings gave — never stored, so a corrected Feeding or a Purchase written up
 * late moves it without anybody having to remember to.
 */
export const stockOnHand = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string
): Promise<StockLine[]> => {
  const [items, movements] = await Promise.all([
    db.query.feedItem.findMany({
      where: { farmId },
      columns: {
        id: true,
        nameBn: true,
        nameEn: true,
        unit: true,
        retiredAt: true,
      },
      orderBy: { nameBn: "asc", id: "asc" },
    }),
    movementsByItem(db, farmId),
  ]);
  return items.map((item) => {
    const mine = movements.get(item.id) ?? [];
    const lastIn = mine
      .filter((one) => one.kind === "in")
      .map((one) => one.at)
      .toSorted((a, b) => b.getTime() - a.getTime())
      .at(0);
    return {
      feedItemId: item.id,
      nameBn: item.nameBn,
      nameEn: item.nameEn,
      unit: item.unit,
      retiredAt: item.retiredAt,
      ...stockLedger(mine),
      lastInOn: lastIn ?? null,
    };
  });
};
