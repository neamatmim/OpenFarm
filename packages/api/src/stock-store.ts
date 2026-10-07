import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, notInArray, sql } from "@OpenFarm/db/operators";
import type { FEED_IN_KINDS } from "@OpenFarm/db/schema/feed";
import { feeding, stockCount } from "@OpenFarm/db/schema/feed";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import type {
  PurchasePrice,
  SellerOnTheScale,
  StockMovement,
} from "@OpenFarm/domain";
import {
  lastFellBelow,
  farmDayOf,
  daysLeftOf,
  fedPerDayOf,
  priceJumped,
  purchasePricesOf,
  sellersOnTheScale,
  roundKg,
  roundMoney,
  shortfallOf,
  startOfFarmDay,
  stockLedger,
  countedOverTheBook,
  SMALLEST_FEED_AMOUNT,
  unitPriceOf,
} from "@OpenFarm/domain";
import type {
  ExpiryStanding,
  ExpiryWindow,
  LotHappening,
  LotIn,
} from "@OpenFarm/domain/lots";
import { cameInAt, replayLots, runsLow } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import type { Booking } from "./money-store";
import { bookMoney, moneySnapshotOf } from "./money-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell, whoHears } from "./notice";
import { insideATransaction, keptUntilAWrite } from "./writes-seen";

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
  fodderPriceMoney: number | null;
  /** Everything that came in, less everything the Feedings gave. Below nothing when the pens were fed
   *  from feed nobody wrote down arriving — shown, never refused. */
  onHand: number;
  /** Taka per unit, a moving weighted average over what is in the store; null for feed never bought. */
  averagePriceMoney: number | null;
  lastInOn: Date | null;
  /** Holding less than the level the Manager set, or fewer days of it than the farm's line at the rate it is fed: what
   *  puts it on the queue and in the digest. */
  runningLow: boolean;
  /** What it has been fed a day lately, in its own unit; nothing for one not fed in the last fortnight. */
  fedPerDay: number | null;
  /** How many whole days the store lasts at that rate; nothing for one not fed lately, or retired. */
  daysLeft: number | null;
  /** What is left of every delivery, the first to expire fed first — nothing, of one all fed out — and where
   *  each stands against its day. */
  lots: {
    arrivalId: string;
    lotNumber: string | null;
    expiresOn: string | null;
    left: number;
    standing: ExpiryStanding;
  }[];
  /** The soonest day any delivery with feed left expires, or null when none with a day has any left. */
  nextExpiresOn: string | null;
  /** That delivery's Lot Number, so the bag can be found. */
  nextLotNumber: string | null;
  /** Where that delivery stands against its day; none when there is no such delivery. */
  nextStanding: ExpiryStanding;
  /** Feed still in the store from deliveries already past their day. */
  expiredLeft: number;
}

const MS_PER_SECOND = 1000;

/** One delivery of feed as its Lot: what came, its bag's number and day. */
type FeedLot = LotIn & { lotNumber: string | null };

/**
 * Every movement in and out of the farm's store, by Feed Item: what came in, what each Feeding gave,
 * and what each Stock Count found. Feedings are read in the database, a line per item per session,
 * because a year of twice-daily feeding across a farm's Pens is thousands of sessions.
 */
const everyMovement = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string
): Promise<Map<string, StockMovement[]>> => {
  // Corrections call this inside a transaction. Its PostgreSQL client may only execute one query at a time.
  const arrivals = await db.query.feedIn.findMany({
    where: { farmId },
    columns: {
      id: true,
      feedItemId: true,
      quantity: true,
      priceMoney: true,
      receivedOn: true,
      recordedAt: true,
      lotNumber: true,
      expiresOn: true,
    },
  });
  // A Feeding's lines are in each Feed Item's own unit; `givenKg` is the name the line was given
  // when every Ration was in kilos. The moment it was fed comes back as seconds since 1970: a moment kept without its
  // zone read back as text would be taken for the server's local time, six hours early on a server in Dhaka.
  const given = await db.execute<{
    feed_item_id: string;
    fed_at_seconds: string;
    given: string;
  }>(
    sql`select line->>'feedItemId' as feed_item_id,
               extract(epoch from ${feeding.fedAt}) as fed_at_seconds,
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
      // Written down on its own day, it came in by then — after a count that morning, not before it (`cameInAt`).
      at: cameInAt(one.receivedOn, one.recordedAt),
      quantity: Number(one.quantity),
      priceMoney: one.priceMoney === null ? null : one.priceMoney,
      lot: { id: one.id, lotNumber: one.lotNumber, expiresOn: one.expiresOn },
    });
  }
  for (const one of counts) {
    add(one.feedItemId, {
      kind: "count",
      at: one.countedAt,
      counted: Number(one.counted),
      completionId: one.completionId,
    });
  }
  for (const row of given.rows) {
    add(row.feed_item_id, {
      kind: "out",
      at: new Date(Number(row.fed_at_seconds) * MS_PER_SECOND),
      quantity: Number(row.given),
    });
  }
  return byItem;
};

/**
 * The farm's store, every movement by Feed Item (`everyMovement`), kept until something is written: Home, the overview,
 * the Feed page and the sweep on every opening of the staff's page all read it. A transaction reads it afresh.
 *
 * A count being recorded again is left out of what it is compared against — otherwise a corrected
 * count would find the store already holding what it said the first time.
 */
export const movementsByItem = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  { excludingCount }: { excludingCount?: string } = {}
): Promise<Map<string, StockMovement[]>> => {
  const every = insideATransaction(db)
    ? await everyMovement(db, farmId)
    : await keptUntilAWrite("feedStore", farmId, () =>
        everyMovement(db, farmId)
      );
  if (excludingCount === undefined) {
    return every;
  }
  return new Map(
    [...every].map(([feedItemId, movements]) => [
      feedItemId,
      movements.filter(
        (one) => one.kind !== "count" || one.completionId !== excludingCount
      ),
    ])
  );
};

/** The moment a store's days of feed are read at, and the farm's line under which it is Running Low. */
export interface DaysReading {
  now: Date;
  feedDaysLow: number;
}

/**
 * Whether one Feed Item is Running Low, and why: under the level the Manager set for it, or — read at a moment — with
 * fewer days of it left than the farm's line at the rate it has been fed. Never one retired.
 */
const lowOf = (
  item: { lowStockAt: string | null; retiredAt: Date | null },
  mine: readonly StockMovement[],
  onHand: number,
  reading: DaysReading | undefined
): {
  runningLow: boolean;
  because: "level" | "days" | null;
  fedPerDay: number | null;
  daysLeft: number | null;
} => {
  const retired = item.retiredAt !== null;
  const underTheLevel = runsLow({
    onHand,
    level: item.lowStockAt === null ? null : Number(item.lowStockAt),
    retired,
  });
  const perDay = reading && !retired ? fedPerDayOf(mine, reading.now) : 0;
  const daysLeft = daysLeftOf(onHand, perDay);
  const fewDays =
    !retired && daysLeft !== null && reading !== undefined
      ? daysLeft < reading.feedDaysLow
      : false;
  let because: "level" | "days" | null = null;
  if (underTheLevel) {
    because = "level";
  } else if (fewDays) {
    because = "days";
  }
  return {
    runningLow: because !== null,
    because,
    fedPerDay: perDay > 0 ? roundKg(perDay) : null,
    daysLeft,
  };
};

/** The last time a store was brought back up — a delivery or a count — before a moment: what a Feed Item running low
 *  by its days is told about once, until the next. */
const lastBroughtUp = (
  mine: readonly StockMovement[],
  now: Date
): Date | null => {
  let last: Date | null = null;
  for (const one of mine) {
    if (
      one.kind !== "out" &&
      one.at <= now &&
      (last === null || one.at > last)
    ) {
      last = one.at;
    }
  }
  return last;
};

/**
 * Stock on Hand for every Feed Item the farm keeps, and what a unit of each cost, worked out from what
 * came in and what the Feedings gave — never stored, so a corrected Feeding or a Purchase written up
 * late moves it without anybody having to remember to.
 */
export const stockOnHand = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  /** The farm's day and warning its deliveries are read against: the request's own clock, never the machine's. */
  window: ExpiryWindow,
  /** The moment and the farm's line its days of feed are read against; without it, no days are said. */
  reading?: DaysReading
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
        fodderPriceMoney: true,
      },
      orderBy: { nameBn: "asc", id: "asc" },
    }),
    movementsByItem(db, farmId),
  ]);
  return items.map((item) => {
    const mine = movements.get(item.id) ?? [];
    const ledger = stockLedger(mine);
    // Each delivery's feed, replayed in the order things happened (`replayLots`): fed from the deliveries first to
    // expire among those already in, a count taking what it did not find the same way.
    const store = replayLots(
      mine.flatMap((one): LotHappening<FeedLot>[] => {
        if (one.kind === "in") {
          return one.lot
            ? [
                {
                  kind: "in",
                  at: one.at,
                  lot: {
                    ...one.lot,
                    quantity: one.quantity,
                    cameInOn: one.at.toISOString(),
                  },
                },
              ]
            : [];
        }
        return one.kind === "out"
          ? [{ kind: "out", at: one.at, quantity: one.quantity }]
          : [{ kind: "counted", at: one.at, counted: one.counted }];
      }),
      window
    );
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
      fodderPriceMoney:
        item.fodderPriceMoney === null ? null : item.fodderPriceMoney,
      ...ledger,
      ...lowOf(item, mine, ledger.onHand, reading),
      lastInOn: lastIn ?? null,
      lots: store.lots.map((one) => ({
        arrivalId: one.id,
        lotNumber: one.lotNumber,
        expiresOn: one.expiresOn,
        left: one.left,
        standing: one.standing,
      })),
      nextExpiresOn: store.next?.expiresOn ?? null,
      nextLotNumber: store.next?.lotNumber ?? null,
      nextStanding: store.next?.standing ?? "none",
      expiredLeft: store.pastItsDay,
    };
  });
};

/**
 * The Feed Items running low: holding less than the level the farm said it wants to hear about, or fewer days of it
 * than the farm's line at the rate it has been fed lately (the Owner, 2026-09-29) — and since when, which is what a
 * notice about it is keyed on: when it fell under its level, or, for its days, when the store was last brought up.
 * Worked out each time, so a lorry that came in takes an item off the list without anybody clearing it.
 *
 * Every feed the farm still keeps is read, since any feed that is fed can run short of days.
 */
export const runningLow = async (
  db: Pick<Database, "query" | "execute">,
  farm: { id: string; feedDaysLow: number },
  now: Date
) => {
  const kept = await db.query.feedItem.findMany({
    where: { farmId: farm.id, retiredAt: { isNull: true } },
    columns: {
      id: true,
      nameBn: true,
      unit: true,
      lowStockAt: true,
      retiredAt: true,
    },
    orderBy: { nameBn: "asc", id: "asc" },
  });
  if (kept.length === 0) {
    return [];
  }
  const movements = await movementsByItem(db, farm.id);
  const reading = { now, feedDaysLow: farm.feedDaysLow };
  return kept.flatMap((item) => {
    const mine = movements.get(item.id) ?? [];
    const { onHand } = stockLedger(mine);
    const low = lowOf(item, mine, onHand, reading);
    if (!low.because) {
      return [];
    }
    const level = item.lowStockAt === null ? null : Number(item.lowStockAt);
    return [
      {
        feedItemId: item.id,
        nameBn: item.nameBn,
        unit: item.unit,
        onHand,
        because: low.because,
        daysLeft: low.daysLeft,
        // What it is under: the Manager's level, or the days' worth of it at the rate it is fed.
        threshold:
          low.because === "level"
            ? (level ?? 0)
            : roundKg((low.fedPerDay ?? 0) * farm.feedDaysLow),
        fellBelowAt:
          low.because === "level" && level !== null
            ? lastFellBelow(mine, level)
            : lastBroughtUp(mine, now),
      },
    ];
  });
};

type RunningLow = Awaited<ReturnType<typeof runningLow>>[number];

/**
 * What a low-stock notice is about: the Feed Item, and the moment it last fell below its level. Once
 * each time it runs low — brought back up by a lorry or by a count that found more, and then fed down
 * again, is a new thing to be told about; still low since the last notice is not.
 */
const lowStockNoticeId = (low: RunningLow): string =>
  low.because === "days"
    ? `${low.feedItemId}:days:${low.fellBelowAt?.toISOString() ?? "start"}`
    : `${low.feedItemId}:${low.fellBelowAt?.toISOString() ?? "start"}`;

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
  // As `tell` will tell it: the Owner on a farm with no Manager, and a Manager who has left not counted as never told.
  const managers = await whoHears(db, farmId, "low_stock", { id: "" });
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
  /** The store's average price when it was counted: what the difference is worth a unit. Null for feed never bought. */
  priceMoney: number | null;
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
    columns: { id: true, nameBn: true, retiredAt: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  if (entry.counts.some((line) => !byId.has(line.feedItemId))) {
    throw new ORPCError("NOT_FOUND", { message: "No such feed" });
  }
  const retired = entry.counts
    .map((line) => byId.get(line.feedItemId))
    .find((item) => item?.retiredAt);
  if (retired) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A retired feed is not counted",
      data: { refusal: "feed_retired", feed: retired.nameBn },
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
    const { onHand: expected, averagePriceMoney } = stockLedger(
      movements.get(line.feedItemId) ?? [],
      entry.countedAt
    );
    return {
      ...line,
      counted,
      expected,
      priceMoney: averagePriceMoney,
      difference: countedOverTheBook(counted, expected),
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
      priceMoney: line.priceMoney,
    }));
};

/** The Stock Count lines a reading of the store's differences starts from. */
type CountRow = Awaited<ReturnType<typeof countRowsOf>>[number];

const countRowsOf = (
  db: Pick<Database, "query">,
  farmId: string,
  which: { feedItemId?: string; from?: Date; to?: Date; limit?: number }
) =>
  db.query.stockCount.findMany({
    // Every count's lines, whether or not they differed when made: one that matched is short once a delivery dated
    // before it is written down after it, and was once dropped from the adjustments and the shortfall for good.
    where: {
      farmId,
      ...(which.feedItemId ? { feedItemId: which.feedItemId } : {}),
      ...(which.from && which.to
        ? { countedAt: { gte: which.from, lt: which.to } }
        : {}),
    },
    with: {
      feedItem: { columns: { nameBn: true, unit: true } },
      counter: { columns: { name: true } },
    },
    orderBy: { countedAt: "desc", id: "desc" },
    ...(which.limit ? { limit: which.limit } : {}),
  });

/**
 * The differences these counts booked, as they read now: what the store was thought to hold at the moment of each count
 * — worked out again, so a Feeding or a delivery written up late but dated before the count shows in it rather than
 * standing in the adjustment as a loss — what the count found, the reason, and what the difference is worth at the
 * store's average price then.
 */
const readTheCounts = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  rows: readonly CountRow[]
) => {
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
    const { onHand: expected, averagePriceMoney } = stockLedger(
      movements.get(row.feedItemId) ?? [],
      row.countedAt
    );
    const counted = Number(row.counted);
    const difference = countedOverTheBook(counted, expected);
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
      difference,
      reason: row.reason,
      /** The store's average price when counted; null for feed never bought. */
      priceMoney: averagePriceMoney,
      /** What the difference is worth at that price — below nothing for feed missing. */
      valueMoney:
        averagePriceMoney === null
          ? null
          : roundMoney(difference * averagePriceMoney),
    });
  }
  return out;
};

/**
 * The differences the Stock Counts booked, newest first, as they read now, with what each is worth. The latest two
 * hundred: the feed page's list, not a total — a period's total is `shortfallIn`.
 */
export const adjustmentsOf = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  feedItemId?: string
) => {
  const rows = await countRowsOf(db, farmId, { feedItemId, limit: 200 });
  const read = rows.length === 0 ? [] : await readTheCounts(db, farmId, rows);
  // What differs as it reads now: a count that matched, and still does, books nothing.
  return read.filter((one) => one.difference !== 0);
};

/**
 * What the Stock Counts of a period found missing and found over, in taka at the store's price when each was counted,
 * and how many counts were made in it. Every count in the period, not the feed page's latest two hundred lines.
 */
export const shortfallIn = async (
  db: Pick<Database, "query" | "execute">,
  farmId: string,
  range: { from: Date; to: Date }
): Promise<{ shortMoney: number; overMoney: number; counts: number }> => {
  const [rows, made] = await Promise.all([
    countRowsOf(db, farmId, range),
    db.query.stockCount.findMany({
      where: { farmId, countedAt: { gte: range.from, lt: range.to } },
      columns: { completionId: true },
    }),
  ]);
  const lines = rows.length === 0 ? [] : await readTheCounts(db, farmId, rows);
  return {
    ...shortfallOf(lines),
    counts: new Set(made.map((row) => row.completionId)).size,
  };
};

export const sellerInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** A tenth of the Feed Item's unit is the smallest amount the store keeps. */
export const quantityInput = z
  .number()
  .min(SMALLEST_FEED_AMOUNT)
  .max(1_000_000);

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
  if (row?.priceMoney) {
    await bookMoney(tx, booking, {
      source: "feed_in",
      sourceId: row.id,
      amountMoney: row.priceMoney,
      occurredAt: row.receivedOn,
      counterpartyId: row.counterpartyId,
      paymentMethod,
    });
  }
};

/** What a cut lot is worth: the Feed Item's Fodder Price times the kilos, or nothing while the farm has
 *  put no price on its own fodder. */
export const fodderValueOf = (
  item: { fodderPriceMoney: number | null },
  quantity: number
): number | null =>
  item.fodderPriceMoney === null
    ? null
    : roundMoney(item.fodderPriceMoney * quantity);

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

/** A week and a day: a Friday count missed, and the Saturday gone by without it. */
export const STORE_COUNT_LATE_DAYS = 8;

/**
 * When the store was last counted, for the Owner's home when it has not been for longer than a week and a day — a
 * count retired, never adopted, or simply not made. Nothing when it was counted lately, nor before feed has come in at
 * all: a farm set up this morning has the standard feed items and nothing in the store, and a week and a day after its
 * first delivery is the first it can be late.
 */
export const storeCountLate = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  now: Date
): Promise<{ lastCountedAt: Date | null } | null> => {
  const [firstIn, last] = await Promise.all([
    db.query.feedIn.findFirst({
      where: { farmId },
      columns: { receivedOn: true },
      orderBy: { receivedOn: "asc" },
    }),
    db.query.stockCount.findFirst({
      where: { farmId },
      columns: { countedAt: true },
      orderBy: { countedAt: "desc" },
    }),
  ]);
  if (!firstIn) {
    return null;
  }
  const lateFrom = now.getTime() - STORE_COUNT_LATE_DAYS * 24 * 60 * 60 * 1000;
  // Counted since lately, or never counted but the first feed came in too lately to have been.
  const countedFrom = last?.countedAt ?? firstIn.receivedOn;
  if (countedFrom.getTime() > lateFrom) {
    return null;
  }
  return { lastCountedAt: last?.countedAt ?? null };
};

type Db = Pick<Database, "query"> | Tx;

/** Every Feed Purchase's price per unit beside the one before it, read afresh from the arrivals as they stand — of one
 *  feed, or of all. */
export const purchasePricesIn = async (
  db: Db,
  farmId: string,
  feedItemId?: string
): Promise<Map<string, PurchasePrice>> => {
  const arrivals = await db.query.feedIn.findMany({
    where: { farmId, ...(feedItemId ? { feedItemId } : {}) },
    columns: {
      id: true,
      feedItemId: true,
      kind: true,
      quantity: true,
      priceMoney: true,
      receivedOn: true,
    },
  });
  return purchasePricesOf(
    arrivals.map((one) => ({ ...one, quantity: Number(one.quantity) }))
  );
};

/** The last Feed Purchase of a feed, as the receiving sheet sets a new one beside it: what a unit cost, and when it came.
 *  Nothing for a feed never bought. */
export const lastPurchaseOf = async (
  db: Db,
  farmId: string,
  feedItemId: string
): Promise<{ unitPriceMoney: number; receivedOn: Date } | null> => {
  const bought = await db.query.feedIn.findMany({
    where: { farmId, feedItemId, kind: "purchase" },
    columns: { quantity: true, priceMoney: true, receivedOn: true },
    orderBy: { receivedOn: "desc", id: "desc" },
    limit: 5,
  });
  for (const one of bought) {
    const unitPriceMoney = unitPriceOf({
      kind: "purchase",
      quantity: Number(one.quantity),
      priceMoney: one.priceMoney,
    });
    if (unitPriceMoney !== null) {
      return { unitPriceMoney, receivedOn: one.receivedOn };
    }
  }
  return null;
};

/**
 * Tells the Owner of a Feed Purchase bought dearer than the last one of the same feed by more than the Owner's line, in
 * the evening's post — once for the arrival, however often it is put right: first recorded, or a Correction that now
 * makes it so.
 */
export const tellIfTheFeedCameDearer = async (
  tx: Tx,
  farm: { id: string; feedPriceJumpPercent: number },
  arrivalId: string,
  now: Date
): Promise<void> => {
  const arrival = await tx.query.feedIn.findFirst({
    where: { id: arrivalId, farmId: farm.id },
    columns: { feedItemId: true },
    with: { feedItem: { columns: { nameBn: true, unit: true } } },
  });
  if (!arrival) {
    return;
  }
  const prices = await purchasePricesIn(tx, farm.id, arrival.feedItemId);
  const price = prices.get(arrivalId);
  if (
    !(
      price &&
      price.previousUnitPriceMoney !== null &&
      priceJumped(price, farm.feedPriceJumpPercent)
    )
  ) {
    return;
  }
  await tell(
    tx,
    farm.id,
    {
      kind: "feed_price_jump",
      about: { id: arrivalId },
      facts: {
        feed: arrival.feedItem.nameBn,
        unit: arrival.feedItem.unit,
        unitPriceMoney: roundMoney(price.unitPriceMoney),
        previousUnitPriceMoney: roundMoney(price.previousUnitPriceMoney),
        percent: price.changePercent ?? 0,
      },
    },
    now
  );
};

/** How far back the sellers' figures on the farm's scale are read. */
export const SCALE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** How short each seller has run on the farm's scale over the last `SCALE_DAYS` farm days, from the lots weighed. */
export const scaleBySeller = async (
  db: Db,
  farmId: string,
  now: Date
): Promise<SellerOnTheScale[]> => {
  const from = startOfFarmDay(
    farmDayOf(new Date(now.getTime() - (SCALE_DAYS - 1) * DAY_MS))
  );
  const weighed = await db.query.feedIn.findMany({
    where: {
      farmId,
      kind: "purchase",
      slipQuantity: { isNotNull: true },
      receivedOn: { gte: from },
    },
    columns: { quantity: true, slipQuantity: true, priceMoney: true },
    with: { seller: { columns: { id: true, name: true } } },
  });
  return sellersOnTheScale(
    weighed.flatMap((lot) =>
      lot.seller && lot.priceMoney !== null && lot.slipQuantity !== null
        ? [
            {
              sellerId: lot.seller.id,
              sellerName: lot.seller.name,
              slipQuantity: Number(lot.slipQuantity),
              quantity: Number(lot.quantity),
              priceMoney: lot.priceMoney,
            },
          ]
        : []
    )
  );
};
