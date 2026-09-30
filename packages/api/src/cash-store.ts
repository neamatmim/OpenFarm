import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { cashCount } from "@OpenFarm/db/schema/cash";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { handover } from "@OpenFarm/db/schema/money";
import { farmDayOf, roundTaka } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import { THE_FARMS_PURSE } from "./money-store";
import { tell } from "./notice";

// Who holds the farm's cash: each person's **Cash in Hand** — the cash Money Events that named their hand, in less out,
// and the Handovers that moved it on to another hand or to the bank.

type Db = Pick<Database, "query"> | Tx;

/** The Roles whose hands the farm's cash passes through. */
export const CASH_HOLDING_ROLES: readonly RoleName[] = ["owner", "manager"];

/** One person's Cash in Hand, and the last time it was counted. */
export interface HandHolds {
  userId: string;
  name: string;
  bdt: number;
  /** The last Cash Count of this hand: when, what was found, and what the farm said it held; nothing if never. */
  lastCount: { at: Date; counted: number; expected: number } | null;
}

/**
 * What every hand holds of the Farm's cash: the cash Money Events that named it, in less out; the Handovers to and from
 * it; and each Cash Count's difference, so a hand holds what was counted from the count on. A count being recorded again
 * is left out of what it is compared against.
 */
const handsOf = async (
  db: Db,
  farmId: string,
  { excludingCount }: { excludingCount?: string } = {}
): Promise<Map<string, number>> => {
  const events = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      paymentMethod: "cash",
      heldBy: { isNotNull: true },
      purseVentureId: THE_FARMS_PURSE,
    },
    columns: { heldBy: true, direction: true, amountBdt: true },
  });
  const handed = await db.query.handover.findMany({
    where: { farmId },
    columns: { fromUserId: true, toUserId: true, amountBdt: true },
  });
  const counts = await db.query.cashCount.findMany({
    where: { farmId },
    columns: {
      userId: true,
      completionId: true,
      counted: true,
      expected: true,
    },
  });
  const holds = new Map<string, number>();
  const add = (userId: string | null, bdt: number) => {
    if (userId) {
      holds.set(userId, (holds.get(userId) ?? 0) + bdt);
    }
  };
  for (const one of events) {
    add(one.heldBy, one.direction === "in" ? one.amountBdt : -one.amountBdt);
  }
  for (const one of handed) {
    add(one.fromUserId, -one.amountBdt);
    add(one.toUserId, one.amountBdt);
  }
  for (const one of counts) {
    if (one.completionId !== excludingCount) {
      add(one.userId, one.counted - one.expected);
    }
  }
  return holds;
};

/**
 * Every hand that holds the farm's cash, and what is in it: each Owner and Manager, and anybody else a Money Event or
 * a Handover still names. Only the Farm's own purse: a Venture's money moves through its account, not a pocket.
 */
export const cashInHand = async (
  db: Db,
  farmId: string
): Promise<HandHolds[]> => {
  const holds = await handsOf(db, farmId);
  for (const userId of await holdersOf(db as Tx, farmId, CASH_HOLDING_ROLES)) {
    holds.set(userId, holds.get(userId) ?? 0);
  }
  const people = await db.query.user.findMany({
    where: { id: { in: [...holds.keys()] } },
    columns: { id: true, name: true },
  });
  const lastCounts = await db.query.cashCount.findMany({
    where: { farmId, userId: { in: [...holds.keys()] } },
    columns: { userId: true, countedAt: true, counted: true, expected: true },
    orderBy: { countedAt: "desc", id: "desc" },
  });
  const lastOf = new Map<string, HandHolds["lastCount"]>();
  for (const one of lastCounts) {
    if (!lastOf.has(one.userId)) {
      lastOf.set(one.userId, {
        at: one.countedAt,
        counted: one.counted,
        expected: one.expected,
      });
    }
  }
  const nameOf = new Map(people.map((one) => [one.id, one.name]));
  return [...holds]
    .map(([userId, bdt]) => ({
      userId,
      name: nameOf.get(userId) ?? "",
      bdt: roundTaka(bdt),
      lastCount: lastOf.get(userId) ?? null,
    }))
    .toSorted((a, b) => b.bdt - a.bdt || a.name.localeCompare(b.name));
};

/**
 * One hand's Cash Count: the notes the person found in their own hand, beside what the farm said they held — this
 * count left out, so a recount compares afresh — and, short by more than the Owner's line, the Owner told once in the
 * evening's post. The count wins: the hand holds what was counted from here on.
 */
export const recordCashCount = async (
  tx: Tx,
  input: {
    farm: { id: string; cashShortTellBdt: number };
    userId: string;
    completionId: string;
    counted: number;
    note: string | null;
    countedAt: Date;
    now: Date;
  }
): Promise<{ differs: boolean }> => {
  const holds = await handsOf(tx, input.farm.id, {
    excludingCount: input.completionId,
  });
  const expected = roundTaka(holds.get(input.userId) ?? 0);
  const row = {
    userId: input.userId,
    counted: input.counted,
    expected,
    note: input.note,
    countedAt: input.countedAt,
    recordedAt: input.now,
  };
  await tx
    .insert(cashCount)
    .values({
      id: uuidv7(input.now),
      farmId: input.farm.id,
      completionId: input.completionId,
      ...row,
    })
    .onConflictDoUpdate({ target: cashCount.completionId, set: row });
  const shortBdt = roundTaka(expected - input.counted);
  if (shortBdt > input.farm.cashShortTellBdt) {
    const counter = await tx.query.user.findFirst({
      where: { id: input.userId },
      columns: { name: true },
    });
    await tell(
      tx,
      input.farm.id,
      {
        kind: "cash_short",
        about: { id: input.completionId },
        facts: {
          name: counter?.name ?? "",
          shortBdt,
          countedOn: farmDayOf(input.countedAt),
        },
      },
      input.now
    );
  }
  return { differs: input.counted !== expected };
};

/** A count taken back — the Step put right to a skip — is no count. */
export const removeCashCount = async (
  tx: Tx,
  completionId: string
): Promise<void> => {
  await tx.delete(cashCount).where(eq(cashCount.completionId, completionId));
};

/** One way cash came into a hand or left it, as that hand's own list shows it. */
export interface CashMovement {
  id: string;
  at: Date;
  /** Into the hand, above nothing; out of it, below. */
  bdt: number;
  kind: "money" | "handover";
  /** The Money Event's Category, in both languages; nothing for a Handover. */
  categoryBn: string | null;
  categoryEn: string | null;
  /** The other end of a Handover: a person's name, or nothing for the bank. */
  otherName: string | null;
  bank: boolean;
  note: string | null;
}

/** How far back a hand's own list reads. */
const MOVEMENTS_SHOWN = 100;

/** Everything that moved cash into or out of one hand, newest first. */
export const cashMovementsOf = async (
  db: Db,
  farmId: string,
  userId: string
): Promise<CashMovement[]> => {
  const events = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      paymentMethod: "cash",
      heldBy: userId,
      purseVentureId: THE_FARMS_PURSE,
    },
    columns: {
      id: true,
      occurredAt: true,
      direction: true,
      amountBdt: true,
      note: true,
    },
    with: { category: { columns: { nameBn: true, nameEn: true } } },
    orderBy: { occurredAt: "desc", id: "desc" },
    limit: MOVEMENTS_SHOWN,
  });
  const handed = await db.query.handover.findMany({
    where: { farmId, OR: [{ fromUserId: userId }, { toUserId: userId }] },
    columns: {
      id: true,
      handedAt: true,
      fromUserId: true,
      toUserId: true,
      amountBdt: true,
      note: true,
    },
    with: {
      giver: { columns: { name: true } },
      taker: { columns: { name: true } },
    },
    orderBy: { handedAt: "desc", id: "desc" },
    limit: MOVEMENTS_SHOWN,
  });
  const moved: CashMovement[] = [
    ...events.map((one) => ({
      id: one.id,
      at: one.occurredAt,
      bdt: one.direction === "in" ? one.amountBdt : -one.amountBdt,
      kind: "money" as const,
      categoryBn: one.category.nameBn,
      categoryEn: one.category.nameEn,
      otherName: null,
      bank: false,
      note: one.note,
    })),
    ...handed.map((one) => {
      const outOfThisHand = one.fromUserId === userId;
      const other = outOfThisHand ? one.taker : one.giver;
      return {
        id: one.id,
        at: one.handedAt,
        bdt: outOfThisHand ? -one.amountBdt : one.amountBdt,
        kind: "handover" as const,
        categoryBn: null,
        categoryEn: null,
        otherName: other?.name ?? null,
        bank: other === null,
        note: one.note,
      };
    }),
  ];
  return moved
    .toSorted(
      (a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id)
    )
    .slice(0, MOVEMENTS_SHOWN);
};

/** One end of a Handover: a person's hand, or the bank. */
export type HandEnd = { userId: string } | { bank: true };

const userOf = (end: HandEnd): string | null =>
  "userId" in end ? end.userId : null;

/**
 * Cash passed from one hand to another, or to the bank or out of it. Refused from the bank to the bank, from a hand to
 * itself, to a person who holds no cash on this farm, and — the bank being one end — without its slip.
 */
export const recordHandover = async (
  tx: Tx,
  input: {
    farmId: string;
    from: HandEnd;
    to: HandEnd;
    amountBdt: number;
    handedAt: Date;
    reference: string | null;
    note: string | null;
    recordedBy: string;
    recordedByRole: RoleName;
    now: Date;
  }
): Promise<{ id: string }> => {
  const fromUserId = userOf(input.from);
  const toUserId = userOf(input.to);
  if (fromUserId === toUserId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Cash is handed from one hand to another, or to or from the bank",
      data: { refusal: "handover_goes_nowhere" },
    });
  }
  const bankIsAnEnd = fromUserId === null || toUserId === null;
  if (bankIsAnEnd && !input.reference) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The bank's end of a Handover needs its slip or cheque",
      data: { refusal: "bank_needs_a_slip" },
    });
  }
  const holders = await holdersOf(tx, input.farmId, CASH_HOLDING_ROLES);
  for (const userId of [fromUserId, toUserId]) {
    if (userId && !holders.includes(userId)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Only the Owner or a Manager holds the farm's cash",
        data: { refusal: "holds_no_cash" },
      });
    }
  }
  const id = uuidv7(input.now);
  await tx.insert(handover).values({
    id,
    farmId: input.farmId,
    fromUserId,
    toUserId,
    amountBdt: input.amountBdt,
    handedAt: input.handedAt,
    reference: input.reference,
    note: input.note,
    recordedBy: input.recordedBy,
    recordedByRole: input.recordedByRole,
    recordedAt: input.now,
  });
  return { id };
};

/** A Handover as the trail records it. */
export const readHandover = async (tx: Tx, id: string) =>
  (await tx.query.handover.findFirst({ where: { id } })) ?? null;
