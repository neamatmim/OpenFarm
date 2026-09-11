import { uuidv7 } from "@OpenFarm/db/ids";
import type { AlertKind } from "@OpenFarm/db/schema/alert";
import { alert } from "@OpenFarm/db/schema/alert";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";

import type { Tx } from "./audit";

export interface Notice {
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
 * Tells these people this thing, once. The unique index on (person, kind, thing) is what
 * makes the sweep safe to run as often as anyone opens the app: raising the same notice
 * again leaves the one already sitting in their list — including the fact that they have
 * already dismissed it, which is not something a second sweep should undo.
 */
export const raiseAlerts = async (
  tx: Tx,
  farmId: string,
  userIds: readonly string[],
  notice: Notice,
  now: Date
): Promise<number> => {
  const recipients = [...new Set(userIds)].filter(Boolean);
  if (recipients.length === 0) {
    return 0;
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
    .returning({ id: alert.id });
  return raised.length;
};
