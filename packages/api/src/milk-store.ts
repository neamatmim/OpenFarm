import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, sql } from "@OpenFarm/db/operators";
import { milkRecord, milkingSession } from "@OpenFarm/db/schema/milk";
import type { MilkDestination, Reconciliation } from "@OpenFarm/domain";
import {
  LITRE_DECIMALS,
  destinationFor,
  reconcile,
  roundLitres,
  milkHeldAt,
  MILK_USUAL_DAYS,
  milkDropOf,
} from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { milkHoldsOf } from "./health-store";

/** Litres live in a numeric column and come back as a string; they are money-like, so they
 *  are converted at the edge rather than left to drift as floats in the middle. */
export const litresOf = (value: string | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);
const asLitres = (value: number): string =>
  roundLitres(value).toFixed(LITRE_DECIMALS);

/** What a Milking Session is opened from: the Instance it belongs to. */
export interface SessionKey {
  id: string;
  farmId: string;
  penId: string;
  dueAt: Date;
}

/** The Milking Session for an Instance, created the first time an effect needs one. The
 *  unique index on the Instance makes this idempotent however often the phone replays. */
export const ensureSession = async (
  tx: Tx,
  instance: SessionKey,
  now: Date
): Promise<string> => {
  const [row] = await tx
    .insert(milkingSession)
    .values({
      id: uuidv7(now),
      farmId: instance.farmId,
      instanceId: instance.id,
      penId: instance.penId,
      dueAt: instance.dueAt,
      createdAt: now,
    })
    // The Session already exists on every entry after the first; updating the Pen to what it
    // already is is how the existing row's id comes back.
    .onConflictDoUpdate({
      target: milkingSession.instanceId,
      set: { penId: instance.penId },
    })
    .returning({ id: milkingSession.id });
  if (!row) {
    throw new Error("could not open a milking session");
  }
  return row.id;
};

/** What the Session's per-cow records destined for Bulk add up to, right now. */
export const sumBulkLitres = async (
  tx: Tx,
  sessionId: string
): Promise<number> => {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${milkRecord.litres}), 0)` })
    .from(milkRecord)
    .where(
      and(
        eq(milkRecord.sessionId, sessionId),
        eq(milkRecord.destination, "bulk")
      )
    );
  return litresOf(row?.total);
};

/**
 * The Lactation a milking drawn at a moment belongs to: her current one, from the day it began; else the one her last
 * recorded calving before it started — a phone that sends a milking only after she has calved again; else none the farm
 * can name, rather than the wrong one.
 */
const lactationAt = async (
  tx: Pick<Tx, "query">,
  animalId: string,
  her: { lactationNumber: number | null; lactationStartedAt: Date | null },
  at: Date
): Promise<number | null> => {
  if (!her.lactationStartedAt || at >= her.lactationStartedAt) {
    return her.lactationNumber;
  }
  const before = await tx.query.calving.findFirst({
    where: { damId: animalId, calvedAt: { lte: at } },
    columns: { lactationNumber: true },
    orderBy: { calvedAt: "desc", id: "desc" },
  });
  return before?.lactationNumber ?? null;
};

/**
 * Writes the litres one cow gave. Keyed on the Step Completion, so replaying the entry — or
 * correcting it — replaces the record rather than adding a second one. The Destination is
 * re-decided here from the cow's Withdrawal: the phone's answer was worked out from its last
 * sync and may be stale.
 */
export const writeMilkRecord = async (
  tx: Tx,
  entry: {
    farmId: string;
    sessionId: string;
    completionId: string;
    animalId: string;
    litres: number;
    requested: MilkDestination;
    recordedBy: string;
    recordedAt: Date;
    now: Date;
  }
): Promise<{ destination: MilkDestination; forced: boolean }> => {
  const beast = await tx.query.animal.findFirst({
    where: { id: entry.animalId },
    columns: {
      milkWithdrawalUntil: true,
      lactationNumber: true,
      lactationStartedAt: true,
    },
  });
  if (!beast) {
    throw new Error(`no animal ${entry.animalId}`);
  }
  // The Gate is a hard block, so it is asked at whichever of the two clocks still holds it
  // shut. The phone's clock alone would let a device running fast — or one sending a made-up
  // time — walk a treated cow's milk into the tank; the server's clock alone would let milk
  // drawn under a Withdrawal through if the phone only reached signal after it ended.
  const gateAt = new Date(
    Math.min(entry.recordedAt.getTime(), entry.now.getTime())
  );
  // And asked of the Withdrawal as it stood then: a dose given after the milking does not reach back.
  const holds = await milkHoldsOf(tx, entry.farmId, entry.animalId);
  const underWithdrawal = milkHeldAt(beast, holds, gateAt);
  const { destination, forced } = destinationFor(
    entry.requested,
    underWithdrawal
  );
  const values = {
    farmId: entry.farmId,
    sessionId: entry.sessionId,
    animalId: entry.animalId,
    litres: asLitres(entry.litres),
    destination,
    forced,
    underWithdrawal,
    recordedBy: entry.recordedBy,
    recordedAt: entry.recordedAt,
  };
  await tx
    .insert(milkRecord)
    .values({
      id: uuidv7(entry.now),
      completionId: entry.completionId,
      ...values,
      lactationNumber: await lactationAt(
        tx,
        entry.animalId,
        beast,
        entry.recordedAt
      ),
    })
    // Put right, she keeps the Lactation she was first written in: a Correction changes her litres, not the milking
    // she gave them at, and a cow who has calved since is in another Lactation now.
    .onConflictDoUpdate({ target: milkRecord.completionId, set: values });
  return { destination, forced };
};

/** A cow recorded and then skipped has no litres to her name: the derived record goes, and
 *  the Audit Event keeps the history of both entries. */
export const removeMilkRecord = (tx: Tx, completionId: string) =>
  tx.delete(milkRecord).where(eq(milkRecord.completionId, completionId));

/**
 * Stores the tank reading against what the cows account for. Called again whenever a cow's
 * entry changes after the total was taken, so a correction cannot leave a stale difference
 * standing. The tolerance in force is stored with it, so the flag stays explicable after the
 * farm parameter is changed.
 */
export const reconcileSession = async (
  tx: Tx,
  sessionId: string,
  bulkLitres: number,
  tolerancePercent: number,
  now: Date
): Promise<Reconciliation> => {
  const sum = await sumBulkLitres(tx, sessionId);
  const result = reconcile(bulkLitres, sum, tolerancePercent);
  await tx
    .update(milkingSession)
    .set({
      bulkLitres: asLitres(bulkLitres),
      sumBulkLitres: asLitres(result.sumBulkLitres),
      differenceLitres: asLitres(result.differenceLitres),
      tolerancePercent,
      flaggedAt: result.flagged ? now : null,
    })
    .where(eq(milkingSession.id, sessionId));
  return result;
};

/** Re-runs the reconciliation after a per-cow entry changed, but only once the tank reading
 *  exists — before that there is nothing to compare against. */
export const reReconcile = async (
  tx: Tx,
  sessionId: string,
  tolerancePercent: number,
  now: Date
): Promise<void> => {
  const session = await tx.query.milkingSession.findFirst({
    where: { id: sessionId },
    columns: { bulkLitres: true },
  });
  if (!session?.bulkLitres) {
    return;
  }
  await reconcileSession(
    tx,
    sessionId,
    litresOf(session.bulkLitres),
    tolerancePercent,
    now
  );
};

const DAY_MS_DROP = 24 * 60 * 60 * 1000;

/**
 * Cows in milk giving well under their own week, the furthest under first: for the Manager's queue and the Milk page.
 * Read only once a cow is past her calf's days and has a week of her own behind that, so the first days of a lactation
 * are never measured against nothing.
 */
export const milkDropsOn = async (
  db: Pick<Database, "query">,
  farm: {
    id: string;
    milkDropPercent: number;
    milkDropDays: number;
    cullCalfMilkDays: number;
  },
  now: Date
) => {
  const readFrom = new Date(
    now.getTime() - (farm.milkDropDays + MILK_USUAL_DAYS) * DAY_MS_DROP
  );
  const sessions = await db.query.milkingSession.findMany({
    where: { farmId: farm.id, dueAt: { gte: readFrom, lt: now } },
    columns: { dueAt: true },
    with: { records: { columns: { animalId: true, litres: true } } },
  });
  const byCow = new Map<string, { at: Date; litres: number }[]>();
  for (const session of sessions) {
    for (const one of session.records) {
      const hers = byCow.get(one.animalId) ?? [];
      hers.push({ at: session.dueAt, litres: Number(one.litres) });
      byCow.set(one.animalId, hers);
    }
  }
  if (byCow.size === 0) {
    return [];
  }
  const readable = new Date(
    now.getTime() -
      (farm.cullCalfMilkDays + MILK_USUAL_DAYS + farm.milkDropDays) *
        DAY_MS_DROP
  );
  const cows = await db.query.animal.findMany({
    where: {
      farmId: farm.id,
      id: { in: [...byCow.keys()] },
      state: "milking",
      lactationStartedAt: { lte: readable },
    },
    columns: { id: true, tagNumber: true, lactationStartedAt: true },
    with: { pen: { columns: { name: true } } },
  });
  return cows
    .flatMap((her) => {
      const drop = milkDropOf(byCow.get(her.id) ?? [], now, farm);
      return drop
        ? [
            {
              animalId: her.id,
              tag: her.tagNumber,
              penName: her.pen.name,
              daysInMilk: her.lactationStartedAt
                ? Math.floor(
                    (now.getTime() - her.lactationStartedAt.getTime()) /
                      DAY_MS_DROP
                  )
                : null,
              ...drop,
            },
          ]
        : [];
    })
    .toSorted(
      (a, b) => b.dropPercent - a.dropPercent || a.tag.localeCompare(b.tag)
    );
};
