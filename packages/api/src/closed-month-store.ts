import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq, gte, inArray, isNull, lt, sql } from "@OpenFarm/db/operators";
import type {
  ClosedMonthChangeKind,
  MoneySource,
} from "@OpenFarm/db/schema/money";
import {
  closedMonth,
  closedMonthChange,
  moneyEvent,
  moneyReceipt,
} from "@OpenFarm/db/schema/money";
import {
  farmDayOf,
  monthBefore,
  monthOf as monthRangeOf,
  roundMoney,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { lockTheFarm } from "./farm-lock";

/** Who is changing the Farm's money, as a **Closed Month** asks: whether it is the Owner, who alone may. */
export interface ChangeBy {
  farmId: string;
  actorId: string;
  byTheOwner: boolean;
  now: Date;
}

/** Who this request is, as a change to a Closed Month's money is asked about and kept. */
export const changeByOf = (
  context: {
    farm: { id: string };
    actor: { id: string };
    roles: readonly string[];
  },
  now: Date
): ChangeBy => ({
  farmId: context.farm.id,
  actorId: context.actor.id,
  byTheOwner: context.roles.includes("owner"),
  now,
});

/** The month a moment of money falls in, on the farm's own clock: "YYYY-MM". */
export const monthKeyOf = (at: Date): string => farmDayOf(at).slice(0, 7);

/**
 * Which of these months the farm has closed and not reopened, asked behind the Farm's one money lock so a month closed
 * at the same moment is either seen closed or closed after this write. Only a month already over can be closed, so money
 * in this month or after is never asked about — the database is not read, and the Farm not locked, for the day's
 * ordinary money.
 */
const closedAmong = async (
  tx: Tx,
  by: Pick<ChangeBy, "farmId" | "now">,
  months: readonly string[]
): Promise<ReadonlySet<string>> => {
  const thisMonth = monthKeyOf(by.now);
  const over = [...new Set(months)].filter((month) => month < thisMonth);
  if (over.length === 0) {
    return new Set();
  }
  await lockTheFarm(tx, by.farmId);
  const rows = await tx.query.closedMonth.findMany({
    where: {
      farmId: by.farmId,
      month: { in: over },
      reopenedAt: { isNull: true },
    },
    columns: { month: true },
  });
  return new Set(rows.map((row) => row.month));
};

/**
 * Money as a change to a Closed Month is weighed: when, how much, whose purse, and every other figure of the month it
 * stands in — its Category and Counterparty, and whose hand, which account, which way it was paid and which Side, each
 * a figure of the closed month too: a hand's cash, an account's balance, a Side's result.
 */
export interface MoneyAsItStands {
  at: Date;
  amountMoney: number;
  purseVentureId: string | null;
  rest: string;
}

/** A Money Event, or one about to be written, as a Closed Month weighs it (`MoneyAsItStands`). */
export const standsOf = (one: {
  occurredAt: Date;
  amountMoney: number;
  purseVentureId: string | null;
  categoryId: string;
  counterpartyId?: string | null;
  heldBy?: string | null;
  farmAccountId?: string | null;
  paymentMethod?: string | null;
  side?: string | null;
}): MoneyAsItStands => ({
  at: one.occurredAt,
  amountMoney: one.amountMoney,
  purseVentureId: one.purseVentureId,
  rest: [
    one.categoryId,
    one.counterpartyId ?? "",
    one.heldBy ?? "",
    one.farmAccountId ?? "",
    one.paymentMethod ?? "",
    one.side ?? "",
  ].join("|"),
});

/** Whether two weighings of money say the same: a write that says what the money already says changes no month. */
const sameMoney = (a: MoneyAsItStands, b: MoneyAsItStands): boolean =>
  a.at.getTime() === b.at.getTime() &&
  roundMoney(a.amountMoney) === roundMoney(b.amountMoney) &&
  a.purseVentureId === b.purseVentureId &&
  a.rest === b.rest;

/** The month money stands in as the Farm's own: none for a Venture's purse, whose figures are its own papers'. */
const farmsMonthOf = (one: MoneyAsItStands | undefined): string | null =>
  one && one.purseVentureId === null ? monthKeyOf(one.at) : null;

/** What a change did to one closed month: what the month held of the money before, and after. */
const changeIn = (
  month: string,
  before: MoneyAsItStands | undefined,
  after: MoneyAsItStands | undefined
): {
  change: ClosedMonthChangeKind;
  beforeMoney: number | null;
  afterMoney: number | null;
} => {
  const wasIn = farmsMonthOf(before) === month;
  const isIn = farmsMonthOf(after) === month;
  const beforeMoney = wasIn && before ? roundMoney(before.amountMoney) : null;
  const afterMoney = isIn && after ? roundMoney(after.amountMoney) : null;
  if (!before) {
    return { change: "entered", beforeMoney, afterMoney };
  }
  if (!after) {
    return { change: "voided", beforeMoney, afterMoney };
  }
  return {
    change: wasIn && isIn ? "corrected" : "moved",
    beforeMoney,
    afterMoney,
  };
};

/**
 * The one rule of a **Closed Month** (ADR 0028), asked of every write of the Farm's money — booked, put right in place,
 * or taken off the books: money that changes a month the Owner has closed, where it stood or where it goes, is hers
 * alone to change. Anybody else is refused (`month_closed`), and nothing of the write is kept; hers is written, and
 * kept for the paper of the month she made it in. Money written as it already stood changes nothing and asks nothing.
 */
export const answerToClosedMonths = async (
  tx: Tx,
  by: ChangeBy,
  money: {
    id: string;
    source: MoneySource;
    /** As it stood: nothing for money entered new. */
    before: MoneyAsItStands | undefined;
    /** As it will stand: nothing for money taken off the books. */
    after: MoneyAsItStands | undefined;
  }
): Promise<void> => {
  const { before, after } = money;
  if (before && after && sameMoney(before, after)) {
    return;
  }
  const closed = await closedAmong(
    tx,
    by,
    [farmsMonthOf(before), farmsMonthOf(after)].flatMap((one) =>
      one === null ? [] : [one]
    )
  );
  const [first] = closed;
  if (first === undefined) {
    return;
  }
  if (!by.byTheOwner) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That month is closed: ask the owner",
      data: { refusal: "month_closed", month: first },
    });
  }
  for (const month of closed) {
    // oxlint-disable-next-line no-await-in-loop -- at most the two months it was in and is moved to
    await tx.insert(closedMonthChange).values({
      id: newId(by.now),
      farmId: by.farmId,
      month,
      moneyEventId: money.id,
      source: money.source,
      ...changeIn(month, before, after),
      changedBy: by.actorId,
      changedAt: by.now,
    });
  }
};

/**
 * Takes Money Events off the books — a record voided, never spent or written twice — with their receipts. One of the
 * Farm's own in a **Closed Month** is the Owner's alone to take off, and is kept for the next month's paper.
 */
export const takeOffTheBooks = async (
  tx: Tx,
  by: ChangeBy,
  ids: readonly string[]
): Promise<void> => {
  if (ids.length === 0) {
    return;
  }
  const events = await tx.query.moneyEvent.findMany({
    where: { id: { in: [...ids] } },
    columns: {
      id: true,
      source: true,
      occurredAt: true,
      amountMoney: true,
      purseVentureId: true,
      categoryId: true,
    },
  });
  for (const one of events) {
    // oxlint-disable-next-line no-await-in-loop -- one record's money, a Money Event or two
    await answerToClosedMonths(tx, by, {
      id: one.id,
      source: one.source,
      before: standsOf(one),
      after: undefined,
    });
  }
  await tx.delete(moneyReceipt).where(inArray(moneyReceipt.moneyEventId, ids));
  await tx.delete(moneyEvent).where(inArray(moneyEvent.id, ids));
};

/** The moments a "YYYY-MM" month runs over on the farm's clock: from its first moment up to the next month's. */
const rangeOfMonth = (month: string) =>
  monthRangeOf(startOfFarmDay(`${month}-01`));

/** How many of the Farm's own Money Events dated in a month still wait for the Owner's word. */
const waitingIn = async (
  db: Pick<Tx, "select">,
  farmId: string,
  month: string
): Promise<number> => {
  const range = rangeOfMonth(month);
  const [row] = await db
    .select({ waiting: sql<number>`count(*)::int` })
    .from(moneyEvent)
    .where(
      and(
        eq(moneyEvent.farmId, farmId),
        eq(moneyEvent.approval, "awaiting"),
        isNull(moneyEvent.purseVentureId),
        gte(moneyEvent.occurredAt, range.from),
        lt(moneyEvent.occurredAt, range.until)
      )
    );
  return row?.waiting ?? 0;
};

/** Where a month stands with the Owner: closed or open, whether it has ended, and what of it still waits for her. */
export const closingOf = async (
  db: Pick<Tx, "query" | "select">,
  farmId: string,
  month: string,
  now: Date
) => {
  const row = await db.query.closedMonth.findFirst({
    where: { farmId, month },
    columns: { closedAt: true, reopenedAt: true, reopenReason: true },
  });
  const closed = row !== undefined && row.reopenedAt === null;
  return {
    month,
    closed,
    closedAt: closed ? row.closedAt : null,
    /** Last reopened, and why — while it stands open again. */
    reopened:
      row?.reopenedAt && !closed
        ? { at: row.reopenedAt, reason: row.reopenReason ?? "" }
        : null,
    /** Over: only a month that has ended can be closed. */
    ended: month < monthKeyOf(now),
    /** The Farm's own money in it still waiting for the Owner: a month is closed with nothing waiting. */
    waiting: await waitingIn(db, farmId, month),
  };
};

/** The farm day of the month from which last month is named to the Owner as ready to close: late bills have had a week. */
const READY_FROM_DAY = 7;

/**
 * Last month, named to the Owner from the 7th while it stands open — with how much of it still waits for her word, which
 * closing it asks her to see to first. Nothing before the 7th, or once it is closed.
 */
export const monthReadyToClose = async (
  db: Pick<Tx, "query" | "select">,
  farmId: string,
  now: Date
): Promise<{ month: string; waiting: number } | null> => {
  const today = farmDayOf(now);
  if (Number(today.slice(8, 10)) < READY_FROM_DAY) {
    return null;
  }
  const last = monthBefore(today);
  const standing = await closingOf(db, farmId, last, now);
  return standing.closed ? null : { month: last, waiting: standing.waiting };
};

const refused = (refusal: string, message: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** Closes a month of the Farm's own money: one that has ended, is not closed already, and has nothing waiting. */
export const closeMonth = async (
  tx: Tx,
  by: ChangeBy,
  month: string
): Promise<void> => {
  // Before asking what of it waits: money booked into it at the same moment either lands first, and is counted as
  // waiting, or finds it closed, and is refused.
  await lockTheFarm(tx, by.farmId);
  const standing = await closingOf(tx, by.farmId, month, by.now);
  if (!standing.ended) {
    throw refused(
      "month_not_ended",
      "Only a month that has ended can be closed"
    );
  }
  if (standing.closed) {
    throw refused("month_already_closed", "That month is closed already");
  }
  if (standing.waiting > 0) {
    throw refused(
      "month_has_money_waiting",
      "Some of that month's money still waits for the owner's word: approve it first"
    );
  }
  await tx
    .insert(closedMonth)
    .values({
      id: newId(by.now),
      farmId: by.farmId,
      month,
      closedBy: by.actorId,
      closedAt: by.now,
    })
    .onConflictDoUpdate({
      target: [closedMonth.farmId, closedMonth.month],
      set: {
        closedBy: by.actorId,
        closedAt: by.now,
        reopenedBy: null,
        reopenedAt: null,
        reopenReason: null,
      },
    });
};

/** Opens a closed month again, with the Owner's reason: kept on the month, and on the trail. */
export const reopenMonth = async (
  tx: Tx,
  by: ChangeBy,
  month: string,
  reason: string
): Promise<void> => {
  await lockTheFarm(tx, by.farmId);
  const standing = await closingOf(tx, by.farmId, month, by.now);
  if (!standing.closed) {
    throw refused("month_not_closed", "That month is not closed");
  }
  await tx
    .update(closedMonth)
    .set({ reopenedBy: by.actorId, reopenedAt: by.now, reopenReason: reason })
    .where(
      and(eq(closedMonth.farmId, by.farmId), eq(closedMonth.month, month))
    );
};

/** The month as the trail keeps it. */
export const readClosedMonth = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  month: string
) =>
  (await tx.query.closedMonth.findFirst({ where: { farmId, month } })) ?? null;

/**
 * Every change the Owner made over a stretch of time to the money of a month already closed — what the paper of the
 * month it was made in says under "changed after closing" — oldest first, with who made it.
 */
export const changesMadeIn = async (
  db: Pick<Tx, "query">,
  farmId: string,
  range: { from: Date; until: Date }
) => {
  const rows = await db.query.closedMonthChange.findMany({
    where: { farmId, changedAt: { gte: range.from, lt: range.until } },
    orderBy: { changedAt: "asc", id: "asc" },
    columns: {
      id: true,
      month: true,
      moneyEventId: true,
      source: true,
      change: true,
      beforeMoney: true,
      afterMoney: true,
      changedAt: true,
      changedBy: true,
    },
  });
  const ids = [
    ...new Set(rows.flatMap((one) => (one.changedBy ? [one.changedBy] : []))),
  ];
  const people =
    ids.length === 0
      ? []
      : await db.query.user.findMany({
          where: { id: { in: ids } },
          columns: { id: true, name: true },
        });
  const named = new Map(people.map((one) => [one.id, one.name]));
  return rows.map(({ changedBy, ...one }) => ({
    ...one,
    changedOn: farmDayOf(one.changedAt),
    by: changedBy ? (named.get(changedBy) ?? null) : null,
  }));
};
