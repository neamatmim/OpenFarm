import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { handover } from "@OpenFarm/db/schema/money";
import { roundTaka } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import { THE_FARMS_PURSE } from "./money-store";

// Who holds the farm's cash: each person's **Cash in Hand** — the cash Money Events that named their hand, in less out,
// and the Handovers that moved it on to another hand or to the bank.

type Db = Pick<Database, "query"> | Tx;

/** The Roles whose hands the farm's cash passes through. */
export const CASH_HOLDING_ROLES: readonly RoleName[] = ["owner", "manager"];

/** One person's Cash in Hand. */
export interface HandHolds {
  userId: string;
  name: string;
  bdt: number;
}

/**
 * Every hand that holds the farm's cash, and what is in it: each Owner and Manager, and anybody else a Money Event or
 * a Handover still names. Only the Farm's own purse: a Venture's money moves through its account, not a pocket.
 */
export const cashInHand = async (
  db: Db,
  farmId: string
): Promise<HandHolds[]> => {
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
  for (const userId of await holdersOf(db as Tx, farmId, CASH_HOLDING_ROLES)) {
    add(userId, 0);
  }
  const people = await db.query.user.findMany({
    where: { id: { in: [...holds.keys()] } },
    columns: { id: true, name: true },
  });
  const nameOf = new Map(people.map((one) => [one.id, one.name]));
  return [...holds]
    .map(([userId, bdt]) => ({
      userId,
      name: nameOf.get(userId) ?? "",
      bdt: roundTaka(bdt),
    }))
    .toSorted((a, b) => b.bdt - a.bdt || a.name.localeCompare(b.name));
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
