import { uuidv7 } from "@OpenFarm/db/ids";
import type { AlertKind } from "@OpenFarm/db/schema/alert";
import { alert } from "@OpenFarm/db/schema/alert";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";

import type { Tx } from "./audit";

/** One Alert waiting to be raised: what it is about, and what its message needs. */
export interface AlertToRaise {
  kind: AlertKind;
  entity: string;
  entityId: string;
  /** What the message needs, snapshotted so the notice reads as it did when raised. */
  params: Record<string, unknown>;
}

/** Everyone currently holding one of these Roles on the Farm. */
export const holdersOf = async (
  tx: Tx,
  farmId: string,
  roles: readonly RoleName[]
): Promise<string[]> => {
  const rows = await tx.query.roleAssignment.findMany({
    where: { farmId, role: { in: [...roles] }, ...ACTIVE_ROLE },
    columns: { userId: true },
  });
  return [...new Set(rows.map((row) => row.userId))];
};

/**
 * The people a piece of work is actually on. Pinned to someone, or claimed by someone, that
 * is who; otherwise it is whoever holds the Role it was assigned to — because an Instance
 * nobody has picked up is exactly the one that goes late, and telling only the Manager about
 * it leaves the milker who should be doing it in the dark.
 *
 * Staff are scoped to their own Pens: a Pen that is not yours is not your work, and an Alert
 * about it is noise that teaches people to ignore Alerts.
 */
export const peopleOnTheWork = async (
  tx: Tx,
  farmId: string,
  instance: {
    penId: string;
    assignedRole: RoleName;
    assignedTo: string | null;
    claimedBy: string | null;
  }
): Promise<string[]> => {
  const named = instance.claimedBy ?? instance.assignedTo;
  if (named) {
    return [named];
  }
  const holders = await holdersOf(tx, farmId, [instance.assignedRole]);
  if (instance.assignedRole !== "staff") {
    return holders;
  }
  const assignments = await tx.query.penAssignment.findMany({
    where: { farmId, penId: instance.penId, userId: { in: holders } },
    columns: { userId: true },
  });
  return [...new Set(assignments.map((row) => row.userId))];
};

/**
 * Tells these people this thing, once. The unique index on (person, kind, thing) is what
 * makes the sweep safe to run as often as anyone opens the app: raising the same notice
 * again leaves the one already sitting in their list — including the fact that they have
 * already dismissed it, which is not something a second sweep should undo.
 */
export const raiseAlerts = async (
  tx: Tx,
  farmId: string,
  userIds: readonly string[],
  notice: AlertToRaise,
  now: Date
): Promise<{ id: string; userId: string }[]> => {
  const recipients = [...new Set(userIds)].filter(Boolean);
  if (recipients.length === 0) {
    return [];
  }
  const raised = await tx
    .insert(alert)
    .values(
      recipients.map((userId) => ({
        id: uuidv7(now),
        farmId,
        userId,
        kind: notice.kind,
        entity: notice.entity,
        entityId: notice.entityId,
        params: notice.params,
        createdAt: now,
      }))
    )
    .onConflictDoNothing()
    // Only what was actually written. Two sweeps running at once — the phone and the
    // office, which is exactly what this system expects — must not both go on to tell
    // somebody the same thing.
    .returning({ id: alert.id, userId: alert.userId });
  return raised;
};

/**
 * Whoever did the work, for a send-back that has to reach someone. Claimed or pinned says
 * who; failing that, the people who actually recorded a Step — an Instance can be worked
 * without anyone claiming it, and a send-back that told nobody would leave the doer with
 * work reappearing on their list and no reason anywhere they can see.
 */
export const doersOf = async (
  tx: Tx,
  farmId: string,
  instance: {
    id: string;
    penId: string;
    assignedRole: RoleName;
    assignedTo: string | null;
    claimedBy: string | null;
  }
): Promise<string[]> => {
  const named = instance.claimedBy ?? instance.assignedTo;
  if (named) {
    return [named];
  }
  const recorded = await tx.query.stepCompletion.findMany({
    where: { farmId, instanceId: instance.id },
    columns: { recordedBy: true },
  });
  const byHand = [...new Set(recorded.map((row) => row.recordedBy))];
  return byHand.length > 0
    ? byHand
    : await peopleOnTheWork(tx, farmId, instance);
};
