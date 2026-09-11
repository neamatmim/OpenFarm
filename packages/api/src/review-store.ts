import { uuidv7 } from "@OpenFarm/db/ids";
import type { ReviewReason } from "@OpenFarm/db/schema/review";
import { needsReview } from "@OpenFarm/db/schema/review";

import { holdersOf, raiseAlerts } from "./alerts-store";
import type { Tx } from "./audit";

/**
 * Puts something in front of the Manager. Raised by the system when a Correction changes
 * something it cannot put right on its own — figures a checker has already signed off, or,
 * as later increments add them, an effect that cannot be walked back: a calf already
 * created, an animal already sold.
 *
 * The Manager is told as well as listed: a queue nobody is pointed at is a queue nobody
 * reads.
 */
export const raiseNeedsReview = async (
  tx: Tx,
  farmId: string,
  entry: {
    entity: string;
    entityId: string;
    reason: ReviewReason;
    auditEventId: string;
    /** What the message should say, in the reader's language. */
    params: Record<string, unknown>;
  },
  now: Date
): Promise<string> => {
  const id = uuidv7(now);
  await tx.insert(needsReview).values({
    id,
    farmId,
    entity: entry.entity,
    entityId: entry.entityId,
    reason: entry.reason,
    auditEventId: entry.auditEventId,
    raisedAt: now,
  });
  const managers = await holdersOf(tx, farmId, ["owner", "manager"]);
  await raiseAlerts(
    tx,
    farmId,
    managers,
    {
      kind: "needs_review",
      entity: entry.entity,
      entityId: entry.entityId,
      params: { ...entry.params, reason: entry.reason },
    },
    now
  );
  return id;
};
