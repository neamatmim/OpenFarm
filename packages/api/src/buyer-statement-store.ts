import type { Database } from "@OpenFarm/db";
import { and, eq, inArray } from "@OpenFarm/db/operators";
import {
  buyerStatement,
  buyerStatementPhoto,
  dispatch,
} from "@OpenFarm/db/schema/milk";
import {
  addDays,
  farmDayOf,
  farmDaysBetween,
  isAFarmDay,
  isPriceToFollowOverdue,
  litersCompared,
  priceToFollowOverdueFrom,
  roundLiters,
  roundMoney,
  spreadByLiters,
  statementPeriodDays,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { clearDebtNoticesOf } from "./alerts-store";
import type { Tx } from "./audit";
import { audited } from "./audit";
import type { ChangeBy, ChangeToWeigh } from "./closed-month-store";
import {
  answerToClosedMonths,
  changeByOf,
  monthKeyOf,
} from "./closed-month-store";
import type { Context } from "./context";
import { dispatchFields, twoPlaces, worthOfDispatch } from "./dispatch-store";
import { farmDay } from "./farm-clock";
import { photoInput } from "./photo-input";
import { lockTheBuyer, paidOnItem } from "./receivable-store";
import { refuse } from "./refuse";

// A **Buyer Statement** (ADR 0030): the milk buyer's own account of a stretch of days, set beside the milk the farm
// sent him in them, and the money that prices what the farm sent with its price to follow.

type Db = Pick<Database, "query"> | Tx;

/** What a Buyer Statement is recorded with. `id` is the phone's own, so a save sent twice is one statement. */
export const statementInput = z
  .object({
    id: z.string().uuid(),
    counterpartyId: z.string().min(1),
    number: z.string().trim().min(1).max(60).optional(),
    fromDay: farmDay,
    toDay: farmDay,
    statedOn: farmDay,
    /** The day he pays it by; left out, the statement's day and the farm's days for Receivable. */
    payBy: farmDay.optional(),
    liters: dispatchFields.liters,
    amountMoney: z.number().min(0).max(100_000_000).multipleOf(0.01),
    fatPercent: dispatchFields.fatPercent.optional(),
    snfPercent: dispatchFields.snfPercent.optional(),
    ratePerLiterMoney: dispatchFields.pricePerLiterMoney.optional(),
    note: dispatchFields.note.optional(),
    photo: photoInput.optional(),
  })
  .strict();

export type StatementSaid = z.infer<typeof statementInput>;

/** What a statement is set beside before it is recorded: whose, which days, and his liters and money. */
export const besideInput = z.object({
  counterpartyId: z.string().min(1),
  fromDay: farmDay,
  toDay: farmDay,
  liters: dispatchFields.liters,
  amountMoney: z.number().min(0).max(100_000_000),
});

/** A Dispatch to the buyer in a statement's days, as the statement reads it. */
interface DispatchIn {
  id: string;
  dispatchedAt: Date;
  liters: number;
  pricePerLiterMoney: string | null;
  receivableMoney: number;
  buyerStatementId: string | null;
}

/** Every Dispatch to one buyer in a stretch of farm days, oldest first. */
const dispatchesIn = async (
  db: Db,
  farmId: string,
  counterpartyId: string,
  { fromDay, toDay }: { fromDay: string; toDay: string }
): Promise<DispatchIn[]> => {
  const range = farmDaysBetween(fromDay, toDay);
  const rows = await db.query.dispatch.findMany({
    where: {
      farmId,
      buyerId: counterpartyId,
      dispatchedAt: { gte: range.from, lt: range.until },
    },
    columns: {
      id: true,
      dispatchedAt: true,
      liters: true,
      pricePerLiterMoney: true,
      receivableMoney: true,
      buyerStatementId: true,
    },
    orderBy: { dispatchedAt: "asc", id: "asc" },
  });
  return rows.map((row) => ({ ...row, liters: Number(row.liters) }));
};

/** The statement's figures beside the farm's own milk to him in its days. */
export interface StatementBeside {
  /** Every liter the farm sent him in its days. */
  farmLiters: number;
  /** His liters less the farm's: fewer, where it is less than nothing — short measure — and what part of the farm's. */
  differenceLiters: number;
  differencePercent: number | null;
  /** The milk the farm priced at the gate in its days, and what it came to: left as it was. */
  pricedLiters: number;
  pricedMoney: number;
  /** The milk sent with its price to follow, which the statement prices. */
  toFollowCount: number;
  toFollowLiters: number;
  /** What the statement prices that milk at: its amount, less the milk priced at the gate. */
  spreadMoney: number;
  /** What his amount says beyond everything the farm has priced, where none of it was to follow. */
  amountDifferenceMoney: number;
}

/**
 * A statement's figures beside the farm's own Dispatches: the liters, the milk the farm priced at the gate, and the milk
 * sent with its price to follow — still to follow, or priced by this very statement once it is recorded.
 */
const besideOf = (
  dispatches: readonly DispatchIn[],
  said: { liters: number; amountMoney: number },
  statementId: string | null
): StatementBeside & { toFollow: DispatchIn[] } => {
  const priced = dispatches.filter((one) => one.pricePerLiterMoney !== null);
  const toFollow = dispatches.filter(
    (one) =>
      one.pricePerLiterMoney === null &&
      (one.buyerStatementId === null || one.buyerStatementId === statementId)
  );
  const farmLiters = roundLiters(
    dispatches.reduce((sum, one) => sum + one.liters, 0)
  );
  const pricedMoney = roundMoney(
    priced.reduce(
      (sum, one) =>
        sum +
        worthOfDispatch({
          liters: one.liters,
          pricePerLiterMoney: one.pricePerLiterMoney ?? 0,
        }),
      0
    )
  );
  const leftOver = roundMoney(said.amountMoney - pricedMoney);
  const compared = litersCompared({ statedLiters: said.liters, farmLiters });
  return {
    farmLiters,
    ...compared,
    pricedLiters: roundLiters(priced.reduce((sum, one) => sum + one.liters, 0)),
    pricedMoney,
    toFollow,
    toFollowCount: toFollow.length,
    toFollowLiters: roundLiters(
      toFollow.reduce((sum, one) => sum + one.liters, 0)
    ),
    spreadMoney: toFollow.length > 0 ? leftOver : 0,
    amountDifferenceMoney: toFollow.length > 0 ? 0 : leftOver,
  };
};

/** A standing statement of his whose days meet these, if any: one stretch of his milk is priced once. */
const overlapping = async (
  db: Db,
  farmId: string,
  counterpartyId: string,
  { fromDay, toDay }: { fromDay: string; toDay: string }
) =>
  await db.query.buyerStatement.findFirst({
    where: {
      farmId,
      counterpartyId,
      voidedAt: { isNull: true },
      fromDay: { lte: toDay },
      toDay: { gte: fromDay },
    },
    columns: { id: true, fromDay: true, toDay: true },
  });

/** What the screen is told a statement would meet before it is recorded: its overlap, or its amount below the gate's. */
type StatementProblem = "statement_overlaps" | "statement_below_priced" | null;

/**
 * A statement as it would stand, before it is recorded: the farm's milk to him in its days beside it, and what would be
 * refused of it. The sheet shows it as it is typed.
 */
export const statementBesideOf = async (
  db: Db,
  farmId: string,
  said: z.infer<typeof besideInput>
): Promise<StatementBeside & { problem: StatementProblem }> => {
  const days = { fromDay: said.fromDay, toDay: said.toDay };
  if (said.toDay < said.fromDay) {
    throw refuse("statement_days", "Its last day is before its first");
  }
  const [dispatches, overlap] = await Promise.all([
    dispatchesIn(db, farmId, said.counterpartyId, days),
    overlapping(db, farmId, said.counterpartyId, days),
  ]);
  const { toFollow: _toFollow, ...beside } = besideOf(dispatches, said, null);
  let problem: StatementProblem = null;
  if (overlap) {
    problem = "statement_overlaps";
  } else if (beside.toFollowCount > 0 && beside.spreadMoney <= 0) {
    problem = "statement_below_priced";
  }
  return { ...beside, problem };
};

/** Milk whose price is to follow is not sent to a buyer into days his standing statement has already priced. */
export const assertNoStatementCovers = async (
  tx: Tx,
  farmId: string,
  counterpartyId: string,
  dispatchedAt: Date
) => {
  const day = farmDayOf(dispatchedAt);
  const covering = await overlapping(tx, farmId, counterpartyId, {
    fromDay: day,
    toDay: day,
  });
  if (covering) {
    throw refuse(
      "statement_covers_it",
      "His statement for those days is recorded: give this milk its price, or void the statement first",
      { fromDay: covering.fromDay, toDay: covering.toDay }
    );
  }
};

/** The statement as the trail keeps it, with what it priced. */
export const readStatement = async (tx: Tx, id: string) => {
  const row = await tx.query.buyerStatement.findFirst({ where: { id } });
  if (!row) {
    return null;
  }
  const priced = await tx.query.dispatch.findMany({
    where: { buyerStatementId: id },
    columns: { id: true, receivableMoney: true },
    orderBy: { dispatchedAt: "asc", id: "asc" },
  });
  return { ...row, priced };
};

/**
 * What a statement's priced milk comes to in each month it was sent in, as a **Closed Month** weighs it: the milk is
 * money of the month it left in, so a statement that prices milk of a month the Owner has closed is hers alone to
 * record or void, and kept for the next paper (ADR 0028, 0030).
 */
const weighedByMonth = (
  shares: readonly { dispatchedAt: Date; amountMoney: number }[],
  counterpartyId: string
) => {
  const byMonth = new Map<string, { at: Date; amountMoney: number }>();
  for (const one of shares) {
    const month = monthKeyOf(one.dispatchedAt);
    const had = byMonth.get(month);
    byMonth.set(month, {
      at: had?.at ?? one.dispatchedAt,
      amountMoney: roundMoney((had?.amountMoney ?? 0) + one.amountMoney),
    });
  }
  return [...byMonth.values()].map((one) => ({
    at: one.at,
    amountMoney: one.amountMoney,
    purseVentureId: null,
    rest: counterpartyId,
  }));
};

/** Whom a statement was from, as a change to a closed month lists it. */
const aboutTheBuyer =
  (farmId: string, counterpartyId: string) => async (tx: Tx) => {
    const buyer = await tx.query.counterparty.findFirst({
      where: { id: counterpartyId, farmId },
      columns: { name: true },
    });
    return { about: buyer?.name ?? null, tagNumber: null };
  };

/** Weighs a statement's milk against the Closed Months, as recorded (`after`) or voided (`before`). */
const answerForStatement = async (
  tx: Tx,
  by: ChangeBy,
  statement: { id: string; counterpartyId: string },
  shares: readonly { dispatchedAt: Date; amountMoney: number }[],
  way: "recorded" | "voided"
) => {
  const changes: ChangeToWeigh[] = weighedByMonth(
    shares,
    statement.counterpartyId
  ).map((weighed) => ({
    recordId: statement.id,
    source: "buyer_statement",
    before: way === "voided" ? weighed : undefined,
    after: way === "recorded" ? weighed : undefined,
    about: aboutTheBuyer(by.farmId, statement.counterpartyId),
  }));
  await answerToClosedMonths(tx, by, changes);
};

/** The days a statement is recorded with, as the farm takes them: in order, none after today. */
const assertDays = (said: StatementSaid, payBy: string, today: string) => {
  const inOrder =
    said.fromDay <= said.toDay &&
    said.toDay <= said.statedOn &&
    payBy >= said.statedOn &&
    isAFarmDay(said.fromDay) &&
    isAFarmDay(said.statedOn, { notAfter: today }) &&
    isAFarmDay(payBy);
  if (!inOrder) {
    throw refuse(
      "statement_days",
      "Its days are not in order: first, last, its date — none after today — and the day he pays by"
    );
  }
};

/** Whoever records or voids a statement: the Manager or the Owner, signed in on the farm. */
type Recording = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
  roleUsed: NonNullable<Context["roleUsed"]>;
};

/**
 * Records a Buyer Statement and prices the milk it covers: every Dispatch to him in its days sent with its price to
 * follow takes its liters' share of the amount, less what the milk priced at the gate came to, in whole paisa, the
 * paisa left over placed oldest first; all of it owed by the day he pays by — his Receivable, which his payments then
 * clear. Nothing is booked as cash: nothing was paid at the gate. Once however often it is sent.
 */
export const recordStatement = async (
  context: Recording,
  said: StatementSaid
): Promise<{ id: string }> => {
  const now = context.clock.now();
  const farmId = context.farm.id;
  const already = await context.db.query.buyerStatement.findFirst({
    where: { id: said.id },
    columns: { id: true, farmId: true },
  });
  if (already) {
    if (already.farmId !== farmId) {
      throw new ORPCError("NOT_FOUND");
    }
    return { id: already.id };
  }
  const payBy =
    said.payBy ?? addDays(said.statedOn, context.farm.receivableDays);
  assertDays(said, payBy, farmDayOf(now));
  await audited(context).write(
    {
      entity: "buyer_statement",
      reachesMoney: true,
      entityId: said.id,
      action: "create",
      after: (tx) => readStatement(tx, said.id),
    },
    async (tx) => {
      const buyer = await tx.query.counterparty.findFirst({
        where: { id: said.counterpartyId, farmId },
        columns: { id: true },
      });
      if (!buyer) {
        throw refuse("no_such_buyer", "The farm has no such buyer");
      }
      // Held while his milk is priced and his Receivable grows, as a payment of his holds it.
      await lockTheBuyer(tx, buyer.id);
      const days = { fromDay: said.fromDay, toDay: said.toDay };
      if (await overlapping(tx, farmId, buyer.id, days)) {
        throw refuse(
          "statement_overlaps",
          "A statement of his for some of those days is recorded already"
        );
      }
      if (said.number) {
        const standing = await tx.query.buyerStatement.findMany({
          where: {
            farmId,
            counterpartyId: buyer.id,
            voidedAt: { isNull: true },
            number: { isNotNull: true },
          },
          columns: { number: true },
        });
        const asCompared = said.number.toLowerCase();
        if (standing.some((one) => one.number?.toLowerCase() === asCompared)) {
          throw refuse(
            "statement_number_taken",
            "A statement of his with that number is recorded already"
          );
        }
      }
      const beside = besideOf(
        await dispatchesIn(tx, farmId, buyer.id, days),
        said,
        null
      );
      if (beside.toFollowCount > 0 && beside.spreadMoney <= 0) {
        throw refuse(
          "statement_below_priced",
          "His amount is no more than the milk already priced at the gate: put those prices right first",
          { pricedMoney: beside.pricedMoney }
        );
      }
      await tx.insert(buyerStatement).values({
        id: said.id,
        farmId,
        counterpartyId: buyer.id,
        number: said.number ?? null,
        fromDay: said.fromDay,
        toDay: said.toDay,
        statedOn: said.statedOn,
        payBy,
        liters: said.liters.toFixed(2),
        amountMoney: said.amountMoney,
        fatPercent: twoPlaces(said.fatPercent),
        snfPercent: twoPlaces(said.snfPercent),
        ratePerLiterMoney: twoPlaces(said.ratePerLiterMoney),
        note: said.note ?? null,
        recordedBy: context.actor.id,
        recordedByRole: context.roleUsed,
        recordedAt: now,
      });
      const shares = spreadByLiters(beside.spreadMoney, beside.toFollow);
      for (const one of beside.toFollow) {
        // One row each, a handful a statement.
        // oxlint-disable-next-line no-await-in-loop
        await tx
          .update(dispatch)
          .set({
            buyerStatementId: said.id,
            receivableMoney: shares.get(one.id) ?? 0,
            promisedBy: payBy,
          })
          .where(eq(dispatch.id, one.id));
      }
      await answerForStatement(
        tx,
        changeByOf(context, now),
        { id: said.id, counterpartyId: buyer.id },
        beside.toFollow.map((one) => ({
          dispatchedAt: one.dispatchedAt,
          amountMoney: shares.get(one.id) ?? 0,
        })),
        "recorded"
      );
      if (said.photo) {
        await tx.insert(buyerStatementPhoto).values({
          statementId: said.id,
          farmId,
          ...said.photo,
          updatedAt: now,
        });
      }
    }
  );
  return { id: said.id };
};

/**
 * Voids a wrong Buyer Statement, with the Owner's reason: the milk it priced goes back to its price to follow, owing
 * nothing, for the right statement to price. Refused while his payments have cleared any of it or some of it was
 * written off: those are put right first, as a Dispatch's are.
 */
export const voidStatement = async (
  context: Recording,
  { id, reason }: { id: string; reason: string }
): Promise<{ id: string }> => {
  const now = context.clock.now();
  const farmId = context.farm.id;
  await audited(context).write(
    {
      entity: "buyer_statement",
      reachesMoney: true,
      entityId: id,
      action: "correct",
      reason,
      before: (tx) => readStatement(tx, id),
      after: (tx) => readStatement(tx, id),
    },
    async (tx) => {
      const row = await tx.query.buyerStatement.findFirst({
        where: { id, farmId },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "No such statement" });
      }
      if (row.voidedAt) {
        throw refuse("statement_voided", "That statement is voided already");
      }
      await lockTheBuyer(tx, row.counterpartyId);
      const priced = await tx.query.dispatch.findMany({
        where: { farmId, buyerStatementId: id },
        columns: { id: true, dispatchedAt: true, receivableMoney: true },
      });
      const ids = priced.map((one) => one.id);
      const writtenOff =
        ids.length === 0
          ? undefined
          : await tx.query.receivableWriteOff.findFirst({
              where: { farmId, sourceId: { in: ids } },
              columns: { id: true },
            });
      for (const one of writtenOff ? [] : priced) {
        // oxlint-disable-next-line no-await-in-loop -- a handful a statement, and the first paid one is enough
        const paid = await paidOnItem(tx, farmId, row.counterpartyId, one.id);
        if (paid > 0) {
          throw refuse(
            "statement_paid_on",
            "His payments have cleared some of the milk it priced: put the payment right first"
          );
        }
      }
      if (writtenOff) {
        throw refuse(
          "statement_paid_on",
          "Some of the milk it priced was written off: put that right first"
        );
      }
      if (ids.length > 0) {
        await tx
          .update(dispatch)
          .set({ buyerStatementId: null, receivableMoney: 0, promisedBy: null })
          .where(and(eq(dispatch.farmId, farmId), inArray(dispatch.id, ids)));
      }
      await tx
        .update(buyerStatement)
        .set({ voidedAt: now, voidedBy: context.actor.id, voidReason: reason })
        .where(eq(buyerStatement.id, id));
      await answerForStatement(
        tx,
        changeByOf(context, now),
        row,
        priced.map((one) => ({
          dispatchedAt: one.dispatchedAt,
          amountMoney: one.receivableMoney,
        })),
        "voided"
      );
      for (const one of ids) {
        // oxlint-disable-next-line no-await-in-loop -- one notice each, a handful
        await clearDebtNoticesOf(tx, farmId, one, now);
      }
    }
  );
  return { id };
};

/** How many statements the list reads back: a year and more of a fortnightly buyer, several buyers over. */
const STATEMENTS_READ = 120;

/**
 * The farm's Buyer Statements, the latest days first, each beside the farm's milk to him in its days as it stands now —
 * the voided ones too, marked, so the trail of a wrong statement is not lost from the page.
 */
export const statementsOf = async (db: Db, farmId: string) => {
  const rows = await db.query.buyerStatement.findMany({
    where: { farmId },
    orderBy: { toDay: "desc", recordedAt: "desc", id: "desc" },
    limit: STATEMENTS_READ,
    with: { buyer: { columns: { name: true } } },
  });
  const photos = await db.query.buyerStatementPhoto.findMany({
    where: { farmId, statementId: { in: rows.map((one) => one.id) } },
    columns: { statementId: true },
  });
  const withPhoto = new Set(photos.map((one) => one.statementId));
  return await Promise.all(
    rows.map(async (row) => {
      const said = {
        liters: Number(row.liters),
        amountMoney: row.amountMoney,
      };
      const dispatches = await dispatchesIn(
        db,
        farmId,
        row.counterpartyId,
        row
      );
      const { toFollow, ...beside } = besideOf(
        dispatches,
        said,
        row.voidedAt ? null : row.id
      );
      const pricedByIt = dispatches.filter(
        (one) => one.buyerStatementId === row.id
      );
      return {
        id: row.id,
        counterpartyId: row.counterpartyId,
        buyerName: row.buyer.name,
        number: row.number,
        fromDay: row.fromDay,
        toDay: row.toDay,
        statedOn: row.statedOn,
        payBy: row.payBy,
        ...said,
        fatPercent: row.fatPercent === null ? null : Number(row.fatPercent),
        snfPercent: row.snfPercent === null ? null : Number(row.snfPercent),
        ratePerLiterMoney:
          row.ratePerLiterMoney === null ? null : Number(row.ratePerLiterMoney),
        note: row.note,
        hasPhoto: withPhoto.has(row.id),
        ...beside,
        /** What it priced: the milk sent with its price to follow in its days, and what that came to. */
        pricedByItCount: pricedByIt.length,
        pricedByItMoney: roundMoney(
          pricedByIt.reduce((sum, one) => sum + one.receivableMoney, 0)
        ),
        /** Milk still to follow in its days — sent after a voided statement, or never priced. */
        stillToFollowCount: row.voidedAt ? toFollow.length : 0,
        voided: row.voidedAt
          ? { at: row.voidedAt, reason: row.voidReason ?? "" }
          : null,
      };
    })
  );
};

/**
 * Every buyer with milk sent and its price still to follow, the longest waiting first: how much, since when, and how
 * much of it is late — past his own statement's period, as long as his last, or a month, and ten days more.
 */
export const priceToFollowOf = async (
  db: Db,
  farmId: string,
  today: string
) => {
  const waiting = await db.query.dispatch.findMany({
    where: {
      farmId,
      pricePerLiterMoney: { isNull: true },
      buyerStatementId: { isNull: true },
    },
    columns: { id: true, dispatchedAt: true, liters: true, buyerId: true },
    with: { buyer: { columns: { name: true, phone: true } } },
    orderBy: { dispatchedAt: "asc", id: "asc" },
  });
  if (waiting.length === 0) {
    return [];
  }
  const buyerIds = [...new Set(waiting.map((one) => one.buyerId))];
  const statements = await db.query.buyerStatement.findMany({
    where: {
      farmId,
      counterpartyId: { in: buyerIds },
      voidedAt: { isNull: true },
    },
    columns: { counterpartyId: true, fromDay: true, toDay: true },
    orderBy: { toDay: "desc", id: "desc" },
  });
  const periodOf = new Map<string, number>();
  for (const one of statements) {
    if (!periodOf.has(one.counterpartyId)) {
      periodOf.set(
        one.counterpartyId,
        statementPeriodDays(one.fromDay, one.toDay)
      );
    }
  }
  const byBuyer = new Map<string, typeof waiting>();
  for (const one of waiting) {
    byBuyer.set(one.buyerId, [...(byBuyer.get(one.buyerId) ?? []), one]);
  }
  return [...byBuyer.entries()].map(([counterpartyId, theirs]) => {
    const periodDays = periodOf.get(counterpartyId) ?? null;
    const late = theirs.filter((one) =>
      isPriceToFollowOverdue(farmDayOf(one.dispatchedAt), today, periodDays)
    );
    const oldestOn = farmDayOf(theirs[0]?.dispatchedAt ?? new Date());
    return {
      counterpartyId,
      name: theirs[0]?.buyer.name ?? "",
      phone: theirs[0]?.buyer.phone ?? null,
      count: theirs.length,
      liters: roundLiters(
        theirs.reduce((sum, one) => sum + Number(one.liters), 0)
      ),
      oldestOn,
      /** The farm day the oldest of it went, or goes, late. */
      lateFrom: priceToFollowOverdueFrom(oldestOn, periodDays),
      lateCount: late.length,
      lateLiters: roundLiters(
        late.reduce((sum, one) => sum + Number(one.liters), 0)
      ),
    };
  });
};
