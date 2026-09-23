import type { Database } from "@OpenFarm/db";
import type { NoticeFacts } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import { medicineStockOf } from "./medicine-stock";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";
import { stockOnHand } from "./stock-store";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** One thing the store has to say: which kind of notice, what it is about, and what it carries. */
export type StoreNotice =
  | { kind: "lot_expiring"; id: string; facts: NoticeFacts["lot_expiring"] }
  | { kind: "lot_expired"; id: string; facts: NoticeFacts["lot_expired"] }
  | {
      kind: "medicine_low_stock";
      id: string;
      facts: NoticeFacts["medicine_low_stock"];
    };

/** One Lot of either kind, as the store holds it now. */
interface HeldLot {
  what: "medicine" | "feed";
  lotId: string;
  itemId: string;
  name: string;
  unit: string | null;
  lotNumber: string | null;
  expiresOn: string | null;
  left: number;
}

/**
 * Everything the store has to say today: every Lot with something left in it that is within the farm's warning of
 * its last day, or past it; and every product under the level set for it.
 *
 * A Lot is told about once as it nears its day and once when it passes it — each is keyed on the Lot, and a kind is
 * told once per thing. A product running low is keyed on the latest purchase of it, so one restocked and run down
 * again is news again, as a Feed Item's is.
 */
export const whatTheStoreHasToSay = async (
  db: Pick<Database, "query" | "execute">,
  farm: { id: string; expiryWarnDays: number },
  now: Date
): Promise<StoreNotice[]> => {
  const today = farmDayOf(now);
  const warnFrom = farmDayOf(
    new Date(now.getTime() + farm.expiryWarnDays * ONE_DAY_MS)
  );
  // Asked first whether there can be anything to say at all: a Lot anywhere near its day, or a product somebody
  // watches. Every sweep calls this — everyone opening the app does — and on a farm with neither it should cost three
  // small queries, not the whole store worked out.
  const [nearMedicine, nearFeed, watched] = await Promise.all([
    db.query.medicinePurchase.findFirst({
      where: { farmId: farm.id, expiresOn: { lte: warnFrom } },
      columns: { id: true },
    }),
    db.query.feedIn.findFirst({
      where: { farmId: farm.id, expiresOn: { lte: warnFrom } },
      columns: { id: true },
    }),
    db.query.drugProduct.findFirst({
      where: {
        farmId: farm.id,
        lowStockAt: { isNotNull: true },
        retiredAt: { isNull: true },
      },
      columns: { id: true },
    }),
  ]);
  if (!(nearMedicine || nearFeed || watched)) {
    return [];
  }
  const [products, medicine, feed, latestBuys] = await Promise.all([
    db.query.drugProduct.findMany({
      where: { farmId: farm.id },
      columns: { id: true, nameBn: true, lowStockAt: true, retiredAt: true },
    }),
    medicineStockOf(db, farm.id),
    stockOnHand(db, farm.id),
    db.query.medicinePurchase.findMany({
      where: { farmId: farm.id },
      columns: { id: true, drugProductId: true },
      orderBy: { purchasedOn: "desc", id: "desc" },
    }),
  ]);
  const held: HeldLot[] = [
    ...products.flatMap((product) =>
      (medicine.get(product.id)?.lots ?? []).map((lot) => ({
        what: "medicine" as const,
        lotId: lot.purchaseId,
        itemId: product.id,
        name: product.nameBn,
        unit: null,
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn,
        left: lot.left,
      }))
    ),
    ...feed.flatMap((line) =>
      line.lots.map((lot) => ({
        what: "feed" as const,
        lotId: lot.arrivalId,
        itemId: line.feedItemId,
        name: line.nameBn,
        unit: line.unit,
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn,
        left: lot.left,
      }))
    ),
  ];
  const lots = held.flatMap((lot): StoreNotice[] => {
    if (lot.left <= 0 || !lot.expiresOn) {
      return [];
    }
    const facts = {
      what: lot.what,
      itemId: lot.itemId,
      name: lot.name,
      unit: lot.unit,
      lotNumber: lot.lotNumber,
      expiresOn: lot.expiresOn,
      left: lot.left,
    };
    // The farm's own days, which sort as text. Expired is the day after its last.
    const pastIt = lot.expiresOn < today;
    const withinTheWarning = lot.expiresOn <= warnFrom;
    if (pastIt) {
      return [{ kind: "lot_expired", id: `lot:${lot.lotId}`, facts }];
    }
    return withinTheWarning
      ? [{ kind: "lot_expiring", id: `lot:${lot.lotId}`, facts }]
      : [];
  });
  const latestOf = new Map<string, string>();
  for (const one of latestBuys) {
    if (!latestOf.has(one.drugProductId)) {
      latestOf.set(one.drugProductId, one.id);
    }
  }
  const low = products.flatMap((product): StoreNotice[] => {
    const onHand = medicine.get(product.id)?.onHand ?? 0;
    const under =
      product.lowStockAt !== null &&
      product.retiredAt === null &&
      onHand < product.lowStockAt;
    return under && product.lowStockAt !== null
      ? [
          {
            kind: "medicine_low_stock",
            id: `${product.id}:${latestOf.get(product.id) ?? "none"}`,
            facts: {
              productId: product.id,
              name: product.nameBn,
              onHand,
              threshold: product.lowStockAt,
            },
          },
        ]
      : [];
  });
  return [...lots, ...low];
};

/**
 * Of what the store has to say, what some Manager has yet to hear. Asked before any transaction is opened: a sweep
 * with nothing new to say is not an event, and a farm with no Manager has nobody to tell.
 */
export const storeNoticesUntold = async (
  db: Pick<Database, "query"> | Tx,
  farmId: string,
  said: StoreNotice[]
): Promise<StoreNotice[]> => {
  const managers = await holdersOf(db as Tx, farmId, ["manager"]);
  if (said.length === 0 || managers.length === 0) {
    return [];
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId,
      kind: { in: [...new Set(said.map((one) => one.kind))] },
      entityId: { in: said.map((one) => one.id) },
    },
    columns: { kind: true, entityId: true, userId: true },
  });
  const heard = new Set(
    told.map((row) => `${row.userId}|${row.kind}|${row.entityId}`)
  );
  return said.filter((one) =>
    managers.some((userId) => !heard.has(`${userId}|${one.kind}|${one.id}`))
  );
};

/** One thing the store has to say, told: each kind with its own facts, so neither can be passed as the other. */
const tellOne = (
  tx: Tx,
  farmId: string,
  one: StoreNotice,
  now: Date,
  remembering: ReturnType<typeof rememberingPeople>
) => {
  const about = { id: one.id };
  switch (one.kind) {
    case "lot_expiring": {
      return tell(
        tx,
        farmId,
        { kind: one.kind, about, facts: one.facts },
        now,
        remembering
      );
    }
    case "lot_expired": {
      return tell(
        tx,
        farmId,
        { kind: one.kind, about, facts: one.facts },
        now,
        remembering
      );
    }
    case "medicine_low_stock": {
      return tell(
        tx,
        farmId,
        { kind: one.kind, about, facts: one.facts },
        now,
        remembering
      );
    }
    default: {
      return Promise.resolve([]);
    }
  }
};

/** Tells the Managers what the store has to say. Who hears each kind is the Notice's to decide. */
export const raiseStoreNotices = async (
  tx: Tx,
  farmId: string,
  untold: StoreNotice[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  const remembering = rememberingPeople();
  for (const one of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tellOne(tx, farmId, one, now, remembering);
    raised.push(...rows);
  }
  return raised;
};
