import type { Database } from "@OpenFarm/db";
import type { CategoryKey } from "@OpenFarm/db/schema/money";
import type {
  BakiAtTheGate,
  BakiKind,
  BakiOutcome,
  BakiStanding,
} from "@OpenFarm/domain";
import {
  BAKI_KINDS,
  bakiStanding,
  farmDayOf,
  isBakiOverdue,
  isBakiRefusal,
  overdueFrom,
  roundLitres,
  roundTaka,
  soldOnBakiWhileOverdue,
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

/** What a buyer paid there and then, in taka to the poisha. Nothing is a buyer who took it all on Baki. */
export const paidNowInput = z.number().min(0).max(100_000_000);

/** What a buyer owed as it left, or the refusal the reader is told in their own words. */
export const bakiOrRefuse = (outcome: BakiOutcome): BakiAtTheGate => {
  if (isBakiRefusal(outcome)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `The farm will not write that Baki down: ${outcome.refusal}`,
      data: { refusal: outcome.refusal },
    });
  }
  return outcome;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Category a Baki Payment books under: what it paid for. Milk sales for milk, cattle sales for cattle. */
export const CATEGORY_OF_BAKI: Record<BakiKind, CategoryKey> = {
  milk: "dispatch",
  cattle: "sale",
};

/** One Sale or Dispatch a buyer left owing on, as the Baki list names it. */
export interface OwedItem {
  id: string;
  leftOn: string;
  /** A Sale's animal by her tag; a Dispatch by its litres. */
  tagNumber: string | null;
  litres: number | null;
  bakiBdt: number;
  paidBdt: number;
  owingBdt: number;
  /** What stays written off of it once his payments are counted. */
  writtenOffBdt: number;
  promisedBy: string | null;
}

/** One of his payments, and what it cleared. */
export interface PaidItem {
  id: string;
  paidOn: string;
  amountBdt: number;
  note: string | null;
  /** What of each Sale or Dispatch it cleared, oldest first. */
  cleared: readonly { itemId: string; amountBdt: number }[];
}

/** A buyer's Baki of one kind. */
export interface KindStanding extends Omit<BakiStanding, "items" | "parts"> {
  kind: BakiKind;
  items: OwedItem[];
  payments: PaidItem[];
}

/** One buyer who owes the farm, or holds credit with it. */
export interface BuyerBaki {
  counterpartyId: string;
  name: string;
  phone: string | null;
  owingBdt: number;
  /** What stays written off of all he took, and the last day the Owner wrote any off: the sheets carry his mark. */
  writtenOffBdt: number;
  lastWrittenOffOn: string | null;
  /** The day the oldest thing he still owes for left, whichever kind. */
  oldestOn: string | null;
  kinds: KindStanding[];
}

/** A Sale or a Dispatch as the Baki list names it, before any payment is set against it. */
const owedItem = (
  one: { id: string; bakiBdt: number; promisedBy: string | null },
  leftAt: Date,
  label: Pick<OwedItem, "tagNumber" | "litres">,
  /** What the Owner wrote off of it, before any payment puts some back. */
  writtenOffBdt: number
): OwedItem => ({
  id: one.id,
  leftOn: farmDayOf(leftAt),
  ...label,
  bakiBdt: one.bakiBdt,
  paidBdt: 0,
  owingBdt: one.bakiBdt,
  writtenOffBdt,
  promisedBy: one.promisedBy,
});

type Db = Pick<Database, "query"> | Tx;

/** Which part of the book is asked for: one buyer's, the settled too, as at a day's end. */
interface BookAsked {
  counterpartyId?: string;
  settledToo?: boolean;
  /** The farm day to read it as at the end of, for the accountant; left out, today. */
  asOf?: string;
}

/** The four things a Baki book is read from: what was left owing on, what was paid, and what was written off. */
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
        bakiBdt: { gt: 0 },
        ...whose,
        ...(leftBy ? { soldAt: leftBy } : {}),
      },
      columns: {
        id: true,
        soldAt: true,
        bakiBdt: true,
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
        bakiBdt: { gt: 0 },
        ...(only?.counterpartyId ? { buyerId: only.counterpartyId } : {}),
        ...(leftBy ? { dispatchedAt: leftBy } : {}),
      },
      columns: {
        id: true,
        dispatchedAt: true,
        bakiBdt: true,
        promisedBy: true,
        litres: true,
        buyerId: true,
      },
      with: { buyer: { columns: { name: true, phone: true } } },
    }),
    db.query.bakiPayment.findMany({
      where: { farmId, ...whose, ...byThe("paidOn") },
      columns: {
        id: true,
        counterpartyId: true,
        kind: true,
        amountBdt: true,
        paidOn: true,
        note: true,
      },
      with: { buyer: { columns: { name: true, phone: true } } },
    }),
    db.query.bakiWriteOff.findMany({
      where: { farmId, ...whose, ...byThe("writtenOn") },
      columns: {
        sourceId: true,
        counterpartyId: true,
        amountBdt: true,
        writtenOn: true,
      },
    }),
  ]);
  return { sales, dispatches, payments, writeOffs };
};

type Book = Awaited<ReturnType<typeof readBook>>;

/** What was written off of each Sale or Dispatch, and the last day each buyer had any written off. */
const writeOffsOf = (writeOffs: Book["writeOffs"]) => {
  const writtenOff = new Map<string, number>();
  const lastWrittenOff = new Map<string, string>();
  for (const one of writeOffs) {
    writtenOff.set(
      one.sourceId,
      roundTaka((writtenOff.get(one.sourceId) ?? 0) + one.amountBdt)
    );
    const last = lastWrittenOff.get(one.counterpartyId);
    if (one.amountBdt > 0 && (!last || one.writtenOn > last)) {
      lastWrittenOff.set(one.counterpartyId, one.writtenOn);
    }
  }
  return { writtenOff, lastWrittenOff };
};

interface BuyerItems {
  name: string;
  phone: string | null;
  items: Map<BakiKind, OwedItem[]>;
}

/** Everything each buyer was left owing on, by kind, with what was written off of each. */
const itemsByBuyer = (
  { sales, dispatches, payments }: Book,
  writtenOff: ReadonlyMap<string, number>
) => {
  const buyers = new Map<string, BuyerItems>();
  const add = (
    id: string,
    who: { name: string; phone: string | null },
    kind?: BakiKind,
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
        writtenOff.get(one.id) ?? 0
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
        writtenOff.get(one.id) ?? 0
      )
    );
  }
  for (const one of payments) {
    add(one.counterpartyId, one.buyer);
  }
  return buyers;
};

/** One buyer's Baki of one kind as his payments leave it, or nothing when there is nothing to say of it. */
const kindStandingOf = (
  kind: BakiKind,
  items: readonly OwedItem[],
  paid: Book["payments"],
  settledToo: boolean
): KindStanding | null => {
  const standing = bakiStanding(items, paid);
  const settled =
    standing.owingBdt === 0 &&
    standing.creditBdt === 0 &&
    standing.writtenOffBdt === 0;
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
              paidBdt: one.paidBdt,
              owingBdt: one.owingBdt,
              writtenOffBdt: one.writtenOffBdt,
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
        amountBdt: one.amountBdt,
        note: one.note,
        cleared: parts
          .filter((part) => part.paymentId === one.id)
          .map(({ itemId, amountBdt }) => ({ itemId, amountBdt })),
      })),
  };
};

/**
 * Every buyer's Baki on the farm — or one buyer's, when asked — as his payments leave it, oldest first. Only the
 * Farm's own: a Venture's animal never leaves owing. A buyer who owes nothing, holds no credit and has nothing written
 * off is left off, unless the whole book is asked for — the accountant's export reads what an old payment cleared of
 * a debt long since paid.
 */
export const bakiOfBuyers = async (
  db: Db,
  farmId: string,
  only?: BookAsked
): Promise<BuyerBaki[]> => {
  const book = await readBook(db, farmId, only);
  const { payments, writeOffs } = book;
  const { writtenOff, lastWrittenOff } = writeOffsOf(writeOffs);
  const buyers = itemsByBuyer(book, writtenOff);
  const listed = [...buyers.entries()].flatMap(([counterpartyId, who]) => {
    const kinds = BAKI_KINDS.flatMap((kind) => {
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
        owingBdt: roundTaka(kinds.reduce((sum, one) => sum + one.owingBdt, 0)),
        writtenOffBdt: roundTaka(
          kinds.reduce((sum, one) => sum + one.writtenOffBdt, 0)
        ),
        lastWrittenOffOn: lastWrittenOff.get(counterpartyId) ?? null,
        oldestOn: oldest ?? null,
        kinds,
      },
    ];
  });
  // Oldest owing first — the buyer to ring today — and a buyer only holding credit or written off last; the same day
  // by name.
  return listed.toSorted(
    (a, b) =>
      (a.oldestOn ?? "9999").localeCompare(b.oldestOn ?? "9999") ||
      a.name.localeCompare(b.name)
  );
};

/** A Baki Payment as the trail records it: the payment, and the money it booked. */
export const readBakiPayment = async (tx: Tx, id: string) => {
  const row = await tx.query.bakiPayment.findFirst({ where: { id } });
  if (!row) {
    return null;
  }
  const money = await tx.query.moneyEvent.findFirst({
    where: { farmId: row.farmId, source: "baki_payment", sourceId: id },
    columns: { amountBdt: true, paymentMethod: true, approval: true },
  });
  return { ...row, money: money ?? null };
};

/** What one buyer owes of one kind right now, as his payments leave it. */
export const owingOf = async (
  db: Db,
  farmId: string,
  counterpartyId: string,
  kind: BakiKind
): Promise<number> => {
  const [his] = await bakiOfBuyers(db, farmId, { counterpartyId });
  return his?.kinds.find((one) => one.kind === kind)?.owingBdt ?? 0;
};

/**
 * More paid than he owes is taken only with a note saying why — a buyer paying ahead for next week's milk — since
 * without one it is far more likely a figure typed wrong.
 */
export const assertPaidNoMoreThanOwed = ({
  amountBdt,
  owingBdt,
  note,
}: {
  amountBdt: number;
  owingBdt: number;
  note: string | null;
}) => {
  if (amountBdt > owingBdt && !note?.trim()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is more than he owes; say in a note why he paid more",
      data: { refusal: "paid_more_than_owed", owingBdt },
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
  for (const buyer of await bakiOfBuyers(db, farmId)) {
    for (const kind of buyer.kinds) {
      for (const item of kind.items) {
        if (owing.has(item.id)) {
          owing.set(item.id, item.owingBdt);
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
  sale: { id: string; bakiBdt: number } | null | undefined
): Promise<number> => {
  if (!sale || sale.bakiBdt <= 0) {
    return 0;
  }
  const owing = await owingNowOf(db, farmId, [sale.id]);
  return owing.get(sale.id) ?? 0;
};

/** One Baki gone past its day, as the homes and the Digest name it. */
export interface OverdueItem {
  id: string;
  kind: BakiKind;
  leftOn: string;
  promisedBy: string | null;
  owingBdt: number;
  /** The first day it was overdue. */
  overdueFrom: string;
}

/** A buyer with Baki gone past its day. */
export interface OverdueBuyer {
  counterpartyId: string;
  name: string;
  phone: string | null;
  /** What of it is overdue, and what he owes in all. */
  overdueBdt: number;
  owingBdt: number;
  /** The first day any of it was overdue. */
  overdueSince: string;
  /** Sold to on Baki again after something he owed was already overdue: the Owner hears of it. */
  soldAgainWhileOverdue: boolean;
  items: OverdueItem[];
}

/** What of one buyer's Baki is overdue today, or nothing when none is. */
export const overdueOfBuyer = (
  buyer: BuyerBaki,
  today: string,
  bakiDays: number
): OverdueBuyer | null => {
  const items = buyer.kinds.flatMap((standing) =>
    standing.items
      .filter((item) => isBakiOverdue(item, today, bakiDays))
      .map((item) => ({
        id: item.id,
        kind: standing.kind,
        leftOn: item.leftOn,
        promisedBy: item.promisedBy,
        owingBdt: item.owingBdt,
        overdueFrom: overdueFrom(item, bakiDays),
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
    overdueBdt: roundTaka(items.reduce((sum, one) => sum + one.owingBdt, 0)),
    owingBdt: buyer.owingBdt,
    overdueSince: first,
    soldAgainWhileOverdue: buyer.kinds.some((standing) =>
      soldOnBakiWhileOverdue(standing.items, bakiDays)
    ),
    items,
  };
};

/**
 * Every buyer with Baki gone past its day, the longest overdue first — the Manager's calls to make and the Owner's to
 * know of. Past the day he promised, or, with no promise, past the farm's days for it.
 */
export const overdueBaki = async (
  db: Db,
  farm: { id: string; bakiDays: number },
  today: string
): Promise<OverdueBuyer[]> => {
  const book = await bakiOfBuyers(db, farm.id);
  return book
    .flatMap((buyer) => {
      const overdue = overdueOfBuyer(buyer, today, farm.bakiDays);
      return overdue ? [overdue] : [];
    })
    .toSorted(
      (a, b) =>
        a.overdueSince.localeCompare(b.overdueSince) ||
        a.name.localeCompare(b.name)
    );
};

/** One overdue Baki not yet told to everybody who hears of it. */
export interface OverdueToTell {
  item: OverdueItem;
  buyer: Pick<OverdueBuyer, "counterpartyId" | "name">;
}

/**
 * The overdue Baki somebody who hears of it has not been told about yet — each Sale or Dispatch told once, the day it
 * first goes past its day, however many mornings it stays late. Nothing at all asked of the transaction when there is
 * nothing to tell, which is most mornings.
 */
export const overdueToTell = async (
  db: Db,
  farm: { id: string; bakiDays: number },
  today: string
): Promise<OverdueToTell[]> => {
  const overdue = await overdueBaki(db, farm, today);
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
      kind: "baki_overdue",
      entityId: { in: all.map((one) => one.item.id) },
    },
    columns: { entityId: true, userId: true },
  });
  const said = new Set(told.map((row) => `${row.userId}|${row.entityId}`));
  return all.filter(({ item }) =>
    people.some((userId) => !said.has(`${userId}|${item.id}`))
  );
};

/** Raises the notices for these overdue Baki. Who hears them is the Notice's to say. */
export const raiseOverdueBaki = async (
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
        kind: "baki_overdue",
        about: { id: item.id },
        facts: {
          counterpartyId: buyer.counterpartyId,
          buyer: buyer.name,
          owingBdt: item.owingBdt,
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
  const any = await db.query.bakiWriteOff.findFirst({
    where: { farmId },
    columns: { id: true },
  });
  // Most farms have written nothing off, and every costing asks.
  if (!any) {
    return new Map();
  }
  const book = await bakiOfBuyers(db, farmId, { settledToo: true });
  return new Map(
    book.flatMap((buyer) =>
      buyer.kinds.flatMap((kind) =>
        kind.items
          .filter((item) => item.writtenOffBdt > 0)
          .map((item) => [item.id, item.writtenOffBdt] as const)
      )
    )
  );
};

/**
 * What a litre of a Dispatch fetched after all: what the milk came to, less whatever of its Baki stays written off,
 * over its litres. The price itself where nothing was written off — nearly always.
 */
export const fetchedPerLitre = (
  row: {
    id: string;
    litres: string | number;
    pricePerLitreBdt: string | number;
  },
  writtenOff: ReadonlyMap<string, number>
): number => {
  const litres = Number(row.litres);
  const price = Number(row.pricePerLitreBdt);
  const lost = writtenOff.get(row.id) ?? 0;
  return litres > 0 && lost > 0 ? (litres * price - lost) / litres : price;
};

/** A Write-off as the trail records it. */
export const readWriteOff = async (tx: Tx, id: string) =>
  (await tx.query.bakiWriteOff.findFirst({ where: { id } })) ?? null;

/** What is still owing on one Sale or Dispatch now, and whose it is, or nothing where it was never left owing. */
export const owingOnItem = async (
  db: Db,
  farmId: string,
  source: "sale" | "dispatch",
  id: string
): Promise<{ counterpartyId: string; owingBdt: number } | null> => {
  const row =
    source === "sale"
      ? await db.query.sale.findFirst({
          where: { farmId, id },
          columns: { counterpartyId: true, bakiBdt: true },
        })
      : await db.query.dispatch.findFirst({
          where: { farmId, id },
          columns: { buyerId: true, bakiBdt: true },
        });
  if (!row || row.bakiBdt <= 0) {
    return null;
  }
  const counterpartyId =
    "counterpartyId" in row ? row.counterpartyId : row.buyerId;
  const owing = await owingNowOf(db, farmId, [id]);
  return { counterpartyId, owingBdt: owing.get(id) ?? 0 };
};

/** More written off than is still owing is not a write-off: it is money the farm would be saying it lost twice. */
export const assertWrittenOffNoMoreThanOwed = (
  amountBdt: number,
  owingBdt: number
) => {
  if (amountBdt > owingBdt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is more than is still owed on it",
      data: { refusal: "written_off_more_than_owed", owingBdt },
    });
  }
};
