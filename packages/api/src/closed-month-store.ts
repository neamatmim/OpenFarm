import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq, gte, isNull, lt, sql } from "@OpenFarm/db/operators";
import type {
  ClosedMonthChangeKind,
  ClosedMonthSource,
  MoneySource,
} from "@OpenFarm/db/schema/money";
import {
  closedMonth,
  closedMonthChange,
  moneyEvent,
} from "@OpenFarm/db/schema/money";
import {
  MONEY_SOURCE_WORD,
  farmDayOf,
  monthBefore,
  monthRangeOf,
  roundMoney,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";

import type { Tx } from "./audit";
import { lockTheFarm } from "./farm-lock";
import { tagsOfHerRecords } from "./herd-store";
import { refuse } from "./refuse";

/** Who is changing the Farm's figures, as a **Closed Month** asks: whether it is the Owner, who alone may. */
export interface ChangeBy {
  farmId: string;
  actorId: string;
  byTheOwner: boolean;
  now: Date;
}

/** Whether whoever writes money holds the Owner's Role: what the Approval Threshold and a **Closed Month** ask of it. */
export const writesAsTheOwner = (roles: readonly string[]): boolean =>
  roles.includes("owner");

/**
 * Who this request is, as a change to a Closed Month is asked about and kept — and when, by the farm's own clock: a
 * Correction a phone held is judged at when it was made, but a month closed since is closed to it all the same.
 */
export const changeByOf = (
  context: {
    farm: { id: string };
    actor: { id: string };
    roles: readonly string[];
    heardAt?: Date;
  },
  now: Date
): ChangeBy => ({
  farmId: context.farm.id,
  actorId: context.actor.id,
  byTheOwner: writesAsTheOwner(context.roles),
  now: context.heardAt ?? now,
});

/** The month a moment falls in, on the farm's own clock: "YYYY-MM". */
export const monthKeyOf = (at: Date): string => farmDayOf(at).slice(0, 7);

/**
 * Which of these months the farm has closed and not reopened. Asked behind the Farm's one lock, which every write that
 * can book or move money in a month gone by takes at its start, before any row of its own (an audited write marked
 * `reachesMoney`, a Correction of a kind marked `money`, a sync batch with an entry made in a month gone by), so
 * taking it here again is only a guard, already held. Only a month already over can be closed, so money in this month
 * or after is never asked about — the database is not read, and the Farm not locked, for the day's ordinary money.
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
 * A record as a change to a Closed Month weighs it: when it falls, what it comes to, whose purse — a Venture's figures
 * are its own papers', never the Farm's month — and everything else about it that is a figure of the month, as one
 * fingerprint.
 */
export interface Weighed {
  at: Date;
  amountMoney: number;
  purseVentureId: string | null;
  rest: string;
}

/**
 * A Money Event, or one about to be written, as a Closed Month weighs it: beside its day, amount and purse, its
 * Category and Counterparty, and whose hand, which account, which way it was paid and which Side — each a figure of
 * the closed month too: a hand's cash, an account's balance, a Side's result.
 */
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
}): Weighed => ({
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

/** Whom or what a change was about, as the paper names it. */
export interface About {
  about: string | null;
  tagNumber: string | null;
}

/** One change to weigh against the Closed Months: what it was made to, as it stood and as it will stand. */
export interface ChangeToWeigh {
  recordId: string;
  source: ClosedMonthSource;
  /** As it stood: nothing for a record entered new. */
  before: Weighed | undefined;
  /** As it will stand: nothing for one taken away. */
  after: Weighed | undefined;
  /** Whom it was with or about: read only for a change the Owner makes to a closed month, which is kept. */
  about: (tx: Tx) => Promise<About>;
}

/** Whether two weighings say the same: a write that says what the record already says changes no month. */
const sameAs = (a: Weighed, b: Weighed): boolean =>
  a.at.getTime() === b.at.getTime() &&
  roundMoney(a.amountMoney) === roundMoney(b.amountMoney) &&
  a.purseVentureId === b.purseVentureId &&
  a.rest === b.rest;

/** The month a weighing stands in as the Farm's own: none for a Venture's purse. */
const farmsMonthOf = (one: Weighed | undefined): string | null =>
  one && one.purseVentureId === null ? monthKeyOf(one.at) : null;

/** The months a change touches as the Farm's own: where it stood, and where it goes. */
const monthsTouched = (change: ChangeToWeigh): string[] =>
  [farmsMonthOf(change.before), farmsMonthOf(change.after)].flatMap((one) =>
    one === null ? [] : [one]
  );

/** What a change did to one closed month: what the month held of it before, and after. */
const changeIn = (
  month: string,
  { before, after }: ChangeToWeigh
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

/** Refused to anybody but the Owner: the month is closed, and is hers. */
const closedToThem = (month: string) =>
  refuse("month_closed", "That month is closed: ask the owner", { month });

/**
 * The one rule of a **Closed Month** (ADR 0028), asked of every write of a figure the Farm's months are made of — its
 * money booked, put right in place or taken off the books, a Handover, a Write-off, a Cash Count, a Bank Check: a
 * change to a month the Owner has closed, where it stood or where it goes, is hers alone. Anybody else is refused, and
 * nothing of the write is kept; hers is written, and kept for the paper of the month she made it in. A record written
 * as it already stood changes nothing and asks nothing. Every change in one write is weighed at once.
 */
export const answerToClosedMonths = async (
  tx: Tx,
  by: ChangeBy,
  changes: readonly ChangeToWeigh[],
  /** How a refusal is said, where the write is not a request's own: a phone's late entry is kept, not refused. */
  refused: (month: string) => Error = closedToThem
): Promise<void> => {
  const changing = changes.filter(
    ({ before, after }) => !(before && after && sameAs(before, after))
  );
  const closed = await closedAmong(tx, by, changing.flatMap(monthsTouched));
  const [first] = closed;
  if (first === undefined) {
    return;
  }
  if (!by.byTheOwner) {
    throw refused(first);
  }
  for (const change of changing) {
    const months = monthsTouched(change).filter((month) => closed.has(month));
    if (months.length === 0) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- the few records of one write, and only those the Owner changed
    const about = await change.about(tx);
    // oxlint-disable-next-line no-await-in-loop -- at most the two months it was in and is moved to
    await tx.insert(closedMonthChange).values(
      [...new Set(months)].map((month) => ({
        id: newId(by.now),
        farmId: by.farmId,
        month,
        recordId: change.recordId,
        source: change.source,
        ...about,
        ...changeIn(month, change),
        changedBy: by.actorId,
        changedAt: by.now,
      }))
    );
  }
};

/** Which records name their Animal, for the tag a change to their money is listed by. */
const HER_RECORDS: Partial<
  Record<MoneySource, "intakeIds" | "saleIds" | "internalSaleIds">
> = {
  intake: "intakeIds",
  sale: "saleIds",
  sale_broker: "saleIds",
  internal_sale_in: "internalSaleIds",
  internal_sale_out: "internalSaleIds",
};

/** Whom a Money Event was with, and the Animal it was for where it was one animal's, as a change to it is listed. */
export const aboutMoney =
  (
    farmId: string,
    money: {
      source: MoneySource;
      sourceId: string;
      counterpartyId: string | null;
    }
  ) =>
  async (tx: Tx): Promise<About> => {
    const kind = HER_RECORDS[money.source];
    const [counterparty, tags] = await Promise.all([
      money.counterpartyId
        ? tx.query.counterparty.findFirst({
            where: { id: money.counterpartyId, farmId },
            columns: { name: true },
          })
        : undefined,
      kind
        ? tagsOfHerRecords(tx, farmId, { [kind]: [money.sourceId] })
        : new Map<string, string>(),
    ]);
    return {
      about: counterparty?.name ?? null,
      tagNumber: tags.get(money.sourceId) ?? null,
    };
  };

/** What each record a change was made to is called, as the screen says it and the paper and CSV say it in both
 *  languages: a Money Event by the record its money came from, as the money book names it. */
export const RECORD_WORD = {
  ...MONEY_SOURCE_WORD,
  handover: "months.closing.from.handover",
  receivable_write_off: "months.closing.from.receivableWriteOff",
  cash_count: "months.closing.from.cashCount",
  bank_check: "months.closing.from.bankCheck",
  buyer_statement: "months.closing.from.buyerStatement",
} as const satisfies Record<ClosedMonthSource, MessageKey>;

/** How many of the Farm's own Money Events dated in a month still wait for the Owner's word. */
const waitingIn = async (
  db: Pick<Tx, "select">,
  farmId: string,
  month: string
): Promise<number> => {
  const range = monthRangeOf(month);
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
    throw refuse(
      "month_not_ended",
      "Only a month that has ended can be closed"
    );
  }
  if (standing.closed) {
    throw refuse("month_already_closed", "That month is closed already");
  }
  if (standing.waiting > 0) {
    throw refuse(
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
    throw refuse("month_not_closed", "That month is not closed");
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
 * Every change the Owner made over a stretch of time to a month already closed — what the paper of the month it was
 * made in says under "changed after closing" — oldest first, with what it was made to and who made it.
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
      recordId: true,
      source: true,
      about: true,
      tagNumber: true,
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
    /** What the record is called (`RECORD_WORD`). */
    recordWord: RECORD_WORD[one.source],
    changedOn: farmDayOf(one.changedAt),
    by: changedBy ? (named.get(changedBy) ?? null) : null,
  }));
};
