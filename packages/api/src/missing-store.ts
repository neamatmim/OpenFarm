import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNotNull, isNull } from "@OpenFarm/db/operators";
import { missing } from "@OpenFarm/db/schema/missing";
import type { AnimalState } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { chargedOf, economicsOfAnimal, farmCosts } from "./cost-store";
import { isOnTheFarm } from "./instances-store";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";

// The farm's Missing: an Animal the round looked for and could not find. Opened by the round's "Animal not found",
// told once to the Owner and the Manager, listed on both homes and on her page until the Manager marks her Found.

type Db = Pick<Database, "query"> | Tx;

/**
 * Opens a Missing for her, from the round's Step that could not find her, or by hand once the Manager has walked a Pen
 * that did not count right — or leaves the one already open alone, so a second morning that cannot find her either is
 * the same Missing, told once.
 */
export const openMissing = async (
  tx: Tx,
  input: {
    farmId: string;
    animalId: string;
    /** The round's Step that could not find her; nothing when the Manager marks her by hand. */
    completionId: string | null;
    since: Date;
    now: Date;
  }
): Promise<{ id: string; opened: boolean }> => {
  const open = await tx.query.missing.findFirst({
    where: {
      animalId: input.animalId,
      foundAt: { isNull: true },
      writtenOffAt: { isNull: true },
    },
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
 * later corrected to say. Nor one the Owner has written off: that is her decision, with a Venture's money made good on
 * it, and only Found brings her back.
 */
export const takeBackMissingOpenedBy = async (
  tx: Tx,
  completionId: string
): Promise<void> => {
  await tx
    .delete(missing)
    .where(
      and(
        eq(missing.completionId, completionId),
        isNull(missing.foundAt),
        isNull(missing.writtenOffAt)
      )
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
    where: {
      farmId,
      foundAt: { isNull: true },
      writtenOffAt: { isNull: true },
    },
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

/** The Missing not yet found, as her page shows it — open, or written off as Lost; nothing when the farm knows where
 *  she is. */
export const missingOf = async (db: Db, animalId: string) =>
  (await db.query.missing.findFirst({
    where: { animalId, foundAt: { isNull: true } },
    columns: {
      id: true,
      since: true,
      writtenOffAt: true,
      lostCause: true,
      stolen: true,
      gdNumber: true,
      stateBefore: true,
      stateChangedBefore: true,
      expectedCalvingBefore: true,
      expectedCalvingServiceBefore: true,
    },
    with: { pen: { columns: { name: true } } },
    orderBy: { since: "desc" },
  })) ?? null;

/**
 * Found: she is where she should be after all. The Manager's while she is only missing; once written off as Lost,
 * the Owner's, who wrote her off — and she comes back into the herd in the State she left it from. Refused when nothing
 * is open for her.
 */
export const markFound = async (
  tx: Tx,
  input: {
    farmId: string;
    animalId: string;
    by: string;
    now: Date;
    /** Whether the Missing read was written off: found only as it was read. A write-off landing between the read
     *  and this once had its Missing stamped found with her left Lost — and no Found could bring her back. */
    writtenOff: boolean;
  }
): Promise<{ id: string }> => {
  const [found] = await tx
    .update(missing)
    .set({ foundAt: input.now, foundBy: input.by })
    .where(
      and(
        eq(missing.farmId, input.farmId),
        eq(missing.animalId, input.animalId),
        isNull(missing.foundAt),
        input.writtenOff
          ? isNotNull(missing.writtenOffAt)
          : isNull(missing.writtenOffAt)
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

/** Why an animal is written off as Lost, in the Owner's words. */
export interface WriteOff {
  cause: string;
  stolen: boolean;
  /** The thana's General Diary number: asked for a theft (the Owner, 2026-09-29). */
  gdNumber: string | null;
}

/**
 * The Owner's write-off: a Missing closed as Lost, with why, and the State she was in, so that one found after all can
 * come back as she was. Only on a Missing still open — one written off already, or found, is refused.
 */
export const markWrittenOff = async (
  tx: Tx,
  input: {
    farmId: string;
    animalId: string;
    by: string;
    now: Date;
    was: {
      state: AnimalState;
      stateChangedAt: Date;
      expectedCalvingAt: Date | null;
      expectedCalvingServiceId: string | null;
    };
    why: WriteOff;
  }
): Promise<{ id: string; since: Date }> => {
  const [written] = await tx
    .update(missing)
    .set({
      writtenOffAt: input.now,
      writtenOffBy: input.by,
      lostCause: input.why.cause,
      stolen: input.why.stolen,
      gdNumber: input.why.gdNumber,
      stateBefore: input.was.state,
      stateChangedBefore: input.was.stateChangedAt,
      expectedCalvingBefore: input.was.expectedCalvingAt,
      expectedCalvingServiceBefore: input.was.expectedCalvingServiceId,
    })
    .where(
      and(
        eq(missing.farmId, input.farmId),
        eq(missing.animalId, input.animalId),
        isNull(missing.foundAt),
        isNull(missing.writtenOffAt)
      )
    )
    .returning({ id: missing.id, since: missing.since });
  if (!written) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only an animal the farm cannot find can be written off",
      data: { refusal: "not_missing" },
    });
  }
  return written;
};

/** Every animal written off as Lost and never found, and when she went: what the returns count as gone with nothing
 *  back. */
export const lostSince = async (
  db: Db,
  farmId: string
): Promise<Map<string, Date>> => {
  const rows = await db.query.missing.findMany({
    where: {
      farmId,
      writtenOffAt: { isNotNull: true },
      foundAt: { isNull: true },
    },
    columns: { animalId: true, since: true },
  });
  return new Map(rows.map((row) => [row.animalId, row.since]));
};

/** The Missing as the trail records it, before and after a Found or a write-off. */
export const readMissing = async (tx: Tx, animalId: string) =>
  (await tx.query.missing.findFirst({
    where: { animalId },
    columns: {
      id: true,
      since: true,
      foundAt: true,
      foundBy: true,
      writtenOffAt: true,
      writtenOffBy: true,
      lostCause: true,
      stolen: true,
      gdNumber: true,
      stateBefore: true,
    },
    orderBy: { since: "desc" },
  })) ?? null;

/** A year back from now, as the Owner's home reads the farm's losses over it. */
const A_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The animals written off as Lost that went missing in the last year and were never found, and what they had cost
 * the farm — bought, fed, dosed and kept — as her price against her cost counts it. Worked from the farm's whole
 * costing only when there is one to cost.
 */
export const lostInAYear = async (
  db: Database,
  farmId: string,
  now: Date
): Promise<{ count: number; costMoney: number }> => {
  const rows = await db.query.missing.findMany({
    where: {
      farmId,
      writtenOffAt: { isNotNull: true },
      foundAt: { isNull: true },
      since: { gte: new Date(now.getTime() - A_YEAR_MS) },
    },
    columns: { animalId: true },
  });
  if (rows.length === 0) {
    return { count: 0, costMoney: 0 };
  }
  const costs = await farmCosts(db, farmId);
  const gone = new Set(rows.map((row) => row.animalId));
  let costMoney = 0;
  for (const her of costs.animals) {
    if (gone.has(her.id)) {
      const economics = economicsOfAnimal(costs, her);
      costMoney += (economics.purchaseMoney ?? 0) + chargedOf(economics);
    }
  }
  return { count: rows.length, costMoney: Math.round(costMoney) };
};
