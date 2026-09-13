import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, notInArray, sql } from "@OpenFarm/db/operators";
import { feeding, stockCount } from "@OpenFarm/db/schema/feed";
import type { StockMovement } from "@OpenFarm/domain";
import { stockLedger } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";
import type { RaisedAlert } from "./instances-store";

/** One Feed Item as the store holds it. */
export interface StockLine {
  feedItemId: string;
  nameBn: string;
  nameEn: string | null;
  /** The Feed Item's own unit — kg, bales, litres — which every quantity here is in. */
  unit: string;
  retiredAt: Date | null;
  /** Below this much, the Manager is told. Null for a Feed Item nobody watches. */
  lowStockAt: number | null;
  /** Everything that came in, less everything the Feedings gave. Below nothing when the pens were fed
   *  from feed nobody wrote down arriving — shown, never refused. */
  onHand: number;
  /** Taka per unit, a moving weighted average over what is in the store; null for feed never bought. */
  averagePriceBdt: number | null;
  lastInOn: Date | null;
}

/**
 * Every movement in and out of the farm's store, by Feed Item: what came in, what each Feeding gave,
 * and what each Stock Count found. Feedings are read in the database, a line per item per session,
 * because a year of twice-daily feeding across a farm's Pens is thousands of sessions.
 *
 * A count being recorded again is left out of what it is compared against — otherwise a corrected
 * count would find the store already holding what it said the first time.
 */
export const movementsByItem = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  { excludingCount }: { excludingCount?: string } = {}
): Promise<Map<string, StockMovement[]>> => {
  const [arrivals, given, counts] = await Promise.all([
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
    db.query.stockCount.findMany({
      where: { farmId },
      columns: {
        feedItemId: true,
        completionId: true,
        counted: true,
        countedAt: true,
      },
    }),
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
  for (const one of counts) {
    if (one.completionId !== excludingCount) {
      add(one.feedItemId, {
        kind: "count",
        at: one.countedAt,
        counted: Number(one.counted),
      });
    }
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
        lowStockAt: true,
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
      lowStockAt: item.lowStockAt === null ? null : Number(item.lowStockAt),
      ...stockLedger(mine),
      lastInOn: lastIn ?? null,
    };
  });
};

/**
 * The Feed Items running low: watched, and holding less than the farm said it wants to hear about.
 * Worked out each time, so a lorry that came in takes an item off the list without anybody clearing it.
 */
export const runningLow = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string
) => {
  const lines = await stockOnHand(db, farmId);
  return lines.flatMap((line) =>
    line.lowStockAt !== null &&
    line.retiredAt === null &&
    line.onHand < line.lowStockAt
      ? [
          {
            feedItemId: line.feedItemId,
            nameBn: line.nameBn,
            unit: line.unit,
            onHand: line.onHand,
            threshold: line.lowStockAt,
            lastInOn: line.lastInOn,
          },
        ]
      : []
  );
};

type RunningLow = Awaited<ReturnType<typeof runningLow>>[number];

/**
 * What a low-stock notice is about: the Feed Item, and the last time anything came into it. Once per
 * item per time it ran low — a lorry that came in and was fed down again is a new thing to be told
 * about, and a store still low since the last notice is not.
 */
const lowStockNoticeId = (low: RunningLow): string =>
  `${low.feedItemId}:${low.lastInOn?.toISOString() ?? "never"}`;

/** Whether any of these is still worth telling the Manager about. Asked before a transaction is
 *  opened: a sweep with nothing new to say is not an event. */
export const anyLowStockUntold = async (
  db: Pick<Database, "query">,
  farmId: string,
  low: RunningLow[]
): Promise<boolean> => {
  if (low.length === 0) {
    return false;
  }
  const ids = low.map(lowStockNoticeId);
  const told = await db.query.alert.findMany({
    where: { farmId, kind: "low_stock", entityId: { in: ids } },
    columns: { entityId: true },
  });
  const said = new Set(told.map((row) => row.entityId));
  return ids.some((id) => !said.has(id));
};

/**
 * Tells the Manager a Feed Item is running low — in the digest, never by a buzz (notification
 * channels: low feed stock → Manager, digest). The concentrate running out is tomorrow's problem, and
 * a phone that buzzes for tomorrow's problems is a phone nobody answers today.
 */
export const raiseLowStockAlerts = async (
  tx: Tx,
  farmId: string,
  low: RunningLow[],
  now: Date
): Promise<RaisedAlert[]> => {
  const managers = await holdersOf(tx, farmId, ["manager"]);
  const raised: RaisedAlert[] = [];
  for (const line of low) {
    const notice = {
      kind: "low_stock" as const,
      entity: "feed_item",
      entityId: lowStockNoticeId(line),
      params: {
        nameBn: line.nameBn,
        unit: line.unit,
        onHand: line.onHand,
        threshold: line.threshold,
      },
    };
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await raiseAlerts(tx, farmId, managers, notice, now);
    raised.push(...rows.map((row) => ({ ...row, ...notice })));
  }
  return raised;
};

/** One Feed Item as a Stock Count Step recorded it. */
export interface StockCountLine {
  feedItemId: string;
  counted: number;
  reason?: string;
}

/** A count within a tenth of a unit of the store is a count that agrees with it. */
const AGREES_WITHIN = 0.05;

/**
 * Books a Stock Count: for each Feed Item, what the store was thought to hold at the moment it was
 * counted, what was really there, and why they differ. The count wins from then on.
 *
 * A difference without a reason is refused — the whole point of counting is that nothing is quietly
 * absorbed. Recorded again (a phone replaying, or a Correction), it is compared against the store as
 * it stood without itself and its lines are replaced, so its difference is booked once; an item left
 * out of the corrected count is no longer counted.
 */
export const recordStockCount = async (
  tx: Tx,
  entry: {
    farmId: string;
    completionId: string;
    counts: StockCountLine[];
    countedAt: Date;
    countedBy: string;
    now: Date;
  }
): Promise<{ feedItemId: string; difference: number }[]> => {
  const items = await tx.query.feedItem.findMany({
    where: {
      farmId: entry.farmId,
      id: { in: entry.counts.map((line) => line.feedItemId) },
    },
    columns: { id: true },
  });
  const known = new Set(items.map((item) => item.id));
  const unknown = entry.counts.find((line) => !known.has(line.feedItemId));
  if (unknown) {
    throw new ORPCError("NOT_FOUND", { message: "No such feed" });
  }
  const movements = await movementsByItem(tx, entry.farmId, {
    excludingCount: entry.completionId,
  });
  const adjustments: { feedItemId: string; difference: number }[] = [];
  for (const line of entry.counts) {
    const expected = stockLedger(
      movements.get(line.feedItemId) ?? [],
      entry.countedAt
    ).onHand;
    const difference = Math.round((line.counted - expected) * 10) / 10;
    const differs = Math.abs(difference) > AGREES_WITHIN;
    const reason = line.reason?.trim() || null;
    if (differs && !reason) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A count that differs from the store says why",
        data: {
          refusal: "difference_needs_reason",
          feedItemId: line.feedItemId,
        },
      });
    }
    if (differs) {
      adjustments.push({ feedItemId: line.feedItemId, difference });
    }
    const values = {
      expected: expected.toFixed(1),
      counted: line.counted.toFixed(1),
      reason: differs ? reason : null,
      countedAt: entry.countedAt,
      countedBy: entry.countedBy,
      recordedAt: entry.now,
    };
    // Sequential: one row per Feed Item against one unique index.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .insert(stockCount)
      .values({
        id: uuidv7(entry.now),
        farmId: entry.farmId,
        feedItemId: line.feedItemId,
        completionId: entry.completionId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [stockCount.completionId, stockCount.feedItemId],
        set: values,
      });
  }
  // A Feed Item this count no longer counts — corrected out, or the whole count skipped — is not a
  // count any more. Effects may take back what they themselves wrote.
  await tx.delete(stockCount).where(
    and(
      eq(stockCount.completionId, entry.completionId),
      entry.counts.length > 0
        ? notInArray(
            stockCount.feedItemId,
            entry.counts.map((line) => line.feedItemId)
          )
        : undefined
    )
  );
  return adjustments;
};
