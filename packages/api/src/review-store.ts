import { uuidv7 } from "@OpenFarm/db/ids";
import type { ReviewReason } from "@OpenFarm/db/schema/review";
import { needsReview } from "@OpenFarm/db/schema/review";

import type { Tx } from "./audit";

/**
 * Writes down that the farm owes somebody's judgement: a Correction changed something it could not put right on its
 * own — figures a checker had signed off, an Effect the farm has moved past — or an Entry arrived that no longer fits
 * the world it was made in.
 *
 * The row alone. Telling the Manager it is there is the Notice's business, and the two happen in one act (see
 * `tell`): a queue nobody is pointed at is a queue nobody reads.
 */
export const writeTheJudgementOwed = async (
  tx: Tx,
  farmId: string,
  owed: {
    entity: string;
    entityId: string;
    reason: ReviewReason;
    /** The Correction or Entry that raised it, so the trail reads from either end. */
    auditEventId: string;
  },
  now: Date
): Promise<void> => {
  await tx.insert(needsReview).values({
    id: uuidv7(now),
    farmId,
    entity: owed.entity,
    entityId: owed.entityId,
    reason: owed.reason,
    auditEventId: owed.auditEventId,
    raisedAt: now,
  });
};
