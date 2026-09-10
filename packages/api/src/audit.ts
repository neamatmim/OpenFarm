import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import type { AuditAction } from "@OpenFarm/db/schema/audit";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { ORPCError } from "@orpc/server";

import type { Context } from "./context";

/** A transaction handle for the domain write. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A snapshot is a JSON-able value, or a function that reads it inside the same
 *  transaction — the only way to get a `before` that cannot lie. */
type SnapshotValue = Record<string, unknown> | null;
type SnapshotReader = (tx: Tx) => Promise<SnapshotValue>;
type Snapshot = SnapshotValue | SnapshotReader;

export interface AuditedWrite {
  entity: string;
  entityId: string;
  action: AuditAction;
  /** Read before `apply` runs. */
  before?: Snapshot;
  /** Read after `apply` runs. */
  after?: Snapshot;
  /** Required for corrections. */
  reason?: string;
  /** The event a correction supersedes. */
  supersedesId?: string;
  /** Device attribution for entries captured on a Shed Phone (a later ticket). */
  device?: { id: string; seq: number } | null;
  /** When the actor says it happened; defaults to now. */
  recordedAt?: Date;
}

const resolve = (
  tx: Tx,
  snapshot: Snapshot | undefined
): Promise<SnapshotValue> =>
  typeof snapshot === "function"
    ? snapshot(tx)
    : Promise.resolve(snapshot ?? null);

/**
 * The one way to change state. Runs `apply` and inserts the Audit Event in the same
 * transaction: if either fails, neither happens. Throwing inside `apply` (e.g. NOT_FOUND
 * when nothing matched) rolls everything back, audit row included.
 *
 * `farmId` defaults to the request's Farm; the few writes before a Farm exists pass
 * null (or, for bootstrap, the id they are about to create).
 */
export const audited = (
  context: Context,
  farmId: string | null = context.farm?.id ?? null
) => {
  const actorId = context.session?.user.id ?? null;
  const { roleUsed } = context;

  const write = <T>(
    event: AuditedWrite,
    apply: (tx: Tx) => Promise<T>
  ): Promise<T> => {
    if (event.action === "correct" && !event.reason?.trim()) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A correction needs a reason",
      });
    }
    const receivedAt = context.clock.now();
    return context.db.transaction(async (tx) => {
      const before = await resolve(tx, event.before);
      const result = await apply(tx);
      const after = await resolve(tx, event.after);
      await tx.insert(auditEvent).values({
        id: uuidv7(receivedAt),
        farmId,
        entity: event.entity,
        entityId: event.entityId,
        action: event.action,
        actorId,
        roleUsed,
        deviceId: event.device?.id ?? null,
        deviceSeq: event.device?.seq ?? null,
        recordedAt: event.recordedAt ?? receivedAt,
        receivedAt,
        before: before ?? null,
        after: after ?? null,
        reason: event.reason ?? null,
        supersedesId: event.supersedesId ?? null,
      });
      return result;
    });
  };

  /** The most recent Audit Event for an entity — what a Correction supersedes. */
  const latestEventFor = (
    tx: Tx | Database,
    entity: string,
    entityId: string
  ) =>
    tx.query.auditEvent.findFirst({
      where: { entity, entityId, farmId: farmId ?? undefined },
      // ids are UUIDv7: time-ordered, so they break ties within a millisecond
      orderBy: { receivedAt: "desc", id: "desc" },
      columns: { id: true, after: true },
    });

  return { write, latestEventFor };
};
