import type { Database } from "@OpenFarm/db";
import type { SopContent } from "@OpenFarm/domain";

import { triggerKey } from "./instances-store";
import { contentOf } from "./sop-content";

/** How many of a procedure's Versions are looked back over for how long a trigger has been in force. */
const VERSIONS_LOOKED_BACK = 12;

/**
 * For each trigger of a procedure's newest Version, when it first came into force without a break: the publishing of
 * the oldest Version in the unbroken run, newest first, that carries the same trigger.
 */
const inForceSinceByTrigger = (
  versions: readonly { number: number; content: unknown; publishedAt: Date }[]
): Map<string, Date> => {
  const since = new Map<string, Date>();
  const [newest, ...before] = versions;
  if (!newest) {
    return since;
  }
  for (const trigger of contentOf(newest).triggers) {
    const key = triggerKey(trigger);
    let from = newest.publishedAt;
    for (const older of before) {
      if (!contentOf(older).triggers.some((one) => triggerKey(one) === key)) {
        break;
      }
      from = older.publishedAt;
    }
    since.set(key, from);
  }
  return since;
};

/** A procedure in force, as the work it raises reads it. */
export interface SopInForce {
  definitionId: string;
  versionId: string;
  content: SopContent;
  /** When the Version in force was published, or the procedure brought back after it. */
  triggersInForceSince: Date;
  /** When each trigger first came into force without a break; nothing for a procedure brought back from retired. */
  triggerInForceSince: Map<string, Date> | undefined;
  /** Its first Version, which nothing came before. */
  catchesUp: boolean;
}

/** The farm's procedures not retired and with a Version published, each with how long its triggers have stood. */
export const sopsInForce = async (
  db: Pick<Database, "query">,
  farmId: string
): Promise<SopInForce[]> => {
  const definitions = await db.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    with: {
      currentVersion: true,
      // The Versions before it, newest first: how long each trigger has been in force without a break.
      versions: {
        columns: { number: true, content: true, publishedAt: true },
        orderBy: { number: "desc" },
        limit: VERSIONS_LOOKED_BACK,
      },
    },
  });
  return definitions
    .filter((definition) => definition.currentVersion)
    .map((definition) => {
      const published =
        definition.currentVersion?.publishedAt ?? definition.createdAt;
      // Brought back from being retired after it was published, it is in force again from then: nothing that happened
      // while it was retired is owed, nor caught up with.
      const { restoredAt } = definition;
      const restored = restoredAt !== null && restoredAt > published;
      return {
        definitionId: definition.id,
        versionId: definition.currentVersion?.id ?? "",
        content: contentOf({ content: definition.currentVersion?.content }),
        triggersInForceSince: restored && restoredAt ? restoredAt : published,
        // A trigger the Versions before it carried too has been in force since the first of them: a Move recorded on a
        // phone before a change to the procedure's words, and sent after it, still raises its check.
        triggerInForceSince: restored
          ? undefined
          : inForceSinceByTrigger(definition.versions),
        // A procedure's first Version catches up with the animals already on their way; a later one does not raise
        // again what the first raised.
        catchesUp: !restored && definition.currentVersion?.number === 1,
      };
    });
};
