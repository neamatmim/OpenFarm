import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, notInArray, sql } from "@OpenFarm/db/operators";
import type { FEED_IN_KINDS } from "@OpenFarm/db/schema/feed";
import { feeding, stockCount } from "@OpenFarm/db/schema/feed";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import type { StockMovement } from "@OpenFarm/domain";
import {
  farmDayOf,
  lastFellBelow,
  roundKg,
  roundTaka,
  startOfFarmDay,
  stockLedger,
} from "@OpenFarm/domain";
import { leftOfEachLot } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";

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
  /** What a kilo is worth when the farm grows it itself. Null for anything it does not grow. */
  fodderPriceBdt: number | null;
  /** Everything that came in, less everything the Feedings gave. Below nothing when the pens were fed
   *  from feed nobody wrote down arriving — shown, never refused. */
  onHand: number;
  /** Taka per unit, a moving weighted average over what is in the store; null for feed never bought. */
  averagePriceBdt: number | null;
  lastInOn: Date | null;
  /** Holding less than the level the Manager set: what puts it on the queue and in the digest. */
  runningLow: boolean;
  /** What is left of each delivery still in the store, the first to expire fed first. Deliveries all fed out
   *  are left off. */
  lots: {
    arrivalId: string;
    lotNumber: string | null;
    expiresOn: string | null;
    left: number;
  }[];
  /** The soonest day any delivery with feed left expires, or null when none with a day has any left. */
  nextExpiresOn: string | null;
  /** That delivery's Lot Number, so the bag can be found. */
  nextLotNumber: string | null;
  /** Feed still in the store from deliveries already past their day. */
  expiredLeft: number;
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
  // Corrections call this inside a transaction. Its PostgreSQL client may only execute one query at a time.
  const arrivals = await db.query.feedIn.findMany({
    where: { farmId },
    columns: {
      feedItemId: true,
      quantity: true,
      priceBdt: true,
      receivedOn: true,
    },
  });
  // A Feeding's lines are in each Feed Item's own unit; `givenKg` is the name the line was given
  // when every Ration was in kilos.
  const given = await db.execute<{
    feed_item_id: string;
    fed_at: Date;
    given: string;
  }>(
    sql`select line->>'feedItemId' as feed_item_id,
               ${feeding.fedAt} as fed_at,
               (line->>'givenKg')::numeric as given
          from ${feeding}, jsonb_array_elements(${feeding.lines}) as line
         where ${feeding.farmId} = ${farmId}`
  );
  const counts = await db.query.stockCount.findMany({
    where: { farmId },
    columns: {
      feedItemId: true,
      completionId: true,
      counted: true,
      countedAt: true,
    },
  });
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
      priceBdt: one.priceBdt === null ? null : one.priceBdt,
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
  farmId: string,
  /** When "already past its day" is judged from: the request's own clock. */
  now: Date = new Date()
): Promise<StockLine[]> => {
  // The farm's own day, which the deliveries' days sort against as text.
  const today = farmDayOf(now);
  const [items, movements, arrivals] = await Promise.all([
    db.query.feedItem.findMany({
      where: { farmId },
      columns: {
        id: true,
        nameBn: true,
        nameEn: true,
        unit: true,
        retiredAt: true,
        lowStockAt: true,
        fodderPriceBdt: true,
      },
      orderBy: { nameBn: "asc", id: "asc" },
    }),
    movementsByItem(db, farmId),
    db.query.feedIn.findMany({
      where: { farmId },
      columns: {
        id: true,
        feedItemId: true,
        quantity: true,
        lotNumber: true,
        expiresOn: true,
        receivedOn: true,
      },
    }),
  ]);
  return items.map((item) => {
    const mine = movements.get(item.id) ?? [];
    const ledger = stockLedger(mine);
    // Whatever is not on hand was used, whether fed or found short at a count, and it is taken from the
    // deliveries in the order a careful storeman feeds them: first to expire, first out.
    const delivered = arrivals.filter((one) => one.feedItemId === item.id);
    const cameIn = delivered.reduce(
      (sum, one) => sum + Number(one.quantity),
      0
    );
    const byId = new Map(delivered.map((one) => [one.id, one] as const));
    const lots = leftOfEachLot(
      delivered.map((one) => ({
        id: one.id,
        quantity: Number(one.quantity),
        expiresOn: one.expiresOn,
        cameInOn: one.receivedOn.toISOString(),
      })),
      cameIn - Math.max(0, ledger.onHand)
    ).flatMap(({ id, left }) => {
      const one = byId.get(id);
      return one && left > 0
        ? [
            {
              arrivalId: id,
              lotNumber: one.lotNumber,
              expiresOn: one.expiresOn,
              left,
            },
          ]
        : [];
    });
    const lastIn = mine
      .filter((one) => one.kind === "in")
      .map((one) => one.at)
      .toSorted((a, b) => b.getTime() - a.getTime())
      .at(0);
    const firstToGo = lots.find((one) => one.expiresOn);
    return {
      feedItemId: item.id,
      nameBn: item.nameBn,
      nameEn: item.nameEn,
      unit: item.unit,
      retiredAt: item.retiredAt,
      lowStockAt: item.lowStockAt === null ? null : Number(item.lowStockAt),
      fodderPriceBdt: item.fodderPriceBdt === null ? null : item.fodderPriceBdt,
      ...ledger,
      runningLow:
        item.lowStockAt !== null &&
        item.retiredAt === null &&
        ledger.onHand < Number(item.lowStockAt),
      lastInOn: lastIn ?? null,
      lots,
      nextExpiresOn: firstToGo?.expiresOn ?? null,
      nextLotNumber: firstToGo?.lotNumber ?? null,
      expiredLeft: lots
        .filter((one) => one.expiresOn !== null && one.expiresOn < today)
        .reduce((sum, one) => sum + one.left, 0),
    };
  });
};

/**
 * The Feed Items running low: watched, and holding less than the level the farm said it wants to hear
 * about — and since when, which is what a notice about it is keyed on. Worked out each time, so a lorry
 * that came in takes an item off the list without anybody clearing it.
 *
 * Asks first whether anything is watched at all. Every home screen and every sweep calls this, and on
 * a farm that watches nothing it should cost one small query, not the whole store's history.
 */
export const runningLow = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string
) => {
  const watched = await db.query.feedItem.findMany({
    where: {
      farmId,
      lowStockAt: { isNotNull: true },
      retiredAt: { isNull: true },
    },
    columns: { id: true, nameBn: true, unit: true, lowStockAt: true },
    orderBy: { nameBn: "asc", id: "asc" },
  });
  if (watched.length === 0) {
    return [];
  }
  const movements = await movementsByItem(db, farmId);
  return watched.flatMap((item) => {
    const mine = movements.get(item.id) ?? [];
    const level = Number(item.lowStockAt);
    const { onHand } = stockLedger(mine);
    return onHand < level
      ? [
          {
            feedItemId: item.id,
            nameBn: item.nameBn,
            unit: item.unit,
            onHand,
            threshold: level,
            fellBelowAt: lastFellBelow(mine, level),
          },
        ]
      : [];
  });
};

type RunningLow = Awaited<ReturnType<typeof runningLow>>[number];

/**
 * What a low-stock notice is about: the Feed Item, and the moment it last fell below its level. Once
 * each time it runs low — brought back up by a lorry or by a count that found more, and then fed down
 * again, is a new thing to be told about; still low since the last notice is not.
 */
const lowStockNoticeId = (low: RunningLow): string =>
  `${low.feedItemId}:${low.fellBelowAt?.toISOString() ?? "start"}`;

/**
 * Tells the Manager a Feed Item is running low — in the digest, never by a buzz (notification
 * channels: low feed stock → Manager, digest). The concentrate running out is tomorrow's problem, and
 * a phone that buzzes for tomorrow's problems is a phone nobody answers today.
 *
 * Asked before any transaction is opened, per Manager, whether any of them has yet to be told: a sweep
 * with nothing new to say is not an event, and a farm with no Manager has nobody to tell.
 */
export const lowStockToTell = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  low: RunningLow[]
): Promise<{ managers: string[]; untold: RunningLow[] }> => {
  const managers = await holdersOf(db as Tx, farmId, ["manager"]);
  if (low.length === 0 || managers.length === 0) {
    return { managers, untold: [] };
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId,
      kind: "low_stock",
      entityId: { in: low.map(lowStockNoticeId) },
    },
    columns: { entityId: true, userId: true },
  });
  const said = new Set(told.map((row) => `${row.userId}|${row.entityId}`));
  const untold = low.filter((line) =>
    managers.some((userId) => !said.has(`${userId}|${lowStockNoticeId(line)}`))
  );
  return { managers, untold };
};

/** Raises the low-stock notices for these Feed Items. Who hears them is the Notice's to say. */
export const raiseLowStockAlerts = async (
  tx: Tx,
  farmId: string,
  { untold }: { untold: RunningLow[] },
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  // The Managers are the same people for every Feed Item running low.
  const remembering = rememberingPeople();
  for (const line of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "low_stock",
        // The store running low, not the Feed Item row: the notice is about one time it ran low, and the Feed Item
        // travels in its facts.
        about: { id: lowStockNoticeId(line) },
        facts: {
          feedItemId: line.feedItemId,
          nameBn: line.nameBn,
          unit: line.unit,
          onHand: line.onHand,
          threshold: line.threshold,
        },
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};

/** One Feed Item as a Stock Count Step recorded it. */
export interface StockCountLine {
  feedItemId: string;
  counted: number;
  reason?: string;
}

/** A Feed Item whose count differed from what the store was thought to hold, and by how much. */
export interface StockAdjustment {
  feedItemId: string;
  difference: number;
}

/**
 * Books a Stock Count: for each Feed Item, what the store was thought to hold at the moment it was
 * counted, what was really there, and why they differ. The count wins from then on.
 *
 * Every Feed Item the farm keeps is counted, or none is: a count that leaves the concentrate out is a
 * count with a hole the store would read straight through. A retired Feed Item is not counted, and a
 * difference without a reason is refused — every item that differs is named, so a count synced days
 * later can be put right in one go. Recorded again (a phone replaying, or a Correction), it is compared
 * against the store as it stood without itself and its lines are replaced, so its difference is
 * booked once.
 */
export const recordStockCount = async (
  tx: Tx,
  entry: {
    farmId: string;
    completionId: string;
    /** Empty when the Step was skipped: nothing was counted. */
    counts: StockCountLine[];
    skipped: boolean;
    countedAt: Date;
    countedBy: string;
    now: Date;
  }
): Promise<StockAdjustment[]> => {
  if (entry.skipped) {
    await tx
      .delete(stockCount)
      .where(eq(stockCount.completionId, entry.completionId));
    return [];
  }
  const items = await tx.query.feedItem.findMany({
    where: { farmId: entry.farmId },
    columns: { id: true, retiredAt: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  if (entry.counts.some((line) => !byId.has(line.feedItemId))) {
    throw new ORPCError("NOT_FOUND", { message: "No such feed" });
  }
  if (entry.counts.some((line) => byId.get(line.feedItemId)?.retiredAt)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A retired feed is not counted",
      data: { refusal: "feed_retired" },
    });
  }
  const countedIds = new Set(entry.counts.map((line) => line.feedItemId));
  const missing = items
    .filter((item) => !(item.retiredAt || countedIds.has(item.id)))
    .map((item) => item.id);
  if (missing.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A count counts every feed the farm keeps",
      data: { refusal: "count_incomplete", feedItemIds: missing },
    });
  }
  const movements = await movementsByItem(tx, entry.farmId, {
    excludingCount: entry.completionId,
  });
  const lines = entry.counts.map((line) => {
    const counted = roundKg(line.counted);
    const expected = stockLedger(
      movements.get(line.feedItemId) ?? [],
      entry.countedAt
    ).onHand;
    return {
      ...line,
      counted,
      expected,
      difference: roundKg(counted - expected),
      reason: line.reason?.trim() || null,
    };
  });
  const unexplained = lines.filter(
    (line) => line.difference !== 0 && !line.reason
  );
  if (unexplained.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A count that differs from the store says why",
      data: {
        refusal: "difference_needs_reason",
        feedItemIds: unexplained.map((line) => line.feedItemId),
      },
    });
  }
  for (const line of lines) {
    const values = {
      expected: line.expected.toFixed(1),
      counted: line.counted.toFixed(1),
      reason: line.difference === 0 ? null : line.reason,
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
  // An item a corrected count no longer counts — retired since — is not a count any more.
  await tx
    .delete(stockCount)
    .where(
      and(
        eq(stockCount.completionId, entry.completionId),
        notInArray(stockCount.feedItemId, [...countedIds])
      )
    );
  return lines
    .filter((line) => line.difference !== 0)
    .map((line) => ({
      feedItemId: line.feedItemId,
      difference: line.difference,
    }));
};

/**
 * The differences the Stock Counts booked, newest first, as they read now: what the store was thought
 * to hold at the moment of each count — worked out again, so a Feeding or a delivery written up late but
 * dated before the count shows in it rather than standing in the adjustment as a loss — what the count
 * found, and the reason, with what was expected when the count was made kept beside it.
 */
export const adjustmentsOf = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  feedItemId?: string
) => {
  const rows = await db.query.stockCount.findMany({
    where: {
      farmId,
      reason: { isNotNull: true },
      ...(feedItemId ? { feedItemId } : {}),
    },
    with: {
      feedItem: { columns: { nameBn: true, unit: true } },
      counter: { columns: { name: true } },
    },
    orderBy: { countedAt: "desc", id: "desc" },
    limit: 200,
  });
  if (rows.length === 0) {
    return [];
  }
  const readAgain = new Map<string, Map<string, StockMovement[]>>();
  const movementsWithout = async (completionId: string) => {
    const known = readAgain.get(completionId);
    if (known) {
      return known;
    }
    // Sequential by construction: a few counts a month, each read once.
    const fresh = await movementsByItem(db, farmId, {
      excludingCount: completionId,
    });
    readAgain.set(completionId, fresh);
    return fresh;
  };
  const out = [];
  for (const row of rows) {
    // oxlint-disable-next-line no-await-in-loop
    const movements = await movementsWithout(row.completionId);
    const expected = stockLedger(
      movements.get(row.feedItemId) ?? [],
      row.countedAt
    ).onHand;
    const counted = Number(row.counted);
    out.push({
      id: row.id,
      feedItemId: row.feedItemId,
      nameBn: row.feedItem.nameBn,
      unit: row.feedItem.unit,
      completionId: row.completionId,
      countedAt: row.countedAt,
      countedByName: row.counter?.name ?? null,
      expected,
      expectedWhenCounted: Number(row.expected),
      counted,
      difference: roundKg(counted - expected),
      reason: row.reason,
    });
  }
  return out;
};

export const sellerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** A tenth of the Feed Item's unit is the smallest amount the store keeps. */
export const quantityInput = z.number().min(0.1).max(1_000_000);

export const feedPriceInput = z.number().positive().max(100_000_000);

/** What came in, as the trail records it either side of a change. */
export const readFeedArrival = async (tx: Tx, id: string) => {
  const row = await tx.query.feedIn.findFirst({ where: { id } });
  return row
    ? { ...row, money: await moneySnapshotOf(tx, row.farmId, "feed_in", id) }
    : null;
};

/** Books a feed Purchase's money as it now stands. A harvest from the farm's own fields is feed and not
 *  money, and books nothing. */
export const bookPurchaseMoney = async (
  tx: Tx,
  booking: Booking,
  id: string,
  paymentMethod: PaymentMethod | undefined
) => {
  const row = await tx.query.feedIn.findFirst({ where: { id } });
  // A Harvest is worth something to whoever eats it, but the farm paid nobody for it: it values the
  // store, and no money moved.
  if (row?.kind === "harvest") {
    return;
  }
  if (row?.priceBdt) {
    await bookMoney(tx, booking, {
      source: "feed_in",
      sourceId: row.id,
      amountBdt: row.priceBdt,
      occurredAt: row.receivedOn,
      counterpartyId: row.counterpartyId,
      paymentMethod,
    });
  }
};

/** What a cut lot is worth: the Feed Item's Fodder Price times the kilos, or nothing while the farm has
 *  put no price on its own fodder. */
export const fodderValueOf = (
  item: { fodderPriceBdt: number | null },
  quantity: number
): number | null =>
  item.fodderPriceBdt === null
    ? null
    : roundTaka(item.fodderPriceBdt * quantity);

/**
 * A Purchase names what the lot cost and the seller it came from; a Harvest from the farm's own
 * fields names neither. One without the other's pieces is refused rather than guessed at: a purchase
 * nobody could account for, or money that never changed hands.
 */
export const assertShapeOf = (arrival: {
  kind: (typeof FEED_IN_KINDS)[number];
  priced: boolean;
  seller: boolean;
}) => {
  if (arrival.kind === "purchase" && !(arrival.priced && arrival.seller)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A purchase names what it cost and who sold it",
      data: { refusal: "purchase_needs_price_and_seller" },
    });
  }
  if (arrival.kind === "harvest" && (arrival.priced || arrival.seller)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A harvest comes from the farm's own fields, at no price",
      data: { refusal: "harvest_has_no_price" },
    });
  }
};

/** The farm day feed came in, refused when that day has not come yet. */
export const receivedDay = (day: string, now: Date): Date => {
  const receivedOn = startOfFarmDay(day);
  if (receivedOn > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Feed cannot have come in on a day that has not come yet",
      data: { refusal: "received_in_the_future" },
    });
  }
  return receivedOn;
};
