import type { Database } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import type { CategoryKey } from "@OpenFarm/db/schema/money";
import type {
  ReceivableAtTheGate,
  ReceivableKind,
  ReceivableOutcome,
  ReceivableStanding,
} from "@OpenFarm/domain";
import {
  RECEIVABLE_KINDS,
  receivableStanding,
  farmDayOf,
  isReceivableOverdue,
  isReceivableRefusal,
  overdueFrom,
  roundLitres,
  roundMoney,
  soldOnCreditWhileOverdue,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";

/** The farm day a buyer promised to pay what he still owed by. */
export { farmDay as promisedByInput } from "./farm-clock";

/** What a buyer paid there and then, in taka to the poisha. Nothing is a buyer who took it all on credit. */
export const paidNowInput = z.number().min(0).max(100_000_000);

/** What a buyer owed as it left, or the refusal the reader is told in their own words. */
export const receivableOrRefuse = (
  outcome: ReceivableOutcome
): ReceivableAtTheGate => {
  if (isReceivableRefusal(outcome)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The farm will not write that Receivable down: ${outcome.refusal}`,
      data: { refusal: outcome.refusal },
    });
  }
  return outcome;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Category a Receivable Payment books under: what it paid for. Milk sales for milk, cattle sales for cattle. */
export const CATEGORY_OF_RECEIVABLE: Record<ReceivableKind, CategoryKey> = {
  milk: "dispatch",
  cattle: "sale",
};

/** One Sale or Dispatch a buyer left owing on, as the Receivable list names it. */
export interface OwedItem {
  id: string;
  leftOn: string;
  /** A Sale's animal by her tag; a Dispatch by its litres. */
  tagNumber: string | null;
  litres: number | null;
  receivableMoney: number;
  paidMoney: number;
  owingMoney: number;
  /** What stays written off of it once his payments are counted. */
  writtenOffMoney: number;
  promisedBy: string | null;
  /** Each time the Owner wrote some of it off, as written — what the Owner puts right, one by one. */
  writeOffs: WriteOffWritten[];
}

/** One Write-off as the Owner wrote it: how much, why and the day. */
export interface WriteOffWritten {
  id: string;
  amountMoney: number;
  reason: string;
  writtenOn: string;
}

/** One of his payments, and what it cleared. */
export interface PaidItem {
  id: string;
  paidOn: string;
  amountMoney: number;
  note: string | null;
  /** What of each Sale or Dispatch it cleared, oldest first. */
  cleared: readonly { itemId: string; amountMoney: number }[];
}

/** A buyer's Receivable of one kind. */
export interface KindStanding extends Omit<
  ReceivableStanding,
  "items" | "parts"
> {
  kind: ReceivableKind;
  items: OwedItem[];
  payments: PaidItem[];
}

/** One buyer who owes the farm, or has paid it ahead. */
export interface BuyerReceivable {
  counterpartyId: string;
  name: string;
  phone: string | null;
  owingMoney: number;
  /** What stays written off of all he took, and the last day the Owner wrote any off: the sheets carry his mark. */
  writtenOffMoney: number;
  lastWrittenOffOn: string | null;
  /** The day the oldest thing he still owes for left, whichever kind. */
  oldestOn: string | null;
  kinds: KindStanding[];
}

/** A Sale or a Dispatch as the Receivable list names it, before any payment is set against it. */
const owedItem = (
  one: { id: string; receivableMoney: number; promisedBy: string | null },
  leftAt: Date,
  label: Pick<OwedItem, "tagNumber" | "litres">,
  /** What the Owner wrote off of it, before any payment puts some back. */
  writtenOffMoney: number,
  writeOffs: WriteOffWritten[]
): OwedItem => ({
  id: one.id,
  leftOn: farmDayOf(leftAt),
  ...label,
  receivableMoney: one.receivableMoney,
  paidMoney: 0,
  owingMoney: one.receivableMoney,
  writtenOffMoney,
  promisedBy: one.promisedBy,
  writeOffs,
});

type Db = Pick<Database, "query"> | Tx;

/** Which part of the book is asked for: one buyer's, the settled too, as at a day's end. */
interface BookAsked {
  counterpartyId?: string;
  settledToo?: boolean;
  /** The farm day to read it as at the end of, for the accountant; left out, today. */
  asOf?: string;
}

/** The four things a Receivable book is read from: what was left owing on, what was paid, and what was written off. */
const readBook = async (
  db: Db,
  farmId: string,
  only: BookAsked | undefined
) => {
  const until = only?.asOf
    ? new Date(startOfFarmDay(only.asOf).getTime() + DAY_MS)
    : undefined;
  const leftBy = until ? { lt: until } : undefined;
  const whose = only?.counterpartyId
    ? { counterpartyId: only.counterpartyId }
    : {};
  const byThe = (column: "paidOn" | "writtenOn") =>
    only?.asOf ? { [column]: { lte: only.asOf } } : {};
  const [sales, dispatches, payments, writeOffs] = await Promise.all([
    db.query.sale.findMany({
      where: {
        farmId,
        receivableMoney: { gt: 0 },
        ...whose,
        ...(leftBy ? { soldAt: leftBy } : {}),
      },
      columns: {
        id: true,
        soldAt: true,
        receivableMoney: true,
        promisedBy: true,
        counterpartyId: true,
      },
      with: {
        animal: { columns: { tagNumber: true } },
        buyer: { columns: { name: true, phone: true } },
      },
    }),
    db.query.dispatch.findMany({
      where: {
        farmId,
        receivableMoney: { gt: 0 },
        ...(only?.counterpartyId ? { buyerId: only.counterpartyId } : {}),
        ...(leftBy ? { dispatchedAt: leftBy } : {}),
      },
      columns: {
        id: true,
        dispatchedAt: true,
        receivableMoney: true,
        promisedBy: true,
        litres: true,
        buyerId: true,
      },
      with: { buyer: { columns: { name: true, phone: true } } },
    }),
    db.query.receivablePayment.findMany({
      where: { farmId, ...whose, ...byThe("paidOn") },
      columns: {
        id: true,
        counterpartyId: true,
        kind: true,
        amountMoney: true,
        paidOn: true,
        note: true,
      },
      with: { buyer: { columns: { name: true, phone: true } } },
    }),
    db.query.receivableWriteOff.findMany({
      where: { farmId, ...whose, ...byThe("writtenOn") },
      columns: {
        id: true,
        sourceId: true,
        counterpartyId: true,
        amountMoney: true,
        reason: true,
        writtenOn: true,
      },
      orderBy: { writtenOn: "asc", id: "asc" },
    }),
  ]);
  return { sales, dispatches, payments, writeOffs };
};

type Book = Awaited<ReturnType<typeof readBook>>;

/** What was written off of each Sale or Dispatch, and the last day each buyer had any written off. */
const writeOffsOf = (writeOffs: Book["writeOffs"]) => {
  const writtenOff = new Map<string, number>();
  const lastWrittenOff = new Map<string, string>();
  const written = new Map<string, WriteOffWritten[]>();
  for (const one of writeOffs) {
    written.set(one.sourceId, [
      ...(written.get(one.sourceId) ?? []),
      {
        id: one.id,
        amountMoney: one.amountMoney,
        reason: one.reason,
        writtenOn: one.writtenOn,
      },
    ]);
    writtenOff.set(
      one.sourceId,
      roundMoney((writtenOff.get(one.sourceId) ?? 0) + one.amountMoney)
    );
    const last = lastWrittenOff.get(one.counterpartyId);
    if (one.amountMoney > 0 && (!last || one.writtenOn > last)) {
      lastWrittenOff.set(one.counterpartyId, one.writtenOn);
    }
  }
  return { writtenOff, lastWrittenOff, written };
};

interface BuyerItems {
  name: string;
  phone: string | null;
  items: Map<ReceivableKind, OwedItem[]>;
}

/** Everything each buyer was left owing on, by kind, with what was written off of each. */
const itemsByBuyer = (
  { sales, dispatches, payments }: Book,
  writtenOff: ReadonlyMap<string, number>,
  written: ReadonlyMap<string, WriteOffWritten[]>
) => {
  const buyers = new Map<string, BuyerItems>();
  const add = (
    id: string,
    who: { name: string; phone: string | null },
    kind?: ReceivableKind,
    item?: OwedItem
  ) => {
    const known = buyers.get(id) ?? { ...who, items: new Map() };
    if (kind && item) {
      known.items.set(kind, [...(known.items.get(kind) ?? []), item]);
    }
    buyers.set(id, known);
  };
  for (const one of sales) {
    add(
      one.counterpartyId,
      one.buyer,
      "cattle",
      owedItem(
        one,
        one.soldAt,
        { tagNumber: one.animal.tagNumber, litres: null },
        writtenOff.get(one.id) ?? 0,
        written.get(one.id) ?? []
      )
    );
  }
  for (const one of dispatches) {
    add(
      one.buyerId,
      one.buyer,
      "milk",
      owedItem(
        one,
        one.dispatchedAt,
        { tagNumber: null, litres: roundLitres(Number(one.litres)) },
        writtenOff.get(one.id) ?? 0,
        written.get(one.id) ?? []
      )
    );
  }
  for (const one of payments) {
    add(one.counterpartyId, one.buyer);
  }
  return buyers;
};

/** One buyer's Receivable of one kind as his payments leave it, or nothing when there is nothing to say of it. */
const kindStandingOf = (
  kind: ReceivableKind,
  items: readonly OwedItem[],
  paid: Book["payments"],
  settledToo: boolean
): KindStanding | null => {
  const standing = receivableStanding(items, paid);
  const settled =
    standing.owingMoney === 0 &&
    standing.paidAheadMoney === 0 &&
    standing.writtenOffMoney === 0;
  if (settled && !(settledToo && paid.length > 0)) {
    return null;
  }
  const byId = new Map(items.map((one) => [one.id, one]));
  const { parts, items: stood, ...totals } = standing;
  return {
    ...totals,
    kind,
    items: stood.flatMap((one) => {
      const shown = byId.get(one.id);
      return shown
        ? [
            {
              ...shown,
              paidMoney: one.paidMoney,
              owingMoney: one.owingMoney,
              writtenOffMoney: one.writtenOffMoney,
            },
          ]
        : [];
    }),
    payments: paid
      .toSorted(
        (a, b) => a.paidOn.localeCompare(b.paidOn) || a.id.localeCompare(b.id)
      )
      .map((one) => ({
        id: one.id,
        paidOn: one.paidOn,
        amountMoney: one.amountMoney,
        note: one.note,
        cleared: parts
          .filter((part) => part.paymentId === one.id)
          .map(({ itemId, amountMoney }) => ({ itemId, amountMoney })),
      })),
  };
};

/**
 * Every buyer's Receivable on the farm — or one buyer's, when asked — as his payments leave it, oldest first. Only the
 * Farm's own: a Venture's animal never leaves owing. A buyer who owes nothing, has paid nothing ahead and has nothing written
 * off is left off, unless the whole book is asked for — the accountant's export reads what an old payment cleared of
 * a debt long since paid.
 */
export const receivableOfBuyers = async (
  db: Db,
  farmId: string,
  only?: BookAsked
): Promise<BuyerReceivable[]> => {
  const book = await readBook(db, farmId, only);
  const { payments, writeOffs } = book;
  const { writtenOff, lastWrittenOff, written } = writeOffsOf(writeOffs);
  const buyers = itemsByBuyer(book, writtenOff, written);
  const listed = [...buyers.entries()].flatMap(([counterpartyId, who]) => {
    const kinds = RECEIVABLE_KINDS.flatMap((kind) => {
      const paid = payments.filter(
        (one) => one.counterpartyId === counterpartyId && one.kind === kind
      );
      const standing = kindStandingOf(
        kind,
        who.items.get(kind) ?? [],
        paid,
        only?.settledToo ?? false
      );
      return standing ? [standing] : [];
    });
    if (kinds.length === 0) {
      return [];
    }
    const [oldest] = kinds
      .map((one) => one.oldestOn)
      .filter((one) => one !== null)
      .toSorted();
    return [
      {
        counterpartyId,
        name: who.name,
        phone: who.phone,
        owingMoney: roundMoney(
          kinds.reduce((sum, one) => sum + one.owingMoney, 0)
        ),
        writtenOffMoney: roundMoney(
          kinds.reduce((sum, one) => sum + one.writtenOffMoney, 0)
        ),
        lastWrittenOffOn: lastWrittenOff.get(counterpartyId) ?? null,
        oldestOn: oldest ?? null,
        kinds,
      },
    ];
  });
  // Oldest owing first — the buyer to ring today — and a buyer who has only paid ahead or been written off last; the same day
  // by name.
  return listed.toSorted(
    (a, b) =>
      (a.oldestOn ?? "9999").localeCompare(b.oldestOn ?? "9999") ||
      a.name.localeCompare(b.name)
  );
};

/** A Receivable Payment as the trail records it: the payment, and the money it booked. */
export const readReceivablePayment = async (tx: Tx, id: string) => {
  const row = await tx.query.receivablePayment.findFirst({ where: { id } });
  if (!row) {
    return null;
  }
  const money = await tx.query.moneyEvent.findFirst({
    where: { farmId: row.farmId, source: "receivable_payment", sourceId: id },
    columns: {
      amountMoney: true,
      paymentMethod: true,
      approval: true,
      heldBy: true,
      farmAccountId: true,
      reference: true,
    },
  });
  return { ...row, money: money ?? null };
};

/** What one buyer owes of one kind right now, as his payments leave it. */
export const owingOf = async (
  db: Db,
  farmId: string,
  counterpartyId: string,
  kind: ReceivableKind
): Promise<number> => {
  const [his] = await receivableOfBuyers(db, farmId, { counterpartyId });
  return his?.kinds.find((one) => one.kind === kind)?.owingMoney ?? 0;
};

/**
 * More paid than he owes is taken only with a note saying why — a buyer paying ahead for next week's milk — since
 * without one it is far more likely a figure typed wrong.
 */
export const assertPaidNoMoreThanOwed = ({
  amountMoney,
  owingMoney,
  note,
}: {
  amountMoney: number;
  owingMoney: number;
  note: string | null;
}) => {
  if (amountMoney > owingMoney && !note?.trim()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is more than he owes; say in a note why he paid more",
      data: { refusal: "paid_more_than_owed", owingMoney },
    });
  }
};

/**
 * What is still owed today on each of these Sales or Dispatches, as the buyers' payments have left them — so a list
 * that says "still owed" beside a Sale says what is owed now, not what was owed when she left. One read of the whole
 * book, which is a few dozen rows on a farm this size.
 */
export const owingNowOf = async (
  db: Db,
  farmId: string,
  ids: readonly string[]
): Promise<Map<string, number>> => {
  const owing = new Map(ids.map((id) => [id, 0]));
  if (ids.length === 0) {
    return owing;
  }
  for (const buyer of await receivableOfBuyers(db, farmId)) {
    for (const kind of buyer.kinds) {
      for (const item of kind.items) {
        if (owing.has(item.id)) {
          owing.set(item.id, item.owingMoney);
        }
      }
    }
  }
  return owing;
};

/** What her buyer still owes on her today — nothing for a Sale paid in full, and nothing asked of the farm then. */
export const owingOnHerSale = async (
  db: Db,
  farmId: string,
  sale: { id: string; receivableMoney: number } | null | undefined
): Promise<number> => {
  if (!sale || sale.receivableMoney <= 0) {
    return 0;
  }
  const owing = await owingNowOf(db, farmId, [sale.id]);
  return owing.get(sale.id) ?? 0;
};

/** One Receivable gone past its day, as the homes and the Digest name it. */
export interface OverdueItem {
  id: string;
  kind: ReceivableKind;
  leftOn: string;
  promisedBy: string | null;
  owingMoney: number;
  /** The first day it was overdue. */
  overdueFrom: string;
}

/** A buyer with Receivable gone past its day. */
export interface OverdueBuyer {
  counterpartyId: string;
  name: string;
  phone: string | null;
  /** What of it is overdue, and what he owes in all. */
  overdueMoney: number;
  owingMoney: number;
  /** The first day any of it was overdue. */
  overdueSince: string;
  /** Sold to on credit again after something he owed was already overdue: the Owner hears of it. */
  soldAgainWhileOverdue: boolean;
  items: OverdueItem[];
}

/** What of one buyer's Receivable is overdue today, or nothing when none is. */
export const overdueOfBuyer = (
  buyer: BuyerReceivable,
  today: string,
  receivableDays: number
): OverdueBuyer | null => {
  const items = buyer.kinds.flatMap((standing) =>
    standing.items
      .filter((item) => isReceivableOverdue(item, today, receivableDays))
      .map((item) => ({
        id: item.id,
        kind: standing.kind,
        leftOn: item.leftOn,
        promisedBy: item.promisedBy,
        owingMoney: item.owingMoney,
        overdueFrom: overdueFrom(item, receivableDays),
      }))
  );
  const [first] = items.map((one) => one.overdueFrom).toSorted();
  if (first === undefined) {
    return null;
  }
  return {
    counterpartyId: buyer.counterpartyId,
    name: buyer.name,
    phone: buyer.phone,
    overdueMoney: roundMoney(
      items.reduce((sum, one) => sum + one.owingMoney, 0)
    ),
    owingMoney: buyer.owingMoney,
    overdueSince: first,
    // Whichever kind was late and whichever was lent again: his milk overdue and a bull sold him on credit is the farm
    // lending more to somebody who has not paid what is late, as two bulls are.
    soldAgainWhileOverdue: soldOnCreditWhileOverdue(
      buyer.kinds.flatMap((standing) => standing.items),
      receivableDays
    ),
    items,
  };
};

/**
 * Every buyer with Receivable gone past its day, the longest overdue first — the Manager's calls to make and the Owner's to
 * know of. Past the day he promised, or, with no promise, past the farm's days for it.
 */
export const overdueReceivable = async (
  db: Db,
  farm: { id: string; receivableDays: number },
  today: string
): Promise<OverdueBuyer[]> => {
  const book = await receivableOfBuyers(db, farm.id);
  return book
    .flatMap((buyer) => {
      const overdue = overdueOfBuyer(buyer, today, farm.receivableDays);
      return overdue ? [overdue] : [];
    })
    .toSorted(
      (a, b) =>
        a.overdueSince.localeCompare(b.overdueSince) ||
        a.name.localeCompare(b.name)
    );
};

/** One overdue Receivable not yet told to everybody who hears of it. */
export interface OverdueToTell {
  item: OverdueItem;
  buyer: Pick<OverdueBuyer, "counterpartyId" | "name">;
}

/** What an overdue Receivable is told under: the Sale or Dispatch and the day it went past — a promise moved later is a
 *  new day to keep, and told again when that one goes by too. */
const overdueKey = (item: Pick<OverdueItem, "id" | "overdueFrom">) =>
  `${item.id}@${item.overdueFrom}`;

/**
 * The overdue Receivable somebody who hears of it has not been told about yet — each Sale or Dispatch told once for each
 * day it goes past, however many mornings it stays late. Nothing at all asked of the transaction when there is nothing
 * to tell, which is most mornings.
 */
export const overdueToTell = async (
  db: Db,
  farm: { id: string; receivableDays: number },
  today: string
): Promise<OverdueToTell[]> => {
  const overdue = await overdueReceivable(db, farm, today);
  const all = overdue.flatMap((buyer) =>
    buyer.items.map((item) => ({ item, buyer }))
  );
  if (all.length === 0) {
    return [];
  }
  const people = await holdersOf(db as Tx, farm.id, ["owner", "manager"]);
  const told = await db.query.alert.findMany({
    where: {
      farmId: farm.id,
      kind: "receivable_overdue",
      entityId: { in: all.map((one) => overdueKey(one.item)) },
    },
    columns: { entityId: true, userId: true },
  });
  const said = new Set(told.map((row) => `${row.userId}|${row.entityId}`));
  return all.filter(({ item }) =>
    people.some((userId) => !said.has(`${userId}|${overdueKey(item)}`))
  );
};

/**
 * Tells the Owner of credit lent to a buyer the farm once wrote off — the sheet warned whoever sold to him, and the
 * lending is done, so it is told rather than refused (the Owner, 2026-10-07). Nothing for one who paid in full, nor for
 * one never written off.
 */
export const tellIfLentAfterWriteOff = async (
  tx: Tx,
  farmId: string,
  item: { id: string; counterpartyId: string; receivableMoney: number },
  now: Date
) => {
  if (item.receivableMoney <= 0) {
    return;
  }
  const writtenOff = await tx.query.receivableWriteOff.findFirst({
    where: { farmId, counterpartyId: item.counterpartyId },
    columns: { id: true },
  });
  if (!writtenOff) {
    return;
  }
  const [his] = await receivableOfBuyers(tx, farmId, {
    counterpartyId: item.counterpartyId,
    settledToo: true,
  });
  if (!(his?.lastWrittenOffOn && his.writtenOffMoney > 0)) {
    return;
  }
  await tell(
    tx,
    farmId,
    {
      kind: "credit_after_write_off",
      about: { id: item.id },
      facts: {
        counterpartyId: item.counterpartyId,
        buyer: his.name,
        lentMoney: item.receivableMoney,
        writtenOffMoney: his.writtenOffMoney,
        writtenOffOn: his.lastWrittenOffOn,
      },
    },
    now
  );
};

/** Raises the notices for these overdue Receivable. Who hears them is the Notice's to say. */
export const raiseOverdueReceivable = async (
  tx: Tx,
  farmId: string,
  untold: readonly OverdueToTell[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  const remembering = rememberingPeople();
  for (const { item, buyer } of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "receivable_overdue",
        about: { id: overdueKey(item) },
        facts: {
          counterpartyId: buyer.counterpartyId,
          buyer: buyer.name,
          owingMoney: item.owingMoney,
          overdueFrom: item.overdueFrom,
        },
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};

/**
 * What stays written off of each Sale and Dispatch, as the buyers' payments have left it: what the animal or the milk
 * did not fetch after all. Read by every sum of what she fetched, from one place, so Margin and Return on Cost — and
 * what a litre fetched — cannot disagree about a written-off buyer.
 */
export const writtenOffByItem = async (
  db: Db,
  farmId: string
): Promise<Map<string, number>> => {
  const any = await db.query.receivableWriteOff.findFirst({
    where: { farmId },
    columns: { id: true },
  });
  // Most farms have written nothing off, and every costing asks.
  if (!any) {
    return new Map();
  }
  const book = await receivableOfBuyers(db, farmId, { settledToo: true });
  return new Map(
    book.flatMap((buyer) =>
      buyer.kinds.flatMap((kind) =>
        kind.items
          .filter((item) => item.writtenOffMoney > 0)
          .map((item) => [item.id, item.writtenOffMoney] as const)
      )
    )
  );
};

/**
 * What a litre of a Dispatch fetched after all: what the milk came to, less whatever of its Receivable stays written off,
 * over its litres. The price itself where nothing was written off — nearly always.
 */
export const fetchedPerLitre = (
  row: {
    id: string;
    litres: string | number;
    pricePerLitreMoney: string | number;
  },
  writtenOff: ReadonlyMap<string, number>
): number => {
  const litres = Number(row.litres);
  const price = Number(row.pricePerLitreMoney);
  const lost = writtenOff.get(row.id) ?? 0;
  return litres > 0 && lost > 0 ? (litres * price - lost) / litres : price;
};

/** A Write-off as the trail records it. */
export const readWriteOff = async (tx: Tx, id: string) =>
  (await tx.query.receivableWriteOff.findFirst({ where: { id } })) ?? null;

/** What is still owing on one Sale or Dispatch now, and whose it is, or nothing where it was never left owing. */
export const owingOnItem = async (
  db: Db,
  farmId: string,
  source: "sale" | "dispatch",
  id: string
): Promise<{ counterpartyId: string; owingMoney: number } | null> => {
  const row =
    source === "sale"
      ? await db.query.sale.findFirst({
          where: { farmId, id },
          columns: { counterpartyId: true, receivableMoney: true },
        })
      : await db.query.dispatch.findFirst({
          where: { farmId, id },
          columns: { buyerId: true, receivableMoney: true },
        });
  if (!row || row.receivableMoney <= 0) {
    return null;
  }
  const counterpartyId =
    "counterpartyId" in row ? row.counterpartyId : row.buyerId;
  const owing = await owingNowOf(db, farmId, [id]);
  return { counterpartyId, owingMoney: owing.get(id) ?? 0 };
};

/** Held while a buyer's Receivable is read and then added to — a payment, a write-off, or either put right — so two phones
 *  at once each see the other's. */
export const lockTheBuyer = async (tx: Tx, counterpartyId: string) => {
  await tx.execute(
    sql`select 1 from counterparty where id = ${counterpartyId} for update`
  );
};

/** What a buyer's payments have cleared of one Sale or Dispatch of his, oldest first: nothing where none has. */
export const paidOnItem = async (
  db: Db,
  farmId: string,
  counterpartyId: string,
  id: string
): Promise<number> => {
  const [his] = await receivableOfBuyers(db, farmId, {
    counterpartyId,
    settledToo: true,
  });
  for (const kind of his?.kinds ?? []) {
    const item = kind.items.find((one) => one.id === id);
    if (item) {
      return item.paidMoney;
    }
  }
  return 0;
};

/**
 * A Sale or Dispatch put right to leave its buyer owing less than his payments have already cleared of it is refused:
 * the same taka would be counted twice — once at the gate, once as his payment — and the rest shown as paid ahead. It is
 * the payment that is wrong, and it is the payment that is put right (the Owner, 2026-10-07).
 */
export const assertOwedCoversPaid = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  item: { id: string; counterpartyId: string },
  receivableMoney: number
) => {
  const paidMoney = await paidOnItem(tx, farmId, item.counterpartyId, item.id);
  if (receivableMoney < paidMoney) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "His payments have already cleared more of it than would be owed: put the payment right instead",
      data: { refusal: "owed_below_paid", paidMoney },
    });
  }
};

/**
 * A Sale or Dispatch moved to another buyer once anything was paid or written off on it is refused: his payments and
 * the write-off are his, and moving the debt alone would leave the new buyer chased for money already paid and the old
 * one shown paid ahead (the Owner, 2026-10-07). The payment or the write-off is put right first.
 */
export const assertNothingStandsAgainst = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  item: { id: string; counterpartyId: string }
) => {
  const writtenOff = await tx.query.receivableWriteOff.findFirst({
    where: { farmId, sourceId: item.id },
    columns: { id: true },
  });
  const paidMoney = writtenOff
    ? 0
    : await paidOnItem(tx, farmId, item.counterpartyId, item.id);
  if (writtenOff || paidMoney > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "His payments or a write-off stand against it: put those right before naming another buyer",
      data: { refusal: "paid_on_by_this_buyer" },
    });
  }
};

/**
 * A Sale or Dispatch put right to leave its buyer owing less than the farm wrote off on it is refused: the write-off
 * would be money he never owed, and the milk or the animal would have fetched less than nothing. The Owner lowers the
 * write-off first — a Correction of its own — and then puts the price right.
 */
export const assertOwedCoversWrittenOff = async (
  tx: Pick<Tx, "query">,
  source: "sale" | "dispatch",
  id: string,
  receivableMoney: number
) => {
  const writeOffs = await tx.query.receivableWriteOff.findMany({
    where: { source, sourceId: id },
    columns: { amountMoney: true },
  });
  const writtenOffMoney = writeOffs.reduce(
    (sum, one) => sum + Number(one.amountMoney),
    0
  );
  if (receivableMoney < writtenOffMoney) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "More is written off on it than would be owed: lower the write-off first",
      data: { refusal: "owed_below_written_off", writtenOffMoney },
    });
  }
};

/** More written off than is still owing is not a write-off: it is money the farm would be saying it lost twice. */
export const assertWrittenOffNoMoreThanOwed = (
  amountMoney: number,
  owingMoney: number
) => {
  if (amountMoney > owingMoney) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is more than is still owed on it",
      data: { refusal: "written_off_more_than_owed", owingMoney },
    });
  }
};
