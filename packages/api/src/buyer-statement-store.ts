import type { Database } from "@OpenFarm/db";
import { and, eq, inArray } from "@OpenFarm/db/operators";
import {
  buyerStatement,
  buyerStatementPhoto,
  dispatch,
} from "@OpenFarm/db/schema/milk";
import type { StatementDays } from "@OpenFarm/domain";
import {
  addDays,
  farmDayOf,
  farmDaysBetween,
  isAFarmDay,
  isPriceToFollowLate,
  litersCompared,
  nameAsCompared,
  priceToFollowLateFrom,
  roundLiters,
  roundMoney,
  spreadByLiters,
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
import { sameBuyerIds } from "./counterparty-store";
import { dispatchFields, twoPlaces, worthOfDispatch } from "./dispatch-store";
import { farmDay } from "./farm-clock";
import { lockTheFarm } from "./farm-lock";
import { photoInput } from "./photo-input";
import { paidOnItems } from "./receivable-store";
import { refuse } from "./refuse";
import { seenWhenDone } from "./writes-seen";

// A **Buyer Statement** (ADR 0033): the milk buyer's own account of a stretch of days, set beside the milk the farm
// sent him in them, and the money that prices what the farm sent with its price to follow.

type Db = Pick<Database, "query" | "select"> | Tx;

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

/** What a statement is set beside before it is recorded: whose, which days, and his liters and money, as recorded. */
export const besideInput = z.object(
  statementInput.pick({
    counterpartyId: true,
    fromDay: true,
    toDay: true,
    liters: true,
    amountMoney: true,
  }).shape
);

/** A Dispatch to the buyer in a statement's days, as the statement reads it. */
interface DispatchIn {
  id: string;
  buyerId: string;
  dispatchedAt: Date;
  liters: number;
  pricePerLiterMoney: string | null;
  receivableMoney: number;
  buyerStatementId: string | null;
}

const DISPATCH_IN = {
  id: true,
  buyerId: true,
  dispatchedAt: true,
  liters: true,
  pricePerLiterMoney: true,
  receivableMoney: true,
  buyerStatementId: true,
} as const;

/**
 * Every Dispatch to one buyer in a stretch of farm days, oldest first — under any name the farm kept him by
 * (`sameBuyerIds`), so a buyer written down twice before names were compared has all his milk set beside his statement.
 */
const dispatchesIn = async (
  db: Db,
  farmId: string,
  buyerIds: readonly string[],
  { fromDay, toDay }: StatementDays
): Promise<DispatchIn[]> => {
  const range = farmDaysBetween(fromDay, toDay);
  const rows = await db.query.dispatch.findMany({
    where: {
      farmId,
      buyerId: { in: [...buyerIds] },
      dispatchedAt: { gte: range.from, lt: range.until },
    },
    columns: DISPATCH_IN,
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
  /** The milk sent with its price to follow, which the statement prices — or priced, once recorded. */
  toFollowCount: number;
  toFollowLiters: number;
  /** What the statement prices that milk at: his amount, less the milk priced at the gate. */
  spreadMoney: number;
  /** What his amount says beyond everything the farm has priced in its days, the milk it priced among it. */
  amountDifferenceMoney: number;
}

/** The figures every statement is set beside the farm's milk by: liters, and the milk priced at the gate. */
const gateFiguresOf = (
  dispatches: readonly DispatchIn[],
  statedLiters: number
) => {
  const priced = dispatches.filter((one) => one.pricePerLiterMoney !== null);
  const farmLiters = roundLiters(
    dispatches.reduce((sum, one) => sum + one.liters, 0)
  );
  return {
    farmLiters,
    ...litersCompared({ statedLiters, farmLiters }),
    pricedLiters: roundLiters(priced.reduce((sum, one) => sum + one.liters, 0)),
    pricedMoney: roundMoney(
      priced.reduce(
        (sum, one) =>
          sum +
          worthOfDispatch({
            liters: one.liters,
            pricePerLiterMoney: one.pricePerLiterMoney ?? 0,
          }),
        0
      )
    ),
  };
};

/**
 * A statement not yet recorded beside the farm's own Dispatches: the liters, the milk priced at the gate, and the milk
 * still to follow, which it would price at his amount less the gate's — the gap is then filled by that milk, and said
 * only where none of it was to follow.
 */
const besideToRecord = (
  dispatches: readonly DispatchIn[],
  said: { liters: number; amountMoney: number }
): StatementBeside & { toFollow: DispatchIn[] } => {
  const gate = gateFiguresOf(dispatches, said.liters);
  const toFollow = dispatches.filter(
    (one) => one.pricePerLiterMoney === null && one.buyerStatementId === null
  );
  const leftOver = roundMoney(said.amountMoney - gate.pricedMoney);
  return {
    ...gate,
    toFollow,
    toFollowCount: toFollow.length,
    toFollowLiters: roundLiters(
      toFollow.reduce((sum, one) => sum + one.liters, 0)
    ),
    spreadMoney: toFollow.length > 0 ? leftOver : 0,
    amountDifferenceMoney: toFollow.length > 0 ? 0 : leftOver,
  };
};

/**
 * A recorded statement beside the farm's Dispatches as they stand now: what it priced stays what it priced, and his
 * amount is set against the gate's milk and its own — so a can priced at the gate written into its days later shows as
 * the difference it is, never as nought.
 */
const besideRecorded = (
  dispatches: readonly DispatchIn[],
  said: { liters: number; amountMoney: number },
  statementId: string | null
): StatementBeside & { pricedByItCount: number; pricedByItMoney: number } => {
  const gate = gateFiguresOf(dispatches, said.liters);
  const pricedByIt =
    statementId === null
      ? []
      : dispatches.filter((one) => one.buyerStatementId === statementId);
  const pricedByItMoney = roundMoney(
    pricedByIt.reduce((sum, one) => sum + one.receivableMoney, 0)
  );
  return {
    ...gate,
    toFollowCount: pricedByIt.length,
    toFollowLiters: roundLiters(
      pricedByIt.reduce((sum, one) => sum + one.liters, 0)
    ),
    spreadMoney: pricedByItMoney,
    amountDifferenceMoney: roundMoney(
      said.amountMoney - gate.pricedMoney - pricedByItMoney
    ),
    pricedByItCount: pricedByIt.length,
    pricedByItMoney,
  };
};

/** A standing statement of his — under any name the farm kept him by — whose days meet these, if any. */
const overlapping = async (
  db: Db,
  farmId: string,
  buyerIds: readonly string[],
  { fromDay, toDay }: StatementDays
) =>
  await db.query.buyerStatement.findFirst({
    where: {
      farmId,
      counterpartyId: { in: [...buyerIds] },
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
  const buyerIds = await sameBuyerIds(db, farmId, said.counterpartyId);
  const [dispatches, overlap] = await Promise.all([
    dispatchesIn(db, farmId, buyerIds, days),
    overlapping(db, farmId, buyerIds, days),
  ]);
  const { toFollow: _toFollow, ...beside } = besideToRecord(dispatches, said);
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
  const covering = await overlapping(
    tx,
    farmId,
    await sameBuyerIds(tx, farmId, counterpartyId),
    { fromDay: day, toDay: day }
  );
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
 * record or void, and kept for the next paper (ADR 0028, 0033).
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

/** A standing statement of his under this number already, whatever its capitals: one number once for a buyer. */
const assertNumberFree = async (
  tx: Tx,
  farmId: string,
  buyerIds: readonly string[],
  number: string | undefined
) => {
  if (!number) {
    return;
  }
  const standing = await tx.query.buyerStatement.findMany({
    where: {
      farmId,
      counterpartyId: { in: [...buyerIds] },
      voidedAt: { isNull: true },
      number: { isNotNull: true },
    },
    columns: { number: true },
  });
  const asCompared = number.toLowerCase();
  if (standing.some((one) => one.number?.toLowerCase() === asCompared)) {
    throw refuse(
      "statement_number_taken",
      "A statement of his with that number is recorded already"
    );
  }
};

/** Whoever records or voids a statement: the Manager or the Owner, signed in on the farm. */
type Recording = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
  roleUsed: NonNullable<Context["roleUsed"]>;
};

/** Prices the milk a statement covers with its shares: all of each owed, by the day he pays by. */
const priceTheMilk = async (
  tx: Tx,
  statementId: string,
  toFollow: readonly DispatchIn[],
  shares: ReadonlyMap<string, number>,
  payBy: string
) => {
  for (const one of toFollow) {
    // One row each, a handful a statement.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(dispatch)
      .set({
        buyerStatementId: statementId,
        receivableMoney: shares.get(one.id) ?? 0,
        promisedBy: payBy,
      })
      .where(eq(dispatch.id, one.id));
  }
};

/**
 * Records a Buyer Statement and prices the milk it covers: every Dispatch to him in its days sent with its price to
 * follow takes its liters' share of the amount, less what the milk priced at the gate came to, in whole paisa, the
 * paisa left over placed oldest first; all of it owed by the day he pays by — his Receivable, which his payments then
 * clear. Nothing is booked as cash: nothing was paid at the gate. Once however often it is sent: the phone's id is
 * asked behind the Farm's lock, so two sends at once find each other rather than an overlap.
 */
export const recordStatement = async (
  context: Recording,
  said: StatementSaid
): Promise<{ id: string }> => {
  const now = context.clock.now();
  const farmId = context.farm.id;
  const payBy =
    said.payBy ?? addDays(said.statedOn, context.farm.receivableDays);
  assertDays(said, payBy, farmDayOf(now));
  return await seenWhenDone(
    context.db.transaction(async (tx) => {
      await lockTheFarm(tx, farmId);
      const already = await tx.query.buyerStatement.findFirst({
        where: { id: said.id },
        columns: { id: true, farmId: true },
      });
      if (already) {
        if (already.farmId !== farmId) {
          throw new ORPCError("NOT_FOUND");
        }
        return { id: already.id };
      }
      const buyer = await tx.query.counterparty.findFirst({
        where: { id: said.counterpartyId, farmId },
        columns: { id: true },
      });
      if (!buyer) {
        throw refuse("no_such_buyer", "The farm has no such buyer");
      }
      const buyerIds = await sameBuyerIds(tx, farmId, buyer.id);
      const days = { fromDay: said.fromDay, toDay: said.toDay };
      if (await overlapping(tx, farmId, buyerIds, days)) {
        throw refuse(
          "statement_overlaps",
          "A statement of his for some of those days is recorded already"
        );
      }
      await assertNumberFree(tx, farmId, buyerIds, said.number);
      const beside = besideToRecord(
        await dispatchesIn(tx, farmId, buyerIds, days),
        said
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
      await priceTheMilk(tx, said.id, beside.toFollow, shares, payBy);
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
      await audited(context).recordEvent(tx, {
        entity: "buyer_statement",
        entityId: said.id,
        action: "create",
        after: (read) => readStatement(read, said.id),
      });
      return { id: said.id };
    })
  );
};

/**
 * Refused while his payments have cleared any of the milk a statement priced, or some was written off: those are put
 * right first, as a Dispatch's are. Each buyer's book read once, however many Dispatches it priced.
 */
const assertNothingStandsOnIt = async (
  tx: Tx,
  farmId: string,
  priced: readonly { id: string; buyerId: string }[]
) => {
  const ids = priced.map((one) => one.id);
  const writtenOff =
    ids.length === 0
      ? undefined
      : await tx.query.receivableWriteOff.findFirst({
          where: { farmId, sourceId: { in: ids } },
          columns: { id: true },
        });
  if (writtenOff) {
    throw refuse(
      "statement_paid_on",
      "Some of the milk it priced was written off: put that right first"
    );
  }
  for (const buyerId of new Set(priced.map((one) => one.buyerId))) {
    // oxlint-disable-next-line no-await-in-loop -- one book a buyer, nearly always one
    const paid = await paidOnItems(tx, farmId, buyerId);
    if (ids.some((id) => (paid.get(id) ?? 0) > 0)) {
      throw refuse(
        "statement_paid_on",
        "His payments have cleared some of the milk it priced: put the payment right first"
      );
    }
  }
};

/**
 * Voids a wrong Buyer Statement, with the Owner's reason: the milk it priced goes back to its price to follow, owing
 * nothing, for the right statement to price.
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
      const priced = await tx.query.dispatch.findMany({
        where: { farmId, buyerStatementId: id },
        columns: {
          id: true,
          buyerId: true,
          dispatchedAt: true,
          receivableMoney: true,
        },
      });
      await assertNothingStandsOnIt(tx, farmId, priced);
      const ids = priced.map((one) => one.id);
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

/** Whether a Dispatch is one a statement is set beside: his under any name, and in its days. */
const inItsDays =
  (row: { fromDay: string; toDay: string; buyer: { name: string } }) =>
  (one: { dispatchedAt: Date; buyer: { name: string } }) => {
    const day = farmDayOf(one.dispatchedAt);
    return (
      day >= row.fromDay &&
      day <= row.toDay &&
      nameAsCompared(one.buyer.name) === nameAsCompared(row.buyer.name)
    );
  };

/**
 * The farm's Buyer Statements, the latest days first, each beside the farm's milk to him in its days as it stands now —
 * the voided ones too, marked, so the trail of a wrong statement is not lost from the page. Their Dispatches are read
 * in one go, across the days they cover.
 */
export const statementsOf = async (db: Db, farmId: string) => {
  const rows = await db.query.buyerStatement.findMany({
    where: { farmId },
    orderBy: { toDay: "desc", recordedAt: "desc", id: "desc" },
    limit: STATEMENTS_READ,
    with: { buyer: { columns: { name: true } } },
  });
  if (rows.length === 0) {
    return [];
  }
  const firstDay = rows.map((one) => one.fromDay).toSorted()[0] ?? "";
  const lastDay =
    rows
      .map((one) => one.toDay)
      .toSorted()
      .at(-1) ?? "";
  const range = farmDaysBetween(firstDay, lastDay);
  const [photos, sent] = await Promise.all([
    db.query.buyerStatementPhoto.findMany({
      where: { farmId, statementId: { in: rows.map((one) => one.id) } },
      columns: { statementId: true },
    }),
    db.query.dispatch.findMany({
      where: { farmId, dispatchedAt: { gte: range.from, lt: range.until } },
      columns: DISPATCH_IN,
      with: { buyer: { columns: { name: true } } },
      orderBy: { dispatchedAt: "asc", id: "asc" },
    }),
  ]);
  const withPhoto = new Set(photos.map((one) => one.statementId));
  return rows.map((row) => {
    const said = { liters: Number(row.liters), amountMoney: row.amountMoney };
    const dispatches = sent
      .filter(inItsDays(row))
      .map((one) => ({ ...one, liters: Number(one.liters) }));
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
      ...besideRecorded(dispatches, said, row.voidedAt ? null : row.id),
      voided: row.voidedAt
        ? { at: row.voidedAt, reason: row.voidReason ?? "" }
        : null,
    };
  });
};

/**
 * Every buyer with milk sent and its price still to follow, the longest waiting first: how much, since when, and how
 * much of it is late — ten days past the end of his statement period it falls in, periods stepping on from his last
 * standing statement, or the calendar month while he has sent none. A buyer kept under two names is one buyer.
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
  const statements = await db.query.buyerStatement.findMany({
    where: { farmId, voidedAt: { isNull: true } },
    columns: { fromDay: true, toDay: true },
    with: { buyer: { columns: { name: true } } },
    orderBy: { toDay: "desc", id: "desc" },
  });
  const lastOf = new Map<string, StatementDays>();
  for (const one of statements) {
    const key = nameAsCompared(one.buyer.name);
    if (!lastOf.has(key)) {
      lastOf.set(key, { fromDay: one.fromDay, toDay: one.toDay });
    }
  }
  const byBuyer = new Map<string, typeof waiting>();
  for (const one of waiting) {
    const key = nameAsCompared(one.buyer.name);
    byBuyer.set(key, [...(byBuyer.get(key) ?? []), one]);
  }
  return [...byBuyer.entries()].flatMap(([key, theirs]) => {
    const [oldest] = theirs;
    if (!oldest) {
      return [];
    }
    const last = lastOf.get(key) ?? null;
    const oldestOn = farmDayOf(oldest.dispatchedAt);
    const late = theirs.filter((one) =>
      isPriceToFollowLate(farmDayOf(one.dispatchedAt), today, last)
    );
    return [
      {
        counterpartyId: oldest.buyerId,
        name: oldest.buyer.name,
        phone: oldest.buyer.phone,
        count: theirs.length,
        liters: roundLiters(
          theirs.reduce((sum, one) => sum + Number(one.liters), 0)
        ),
        oldestOn,
        /** The farm day the oldest of it went, or goes, late. */
        lateFrom: priceToFollowLateFrom(oldestOn, last),
        lateCount: late.length,
        lateLiters: roundLiters(
          late.reduce((sum, one) => sum + Number(one.liters), 0)
        ),
      },
    ];
  });
};
