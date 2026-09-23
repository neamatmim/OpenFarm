import type { Database } from "@OpenFarm/db";
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

/**
 * Each thing waiting for the Manager, with the work it came from where it came from a Step: the entry a Correction
 * changed or a phone sent late names its completion, and the completion names its work — so a row reaches the work
 * rather than dropping somebody on a list to search. Looked up for exactly these rows, however old they are.
 */
export const withTheirWork = async <
  Row extends { entity: string; entityId: string },
>(
  db: Pick<Database, "query">,
  farmId: string,
  rows: readonly Row[]
): Promise<(Row & { instanceId: string | null })[]> => {
  // A Correction names the completion it changed; a phone's late entry is named by its own id, which is the
  // completion's too. Either way the id is looked up as a completion's.
  const completionIds = rows.flatMap((row) =>
    row.entity === "sop_instance" ? [] : [row.entityId]
  );
  const found =
    completionIds.length === 0
      ? []
      : await db.query.stepCompletion.findMany({
          where: { farmId, id: { in: completionIds } },
          columns: { id: true, instanceId: true },
        });
  const workOf = new Map(found.map((one) => [one.id, one.instanceId] as const));
  return rows.map((row) => ({
    ...row,
    // Work the day turned past is raised on the work itself.
    instanceId:
      row.entity === "sop_instance"
        ? row.entityId
        : (workOf.get(row.entityId) ?? null),
  }));
};
