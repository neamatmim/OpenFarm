import { and, eq, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { NoticeFacts } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { tell } from "./notice";

// Telling the Owner of a Request to Join: one Notice per Request, carried by the evening's Digest. It says the Request
// as it stands, however often the Investor changes it, and goes from the Owner's list once there is nothing left to
// answer.

type JoinFacts = NoticeFacts["join_requested"];

/**
 * What the Notice is filed under: the Venture, then the Request. One per Request, through the unique index on the
 * thing a Notice is about — and led by the Venture, so the Owner's list can be asked for one Venture's Requests.
 */
const noticeIdOf = (facts: Pick<JoinFacts, "ventureId" | "requestId">) =>
  `${facts.ventureId}:${facts.requestId}`;

/**
 * Tells the Owner of a Request, or — for one already told of and since changed — makes the Notice say what it says
 * now. A changed Request comes back to the Owner's list if she had put it away, and travels in the next Digest again:
 * "four" she dismissed is not "ten" she has read.
 */
export const tellTheOwnerOfARequest = async (
  tx: Tx,
  farmId: string,
  facts: JoinFacts,
  changed: boolean,
  now: Date
): Promise<void> => {
  const id = noticeIdOf(facts);
  // Nothing to carry out of here: a Request waits for the evening's post, which reads the Notice itself.
  await tell(tx, farmId, { kind: "join_requested", about: { id }, facts }, now);
  if (!changed) {
    return;
  }
  await tx
    .update(alert)
    .set({ params: facts, dismissedAt: null, carriedAt: null })
    .where(
      and(
        eq(alert.farmId, farmId),
        eq(alert.kind, "join_requested"),
        eq(alert.entityId, id)
      )
    );
};

/** Takes the Notice about a Request off the Owner's list: withdrawn before an answer, there is nothing to answer. */
export const settleTheRequestNotice = async (
  tx: Tx,
  farmId: string,
  request: Pick<JoinFacts, "ventureId" | "requestId">,
  now: Date
): Promise<void> => {
  await tx
    .update(alert)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(alert.farmId, farmId),
        eq(alert.kind, "join_requested"),
        eq(alert.entityId, noticeIdOf(request)),
        isNull(alert.dismissedAt)
      )
    );
};
