import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { missing } from "@OpenFarm/db/schema/missing";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { isOnTheFarm } from "./instances-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";

// The farm's Missing: an Animal the round looked for and could not find. Opened by the round's "Animal not found",
// told once to the Owner and the Manager, listed on both homes and on her page until the Manager marks her Found.

type Db = Pick<Database, "query"> | Tx;

/**
 * Opens a Missing for her, from the round's Step that could not find her — or leaves the one already open alone, so a
 * second morning that cannot find her either is the same Missing, told once.
 */
export const openMissing = async (
  tx: Tx,
  input: {
    farmId: string;
    animalId: string;
    completionId: string;
    since: Date;
    now: Date;
  }
): Promise<{ id: string; opened: boolean }> => {
  const open = await tx.query.missing.findFirst({
    where: { animalId: input.animalId, foundAt: { isNull: true } },
    columns: { id: true },
  });
  if (open) {
    return { id: open.id, opened: false };
  }
  const her = await tx.query.animal.findFirst({
    where: { id: input.animalId, farmId: input.farmId },
    columns: { penId: true },
  });
  if (!her) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  const id = uuidv7(input.now);
  await tx.insert(missing).values({
    id,
    farmId: input.farmId,
    animalId: input.animalId,
    penId: her.penId,
    completionId: input.completionId,
    since: input.since,
    recordedAt: input.now,
  });
  return { id, opened: true };
};

/**
 * Takes back a Missing this Step opened, when the Step is put right to say she was there after all. Only one still
 * open: once the Manager has found her, that she went missing and was found is what happened, whatever the round is
 * later corrected to say.
 */
export const takeBackMissingOpenedBy = async (
  tx: Tx,
  completionId: string
): Promise<void> => {
  await tx
    .delete(missing)
    .where(
      and(eq(missing.completionId, completionId), isNull(missing.foundAt))
    );
};

/** One animal the farm cannot find, as the homes, her page and the notice name her. */
export interface MissingAnimal {
  id: string;
  animalId: string;
  tag: string;
  penName: string;
  since: Date;
}

/**
 * Every animal the farm cannot find now, the longest missing first. Only animals still on the farm: one the round
 * could not find because she had already been sold, and whose Sale was written down after, is not missing.
 */
export const missingNow = async (
  db: Db,
  farmId: string
): Promise<MissingAnimal[]> => {
  const open = await db.query.missing.findMany({
    where: { farmId, foundAt: { isNull: true } },
    columns: { id: true, animalId: true, since: true },
    with: {
      animal: { columns: { tagNumber: true, state: true } },
      pen: { columns: { name: true } },
    },
    orderBy: { since: "asc" },
  });
  return open
    .filter((row) => isOnTheFarm(row.animal))
    .map((row) => ({
      id: row.id,
      animalId: row.animalId,
      tag: row.animal.tagNumber,
      penName: row.pen.name,
      since: row.since,
    }));
};

/** The animals missing now that nobody has been told about yet. */
export const missingToTell = async (
  db: Db,
  farmId: string
): Promise<MissingAnimal[]> => {
  const open = await missingNow(db, farmId);
  if (open.length === 0) {
    return [];
  }
  const told = await db.query.alert.findMany({
    where: {
      farmId,
      kind: "animal_missing",
      entityId: { in: open.map((one) => one.id) },
    },
    columns: { entityId: true },
  });
  const said = new Set(told.map((row) => row.entityId));
  return open.filter((one) => !said.has(one.id));
};

/** Tells the Owner and the Manager of each animal the round could not find. Who hears it is the Notice's to say. */
export const tellOfMissing = async (
  tx: Tx,
  farmId: string,
  untold: readonly MissingAnimal[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  const remembering = rememberingPeople();
  for (const one of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "animal_missing",
        about: { id: one.id },
        facts: { tag: one.tag, pen: one.penName, since: farmDayOf(one.since) },
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};

/** The Missing open for her, as her page shows it; nothing when the farm knows where she is. */
export const missingOf = async (db: Db, animalId: string) =>
  (await db.query.missing.findFirst({
    where: { animalId, foundAt: { isNull: true } },
    columns: { id: true, since: true },
    with: { pen: { columns: { name: true } } },
  })) ?? null;

/** The Manager's Found: she is where she should be after all. Refused when nothing is open for her. */
export const markFound = async (
  tx: Tx,
  input: { farmId: string; animalId: string; by: string; now: Date }
): Promise<{ id: string }> => {
  const [found] = await tx
    .update(missing)
    .set({ foundAt: input.now, foundBy: input.by })
    .where(
      and(
        eq(missing.farmId, input.farmId),
        eq(missing.animalId, input.animalId),
        isNull(missing.foundAt)
      )
    )
    .returning({ id: missing.id });
  if (!found) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That animal is not missing",
      data: { refusal: "not_missing" },
    });
  }
  return found;
};

/** The Missing as the trail records it, before and after a Found. */
export const readMissing = async (tx: Tx, animalId: string) =>
  (await tx.query.missing.findFirst({
    where: { animalId },
    columns: { id: true, since: true, foundAt: true, foundBy: true },
    orderBy: { since: "desc" },
  })) ?? null;
