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
  isBakiRefusal,
  roundLitres,
  roundTaka,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";

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
  /** The day the oldest thing he still owes for left, whichever kind. */
  oldestOn: string | null;
  kinds: KindStanding[];
}

/** A Sale or a Dispatch as the Baki list names it, before any payment is set against it. */
const owedItem = (
  one: { id: string; bakiBdt: number; promisedBy: string | null },
  leftAt: Date,
  label: Pick<OwedItem, "tagNumber" | "litres">
): OwedItem => ({
  id: one.id,
  leftOn: farmDayOf(leftAt),
  ...label,
  bakiBdt: one.bakiBdt,
  paidBdt: 0,
  owingBdt: one.bakiBdt,
  promisedBy: one.promisedBy,
});

type Db = Pick<Database, "query"> | Tx;

/**
 * Every buyer's Baki on the farm — or one buyer's, when asked — as his payments leave it, oldest first. Only the
 * Farm's own: a Venture's animal never leaves owing. A buyer who owes nothing and holds no credit is left off, unless
 * the whole book is asked for — the accountant's export reads what an old payment cleared of a debt long since paid.
 */
export const bakiOfBuyers = async (
  db: Db,
  farmId: string,
  only?: {
    counterpartyId?: string;
    settledToo?: boolean;
    /** The farm day to read it as at the end of, for the accountant; left out, today. */
    asOf?: string;
  }
): Promise<BuyerBaki[]> => {
  const until = only?.asOf
    ? new Date(startOfFarmDay(only.asOf).getTime() + DAY_MS)
    : undefined;
  const leftBy = until ? { lt: until } : undefined;
  const whose = only?.counterpartyId
    ? { counterpartyId: only.counterpartyId }
    : {};
  const settledToo = only?.settledToo ?? false;
  const [sales, dispatches, payments] = await Promise.all([
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
      where: {
        farmId,
        ...whose,
        ...(only?.asOf ? { paidOn: { lte: only.asOf } } : {}),
      },
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
  ]);
  const buyers = new Map<
    string,
    { name: string; phone: string | null; items: Map<BakiKind, OwedItem[]> }
  >();
  const buyer = (id: string, who: { name: string; phone: string | null }) => {
    const known = buyers.get(id) ?? { ...who, items: new Map() };
    buyers.set(id, known);
    return known;
  };
  for (const one of sales) {
    const who = buyer(one.counterpartyId, one.buyer);
    who.items.set("cattle", [
      ...(who.items.get("cattle") ?? []),
      owedItem(one, one.soldAt, {
        tagNumber: one.animal.tagNumber,
        litres: null,
      }),
    ]);
  }
  for (const one of dispatches) {
    const who = buyer(one.buyerId, one.buyer);
    who.items.set("milk", [
      ...(who.items.get("milk") ?? []),
      owedItem(one, one.dispatchedAt, {
        tagNumber: null,
        litres: roundLitres(Number(one.litres)),
      }),
    ]);
  }
  for (const one of payments) {
    buyer(one.counterpartyId, one.buyer);
  }
  const listed = [...buyers.entries()].flatMap(([counterpartyId, who]) => {
    const kinds = BAKI_KINDS.flatMap((kind) => {
      const items = who.items.get(kind) ?? [];
      const paid = payments.filter(
        (one) => one.counterpartyId === counterpartyId && one.kind === kind
      );
      const standing = bakiStanding(items, paid);
      const settled = standing.owingBdt === 0 && standing.creditBdt === 0;
      if (settled && !(settledToo && paid.length > 0)) {
        return [];
      }
      const byId = new Map(items.map((one) => [one.id, one]));
      const { parts, items: stood, ...totals } = standing;
      return [
        {
          ...totals,
          kind,
          items: stood.flatMap((one) => {
            const shown = byId.get(one.id);
            return shown
              ? [{ ...shown, paidBdt: one.paidBdt, owingBdt: one.owingBdt }]
              : [];
          }),
          payments: paid
            .toSorted(
              (a, b) =>
                a.paidOn.localeCompare(b.paidOn) || a.id.localeCompare(b.id)
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
        },
      ];
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
        oldestOn: oldest ?? null,
        kinds,
      },
    ];
  });
  // Oldest owing first — the buyer to ring today — and a buyer only holding credit last; the same day by name.
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
