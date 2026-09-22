/* oxlint-disable no-await-in-loop */
import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { feedItem, ration } from "@OpenFarm/db/schema/feed";
import { drugProduct, notifiableDisease } from "@OpenFarm/db/schema/health";
import type { StandardFeedKey, StandardKind } from "@OpenFarm/domain";
import {
  STANDARD_DRUGS,
  STANDARD_FEED_ITEMS,
  STANDARD_NOTIFIABLE_DISEASES,
  STANDARD_RATIONS,
} from "@OpenFarm/domain";

import type { Trail, Tx } from "./audit";
import { publishRationVersion } from "./feed-store";

/** Who is starting the farm with the standard lists, and when. */
interface Starter {
  farmId: string;
  actorId: string;
  roleUsed: RoleName;
  now: Date;
}

/** What the farm was given, by the Bangla names it now has. Empty where it already had them all. */
export interface StandardAdded {
  feedItems: string[];
  rations: string[];
  drugs: string[];
  diseases: string[];
}

/** The Feed Items the Rations name, as well as every one when the Owner asked for the feed store. */
const feedKeysWanted = (kinds: readonly StandardKind[]): StandardFeedKey[] => {
  if (kinds.includes("feed")) {
    return Object.keys(STANDARD_FEED_ITEMS) as StandardFeedKey[];
  }
  if (!kinds.includes("rations")) {
    return [];
  }
  const named = new Set<StandardFeedKey>();
  for (const one of Object.values(STANDARD_RATIONS)) {
    for (const [key] of one.items) {
      named.add(key);
    }
  }
  return [...named];
};

const addFeedItems = async (
  tx: Tx,
  trail: Trail,
  starter: Starter,
  keys: StandardFeedKey[]
): Promise<string[]> => {
  if (keys.length === 0) {
    return [];
  }
  // A name the farm already has — its own, or one it retired — is left as the farm's.
  const added = await tx
    .insert(feedItem)
    .values(
      keys.map((key) => ({
        id: uuidv7(starter.now),
        farmId: starter.farmId,
        nameBn: STANDARD_FEED_ITEMS[key].bn,
        nameEn: STANDARD_FEED_ITEMS[key].en,
        unit: "kg",
        createdBy: starter.actorId,
        createdAt: starter.now,
      }))
    )
    .onConflictDoNothing()
    .returning();
  for (const row of added) {
    await trail(tx, {
      entity: "feed_item",
      entityId: row.id,
      action: "create",
      after: { nameBn: row.nameBn, nameEn: row.nameEn, unit: row.unit },
    });
  }
  return added.map((row) => row.nameBn);
};

const addRations = async (
  tx: Tx,
  trail: Trail,
  starter: Starter
): Promise<string[]> => {
  const items = await tx.query.feedItem.findMany({
    where: { farmId: starter.farmId },
    columns: { id: true, nameBn: true },
  });
  const idOf = (key: StandardFeedKey): string => {
    const found = items.find(
      (item) => item.nameBn === STANDARD_FEED_ITEMS[key].bn
    );
    if (!found) {
      throw new Error(
        `The standard feed ${key} was not added before its Ration`
      );
    }
    return found.id;
  };
  const added: string[] = [];
  for (const one of Object.values(STANDARD_RATIONS)) {
    const [made] = await tx
      .insert(ration)
      .values({
        id: uuidv7(starter.now),
        farmId: starter.farmId,
        nameBn: one.name.bn,
        nameEn: one.name.en,
        createdAt: starter.now,
      })
      .onConflictDoNothing()
      .returning({ id: ration.id });
    if (!made) {
      continue;
    }
    const lines = one.items.map(([key, kg]) => ({
      feedItemId: idOf(key),
      kgPerAnimalPerDay: kg,
    }));
    const number = await publishRationVersion(tx, {
      farmId: starter.farmId,
      rationId: made.id,
      items: lines,
      note: null,
      actorId: starter.actorId,
      roleUsed: starter.roleUsed,
      now: starter.now,
    });
    // The same after as a Ration saved by hand, so its history reads the same.
    await trail(tx, {
      entity: "ration",
      entityId: made.id,
      action: "create",
      after: { name: one.name.bn, number, items: lines },
    });
    added.push(one.name.bn);
  }
  return added;
};

/** On the Drug List without withdrawal days: nothing may prescribe them until the Vet has written the label's. */
const addDrugs = async (
  tx: Tx,
  trail: Trail,
  starter: Starter
): Promise<string[]> => {
  const added = await tx
    .insert(drugProduct)
    .values(
      Object.values(STANDARD_DRUGS).map((name) => ({
        id: uuidv7(starter.now),
        farmId: starter.farmId,
        nameBn: name.bn,
        nameEn: name.en,
        addedBy: starter.actorId,
        addedByRole: starter.roleUsed,
        createdAt: starter.now,
      }))
    )
    .onConflictDoNothing()
    .returning();
  for (const row of added) {
    await trail(tx, {
      entity: "drug_product",
      entityId: row.id,
      action: "create",
      after: {
        nameBn: row.nameBn,
        milkWithdrawalDays: null,
        meatWithdrawalDays: null,
      },
    });
  }
  return added.map((row) => row.nameBn);
};

const addDiseases = async (
  tx: Tx,
  trail: Trail,
  starter: Starter
): Promise<string[]> => {
  const added = await tx
    .insert(notifiableDisease)
    .values(
      STANDARD_NOTIFIABLE_DISEASES.map((name) => ({
        id: uuidv7(starter.now),
        farmId: starter.farmId,
        nameBn: name.bn,
        nameEn: name.en,
        addedBy: starter.actorId,
        addedByRole: starter.roleUsed,
        createdAt: starter.now,
      }))
    )
    .onConflictDoNothing()
    .returning();
  for (const row of added) {
    await trail(tx, {
      entity: "notifiable_disease",
      entityId: row.id,
      action: "create",
      after: { nameBn: row.nameBn, note: null },
    });
  }
  return added.map((row) => row.nameBn);
};

const addStandard = async (
  tx: Tx,
  trail: Trail,
  starter: Starter,
  kinds: readonly StandardKind[]
): Promise<StandardAdded> => {
  const feedItems = await addFeedItems(
    tx,
    trail,
    starter,
    feedKeysWanted(kinds)
  );
  const rations = kinds.includes("rations")
    ? await addRations(tx, trail, starter)
    : [];
  const health = kinds.includes("health");
  return {
    feedItems,
    rations,
    drugs: health ? await addDrugs(tx, trail, starter) : [],
    diseases: health ? await addDiseases(tx, trail, starter) : [],
  };
};

/**
 * Gives the farm the standard lists it asked for and does not have yet, in one transaction, each row with its own
 * Audit Event, as if the Owner had added it by hand. A name the farm already uses is left as the farm's, so starting
 * twice adds nothing — and two starts at once meet on the names' unique indexes rather than making two of anything.
 */
export const startWithStandard = (
  db: Database,
  trail: Trail,
  starter: Starter,
  kinds: readonly StandardKind[]
): Promise<StandardAdded> =>
  db.transaction((tx) => addStandard(tx, trail, starter, kinds));
