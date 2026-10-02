import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { cashCount } from "@OpenFarm/db/schema/cash";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { handover } from "@OpenFarm/db/schema/money";
import { buyingTrip } from "@OpenFarm/db/schema/trip";
import { ventureMovement } from "@OpenFarm/db/schema/venture";
import { farmDayOf, roundTaka } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import { THE_FARMS_PURSE } from "./money-store";
import { tell } from "./notice";
import { lockTheFarm, whatTheFloatBought } from "./venture-store";

// Who holds the farm's cash: each person's **Cash in Hand** — the cash Money Events that named their hand, in less out,
// and the Handovers that moved it on to another hand or to the bank.

type Db = Pick<Database, "query"> | Tx;

/** The Roles whose hands the farm's cash passes through. */
export const CASH_HOLDING_ROLES: readonly RoleName[] = ["owner", "manager"];

/** A Venture's animal sold for cash, its price still in the hand that took it: the Venture's money until deposited. */
export interface HeldSale {
  saleId: string;
  heldBy: string;
  ventureId: string;
  ventureName: string;
  tagNumber: string;
  bdt: number;
}

/**
 * Every Venture's sale cash still in a hand: a cash Sale of a Venture's animal whose price no deposit has carried into
 * its Venture Account yet — no `sale_in` movement. A Sale written before this was kept, its movement already there, is
 * not held: there is no start day to go back to.
 */
export const heldSalesOf = async (
  db: Db,
  farmId: string,
  { ventureId }: { ventureId?: string } = {}
): Promise<HeldSale[]> => {
  const events = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      source: "sale",
      paymentMethod: "cash",
      heldBy: { isNotNull: true },
      purseVentureId: ventureId ?? { isNotNull: true },
    },
    columns: {
      sourceId: true,
      heldBy: true,
      purseVentureId: true,
      amountBdt: true,
    },
  });
  if (events.length === 0) {
    return [];
  }
  const saleIds = events.map((one) => one.sourceId);
  const [moved, sales, ventures] = await Promise.all([
    db.query.ventureMovement.findMany({
      where: { farmId, kind: "sale_in", saleId: { in: saleIds } },
      columns: { saleId: true },
    }),
    db.query.sale.findMany({
      where: { farmId, id: { in: saleIds } },
      columns: { id: true },
      with: { animal: { columns: { tagNumber: true } } },
    }),
    db.query.venture.findMany({
      where: {
        farmId,
        id: {
          in: [...new Set(events.flatMap((one) => one.purseVentureId ?? []))],
        },
      },
      columns: { id: true, name: true },
    }),
  ]);
  const deposited = new Set(moved.map((one) => one.saleId));
  const tagOf = new Map(sales.map((one) => [one.id, one.animal.tagNumber]));
  const nameOf = new Map(ventures.map((one) => [one.id, one.name]));
  return events.flatMap((one) =>
    one.heldBy && one.purseVentureId && !deposited.has(one.sourceId)
      ? [
          {
            saleId: one.sourceId,
            heldBy: one.heldBy,
            ventureId: one.purseVentureId,
            ventureName: nameOf.get(one.purseVentureId) ?? "",
            tagNumber: tagOf.get(one.sourceId) ?? "",
            bdt: one.amountBdt,
          },
        ]
      : []
  );
};

/**
 * Whose hand a cash record names, where the writer names one: the Owner may name any Owner or Manager — writing up the
 * Manager's haat sale that evening — and a Manager only their own; and only a hand that holds the farm's cash. Left
 * out, the writer's, as it has always been.
 */
export const assertTheHand = async (
  db: Db,
  farmId: string,
  writer: { id: string; roles: readonly string[] },
  heldBy: string | undefined
): Promise<string | undefined> => {
  if (heldBy === undefined) {
    return undefined;
  }
  if (heldBy !== writer.id && !writer.roles.includes("owner")) {
    throw new ORPCError("FORBIDDEN", {
      message: "Another person's cash in hand is the Owner's to name",
      data: { refusal: "owner_only" },
    });
  }
  const holders = await holdersOf(db as Tx, farmId, CASH_HOLDING_ROLES);
  if (!holders.includes(heldBy)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only the Owner or a Manager holds the farm's cash",
      data: { refusal: "holds_no_cash" },
    });
  }
  return heldBy;
};

/** Whose hand a record's cash is in now, as its Money Event names it: nothing for bKash or the bank, or none named. */
export const handOfTheRecord = async (
  db: Db,
  farmId: string,
  source: "sale" | "baki_payment",
  sourceId: string
): Promise<string | null> => {
  const money = await db.query.moneyEvent.findFirst({
    where: { farmId, source, sourceId },
    columns: { heldBy: true },
  });
  return money?.heldBy ?? null;
};

/** One person's Cash in Hand, and the last time it was counted. */
export interface HandHolds {
  userId: string;
  name: string;
  /** Every note in the hand, the Farm's and any Venture's sale cash together: what a Cash Count finds. */
  bdt: number;
  /** Of which, a Venture's sale cash not yet deposited, Sale by Sale. */
  ventures: HeldSale[];
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
  // A deposit of a Venture's sale cash is left out: the Sales it carried stop being held the moment it is written.
  const handed = await db.query.handover.findMany({
    where: { farmId, ventureId: { isNull: true } },
    columns: { fromUserId: true, toUserId: true, amountBdt: true },
  });
  const held = await heldSalesOf(db, farmId);
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
  // A Venture's sale cash is in the hand that took it until it is deposited: the notes are there to be counted.
  for (const one of held) {
    add(one.heldBy, one.bdt);
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
 * a Handover still names. The Farm's own purse, and a Venture's sale cash held in a hand until it is deposited — named
 * as that Venture's — since a Cash Count finds every note.
 */
export const cashInHand = async (
  db: Db,
  farmId: string
): Promise<HandHolds[]> => {
  const [holds, held] = await Promise.all([
    handsOf(db, farmId),
    heldSalesOf(db, farmId),
  ]);
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
      ventures: held.filter((one) => one.heldBy === userId),
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

/** A Buying Float the Farm handed out for one of its own outings, as it stands. */
export interface FarmTripFloat {
  tripId: string;
  wentTo: string;
  wentOn: Date;
  /** Who carried it: whose hand the float went into. */
  carrierId: string | null;
  carrierName: string | null;
  handedBdt: number;
  /** What the outing bought of the Farm's own: the animals and their Hasil, and the outing's costs. */
  boughtBdt: number;
  /** What was brought back, where it was counted home. */
  backBdt: number;
  reconciledAt: Date | null;
}

/** What some Handovers came to, to the paisa. */
const sumOf = (rows: readonly { amountBdt: number }[]): number => {
  let total = 0;
  for (const one of rows) {
    total += one.amountBdt;
  }
  return roundTaka(total);
};

/** One outing's Farm float, or nothing where no Farm float went on it. */
export const farmTripFloat = async (
  db: Db,
  farmId: string,
  tripId: string
): Promise<FarmTripFloat | null> => {
  const trip = await db.query.buyingTrip.findFirst({
    where: { id: tripId, farmId },
    columns: { id: true, wentTo: true, wentOn: true, floatReconciledAt: true },
  });
  const handed = await db.query.handover.findMany({
    where: { farmId, buyingTripId: tripId },
    columns: { float: true, amountBdt: true, toUserId: true },
    with: { taker: { columns: { name: true } } },
    orderBy: { handedAt: "asc", id: "asc" },
  });
  const outs = handed.filter((one) => one.float === "out");
  if (!(trip && outs.length > 0)) {
    return null;
  }
  const bought = await whatTheFloatBought(db, farmId, {
    buyingTripId: tripId,
    ventureId: null,
  });
  const [first] = outs;
  return {
    tripId,
    wentTo: trip.wentTo,
    wentOn: trip.wentOn,
    carrierId: first?.toUserId ?? null,
    carrierName: first?.taker?.name ?? null,
    handedBdt: sumOf(outs),
    boughtBdt: roundTaka(bought.animalsBdt + bought.tripBdt),
    backBdt: sumOf(handed.filter((one) => one.float === "back")),
    reconciledAt: trip.floatReconciledAt,
  };
};

/** Every Farm float still out, the oldest outing first. */
export const openFarmFloats = async (
  db: Db,
  farmId: string
): Promise<FarmTripFloat[]> => {
  const tagged = await db.query.handover.findMany({
    where: { farmId, float: "out" },
    columns: { buyingTripId: true },
  });
  const tripIds = [
    ...new Set(
      tagged.flatMap((one) => (one.buyingTripId ? [one.buyingTripId] : []))
    ),
  ];
  const floats: FarmTripFloat[] = [];
  for (const tripId of tripIds) {
    // One outing at a time: a handful are ever out.
    // oxlint-disable-next-line no-await-in-loop
    const float = await farmTripFloat(db, farmId, tripId);
    if (float && !float.reconciledAt) {
      floats.push(float);
    }
  }
  return floats.toSorted((a, b) => a.wentOn.getTime() - b.wentOn.getTime());
};

/**
 * The outing a Farm float is handed for: the Farm's own, still open. Refused where a Venture's Buying Float went on it —
 * one outing is paid for by one purse — or where the Farm's float was already counted home.
 */
export const requireOpenFarmTrip = async (
  tx: Tx,
  farmId: string,
  tripId: string
): Promise<void> => {
  const trip = await tx.query.buyingTrip.findFirst({
    where: { id: tripId, farmId },
    columns: { id: true, floatReconciledAt: true },
  });
  if (!trip) {
    throw new ORPCError("NOT_FOUND", { message: "No such outing" });
  }
  if (trip.floatReconciledAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This outing's float was already counted home",
      data: { refusal: "float_already_reconciled" },
    });
  }
  const venturesFloat = await tx.query.ventureMovement.findFirst({
    where: { farmId, kind: "float_out", buyingTripId: tripId },
    columns: { id: true },
  });
  if (venturesFloat) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture's Buying Float went on this outing",
      data: { refusal: "trip_is_another_ventures" },
    });
  }
};

/**
 * Counts a Farm float home: the cash handed out must be what the outing bought of the Farm's own — its animals, their
 * Hasil and its costs — and the cash brought back, to the taka, as a Venture's is; refused over or short with the gap.
 * What was brought back goes from the hand that carried it to the Owner's, and the outing's float is closed.
 */
export const reconcileFarmFloat = async (
  tx: Tx,
  input: {
    farmId: string;
    tripId: string;
    cashBackBdt: number;
    ownerId: string;
    role: RoleName;
    now: Date;
  }
): Promise<void> => {
  await requireOpenFarmTrip(tx, input.farmId, input.tripId);
  const float = await farmTripFloat(tx, input.farmId, input.tripId);
  if (!float) {
    throw new ORPCError("BAD_REQUEST", {
      message: "No float was handed out for this outing",
      data: { refusal: "no_float_on_the_trip" },
    });
  }
  const gapBdt = roundTaka(
    float.handedBdt - float.boughtBdt - float.backBdt - input.cashBackBdt
  );
  if (gapBdt !== 0) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        gapBdt > 0
          ? "More went out than the outing bought and brought back"
          : "The outing bought and brought back more than went out",
      data: {
        refusal: gapBdt > 0 ? "float_short" : "float_over",
        gapBdt: Math.abs(gapBdt),
      },
    });
  }
  if (input.cashBackBdt > 0 && float.carrierId !== input.ownerId) {
    await tx.insert(handover).values({
      id: uuidv7(input.now),
      farmId: input.farmId,
      fromUserId: float.carrierId,
      toUserId: input.ownerId,
      amountBdt: input.cashBackBdt,
      handedAt: input.now,
      reference: null,
      note: null,
      buyingTripId: input.tripId,
      float: "back",
      recordedBy: input.ownerId,
      recordedByRole: input.role,
      recordedAt: input.now,
    });
  }
  await tx
    .update(buyingTrip)
    .set({ floatReconciledAt: input.now, floatReconciledBy: input.ownerId })
    .where(eq(buyingTrip.id, input.tripId));
};

/** One end of a Handover: a person's hand, or the bank. */
export type HandEnd = { userId: string } | { bank: true };

/** A deposit of a Venture's sale cash into its Venture Account, naming the Sales whose notes it carries. */
export interface IntoAVenture {
  ventureId: string;
  saleIds: readonly string[];
}

const userOf = (end: HandEnd): string | null =>
  "userId" in end ? end.userId : null;

/**
 * A Venture's sale cash banked: from the hand that took it at the haat into its Venture Account, with the slip. Each Sale
 * must be that Venture's, held in that hand and not deposited before; the amount is theirs to the taka. Their `sale_in`
 * movements are written now, dated the day it went in and carrying the slip — the account holds what the bank holds.
 */
const depositSaleCash = async (
  tx: Tx,
  input: {
    farmId: string;
    fromUserId: string | null;
    into: IntoAVenture;
    amountBdt: number;
    handedAt: Date;
    reference: string | null;
    note: string | null;
    recordedBy: string;
    recordedByRole: RoleName;
    now: Date;
  }
): Promise<{ id: string }> => {
  if (!input.fromUserId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Venture's sale cash is deposited from the hand that took it",
      data: { refusal: "handover_goes_nowhere" },
    });
  }
  if (!input.reference) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The bank's end of a Handover needs its slip or cheque",
      data: { refusal: "bank_needs_a_slip" },
    });
  }
  // Behind the lock every count of a Venture's money takes: a Sale is deposited once.
  await lockTheFarm(tx, input.farmId);
  const deposited = await tx.query.ventureMovement.findMany({
    where: {
      farmId: input.farmId,
      kind: "sale_in",
      saleId: { in: [...input.into.saleIds] },
    },
    columns: { saleId: true },
  });
  if (deposited.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That Sale's money has been deposited already",
      data: { refusal: "already_deposited" },
    });
  }
  const held = await heldSalesOf(tx, input.farmId, {
    ventureId: input.into.ventureId,
  });
  const carried = input.into.saleIds.map((saleId) =>
    held.find((one) => one.saleId === saleId && one.heldBy === input.fromUserId)
  );
  if (carried.some((one) => one === undefined)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That Sale's cash is not held in this hand for this Venture",
      data: { refusal: "not_held_here" },
    });
  }
  const sales = carried.filter((one) => one !== undefined);
  const totalBdt = roundTaka(sales.reduce((sum, one) => sum + one.bdt, 0));
  if (roundTaka(input.amountBdt) !== totalBdt) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Those Sales come to ${totalBdt}`,
      data: { refusal: "amount_changed", totalBdt },
    });
  }
  const id = uuidv7(input.now);
  await tx.insert(handover).values({
    id,
    farmId: input.farmId,
    fromUserId: input.fromUserId,
    toUserId: null,
    ventureId: input.into.ventureId,
    amountBdt: totalBdt,
    handedAt: input.handedAt,
    reference: input.reference,
    note: input.note,
    recordedBy: input.recordedBy,
    recordedByRole: input.recordedByRole,
    recordedAt: input.now,
  });
  for (const one of sales) {
    // oxlint-disable-next-line no-await-in-loop -- one movement per Sale, as the account reads them
    await tx.insert(ventureMovement).values({
      id: uuidv7(input.now),
      farmId: input.farmId,
      ventureId: one.ventureId,
      kind: "sale_in",
      saleId: one.saleId,
      handoverId: id,
      amountBdt: one.bdt,
      movedOn: farmDayOf(input.handedAt),
      reference: input.reference,
      recordedBy: input.recordedBy,
      createdAt: input.now,
    });
  }
  return { id };
};

/**
 * Cash passed from one hand to another, or to the bank or out of it. Refused from the bank to the bank, from a hand to
 * itself, to a person who holds no cash on this farm, and — the bank being one end — without its slip.
 */
export const recordHandover = async (
  tx: Tx,
  input: {
    farmId: string;
    from: HandEnd;
    to: HandEnd | IntoAVenture;
    amountBdt: number;
    handedAt: Date;
    reference: string | null;
    note: string | null;
    /** The Farm's own outing this cash is the Buying Float for, where it is one. */
    buyingTripId?: string;
    recordedBy: string;
    recordedByRole: RoleName;
    now: Date;
  }
): Promise<{ id: string }> => {
  if ("ventureId" in input.to) {
    return await depositSaleCash(tx, {
      ...input,
      fromUserId: userOf(input.from),
      into: input.to,
    });
  }
  if (input.buyingTripId) {
    await requireOpenFarmTrip(tx, input.farmId, input.buyingTripId);
  }
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
    buyingTripId: input.buyingTripId ?? null,
    float: input.buyingTripId ? "out" : null,
    recordedBy: input.recordedBy,
    recordedByRole: input.recordedByRole,
    recordedAt: input.now,
  });
  return { id };
};

/** A Handover as the trail records it. */
export const readHandover = async (tx: Tx, id: string) =>
  (await tx.query.handover.findFirst({ where: { id } })) ?? null;
