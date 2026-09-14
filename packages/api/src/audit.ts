import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import type { AuditAction } from "@OpenFarm/db/schema/audit";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import type { RoleName } from "@OpenFarm/db/schema/farm";
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
  /** The row the event is about. A function when the id is only known once `apply` has run
   *  — an upsert keeps the existing row's id, and an event keyed on the id we hoped for
   *  would point at nothing. */
  entityId: string | (() => string);
  action: AuditAction;
  /** Read before `apply` runs. */
  before?: Snapshot;
  /** Read after `apply` runs. */
  after?: Snapshot;
  /** Required for corrections. */
  reason?: string;
  /** The event a correction supersedes. */
  supersedesId?: string;
  /** Device attribution and the phone's own sequence number for an entry that arrived from
   *  an outbox. The id is null on a personal phone, which still has a sequence. */
  device?: { id: string | null; seq: number } | null;
  /** When the actor says it happened; defaults to now. */
  recordedAt?: Date;
  /** The Role this write was actually allowed under, when that is narrower than the Role the
   *  request is acting under. A Correction is permitted by a specific Role's window, and
   *  that is the Role the trail must name. */
  roleUsed?: RoleName;
}

/** A snapshot as it stands on this transaction: read now if it is a reader. */
export const readSnapshot = (
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
  const actorId = context.actor?.id ?? null;
  const { roleUsed } = context;

  /**
   * Writes one Audit Event on a transaction the caller already holds. `write` is the way in
   * for a single change; this is the way in for a batch, where many changes and their events
   * share one transaction (ADR 0002) and opening a transaction each would defeat the point.
   */
  const recordEvent = async (
    tx: Tx,
    event: AuditedWrite,
    {
      before,
      after,
      eventId,
      receivedAt,
    }: {
      before?: SnapshotValue;
      after?: SnapshotValue;
      eventId?: string;
      receivedAt?: Date;
    } = {}
  ): Promise<string> => {
    const at = receivedAt ?? context.clock.now();
    const id = eventId ?? uuidv7(at);
    // The event's own snapshots, unless the caller has already read them. `write` reads
    // them around `apply`; here there is nothing to read around, so whatever the event
    // carries is what happened — and dropping it would leave a trail entry that records
    // that something occurred without recording what.
    const said = before ?? (await readSnapshot(tx, event.before));
    const happened = after ?? (await readSnapshot(tx, event.after));
    await tx.insert(auditEvent).values({
      id,
      farmId,
      entity: event.entity,
      entityId:
        typeof event.entityId === "function"
          ? event.entityId()
          : event.entityId,
      action: event.action,
      actorId,
      roleUsed: event.roleUsed ?? roleUsed,
      deviceId: context.device?.id ?? event.device?.id ?? null,
      deviceSeq: event.device?.seq ?? null,
      recordedAt: event.recordedAt ?? at,
      receivedAt: at,
      before: said,
      after: happened,
      reason: event.reason ?? null,
      supersedesId: event.supersedesId ?? null,
    });
    return id;
  };

  /** `apply` is handed the id the Audit Event will be written under, so a write that has to
   *  point at its own trail entry — a Correction raising a Needs Review — can do it in the
   *  same transaction rather than hoping a second one succeeds. */
  const write = <T>(
    event: AuditedWrite,
    apply: (tx: Tx, eventId: string) => Promise<T>
  ): Promise<T> => {
    if (event.action === "correct" && !event.reason?.trim()) {
      throw new ORPCError("BAD_REQUEST", {
        message: "A correction needs a reason",
      });
    }
    const receivedAt = context.clock.now();
    const eventId = uuidv7(receivedAt);
    return context.db.transaction(async (tx) => {
      const before = await readSnapshot(tx, event.before);
      const result = await apply(tx, eventId);
      const after = await readSnapshot(tx, event.after);
      await recordEvent(tx, event, { before, after, eventId, receivedAt });
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

  return { write, recordEvent, latestEventFor };
};
