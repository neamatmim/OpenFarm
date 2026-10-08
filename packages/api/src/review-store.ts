import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import type { ReviewReason } from "@OpenFarm/db/schema/review";
import { needsReview } from "@OpenFarm/db/schema/review";
import type { Bilingual } from "@OpenFarm/domain";
import { choiceSaid } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import type { EntryRefusal } from "./entries/entry";
import { contentOf } from "./sop-content";

/**
 * Writes down that the farm owes somebody's judgment: a Correction changed something it could not put right on its
 * own — figures a checker had signed off, an Effect the farm has moved past — or an Entry arrived that no longer fits
 * the world it was made in.
 *
 * The row alone. Telling the Manager it is there is the Notice's business, and the two happen in one act (see
 * `tell`): a queue nobody is pointed at is a queue nobody reads.
 */
export const writeTheJudgmentOwed = async (
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

/** What a phone sent that the farm held for a person, as the queue shows it: what kind of thing, about which animal,
 *  what was entered, by whom and when, and why it was held — so the Manager can judge it without opening the trail. */
export interface WhatWasHeld {
  kind: string;
  recordedAt: string;
  recordedBy: string | null;
  animalTag: string | null;
  evidence: unknown[];
  /** What each answer is called where it is one of its Step's choices, in both languages: "গর্ভবতী", not `positive`. */
  choices: (Bilingual | null)[];
  skipReason: string | null;
  refusal: EntryRefusal | null;
  /** Still held: the Manager may take it into the records. */
  mayTakeIn: boolean;
}

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Each row with what was held, where the row is about an entry a phone sent; and the work it was meant for, where it
 * named some — a held Step has no completion to find its work by.
 */
export const withWhatWasHeld = async <
  Row extends { entity: string; entityId: string; instanceId: string | null },
>(
  db: Pick<Database, "query">,
  farmId: string,
  rows: readonly Row[]
): Promise<(Row & { held: WhatWasHeld | null })[]> => {
  const ids = rows.flatMap((row) =>
    row.entity === "sync_entry" ? [row.entityId] : []
  );
  const entries =
    ids.length === 0
      ? []
      : await db.query.syncEntry.findMany({
          where: { farmId, id: { in: ids } },
          columns: {
            id: true,
            kind: true,
            outcome: true,
            payload: true,
            refusal: true,
            recordedAt: true,
            batchKey: true,
          },
        });
  const batches =
    entries.length === 0
      ? []
      : await db.query.syncBatch.findMany({
          where: { key: { in: entries.map((one) => one.batchKey) } },
          columns: { key: true, actorId: true },
        });
  const sentBy = new Map(batches.map((one) => [one.key, one.actorId]));
  const said = new Map(
    entries.map((one) => {
      const payload = (one.payload ?? {}) as Record<string, unknown>;
      return [
        one.id,
        {
          one,
          payload,
          actorId: asText(payload.actorId) ?? sentBy.get(one.batchKey) ?? null,
        },
      ] as const;
    })
  );
  const actorIds = [
    ...new Set(
      [...said.values()].flatMap((one) => (one.actorId ? [one.actorId] : []))
    ),
  ];
  const people =
    actorIds.length === 0
      ? []
      : await db.query.user.findMany({
          where: { id: { in: actorIds } },
          columns: { id: true, name: true },
        });
  const nameOf = new Map(people.map((one) => [one.id, one.name]));
  // The Version each held Step was answered on, which is what its choices are called by.
  const instanceIds = [
    ...new Set(
      [...said.values()].flatMap((one) => {
        const id = asText(one.payload.instanceId);
        return id ? [id] : [];
      })
    ),
  ];
  const works =
    instanceIds.length === 0
      ? []
      : await db.query.sopInstance.findMany({
          where: { farmId, id: { in: instanceIds } },
          columns: { id: true },
          with: { version: { columns: { content: true } } },
        });
  const versionOf = new Map(
    works.map((one) => [
      one.id,
      one.version ? contentOf(one.version) : undefined,
    ])
  );
  return rows.map((row) => {
    const found = row.entity === "sync_entry" ? said.get(row.entityId) : null;
    if (!found) {
      return { ...row, held: null };
    }
    const { one, payload, actorId } = found;
    return {
      ...row,
      instanceId: row.instanceId ?? asText(payload.instanceId),
      held: {
        kind: one.kind,
        recordedAt: one.recordedAt.toISOString(),
        recordedBy: actorId ? (nameOf.get(actorId) ?? null) : null,
        // A Step and a sighting name her by animalTag; a Move by tagNumber.
        animalTag: asText(payload.animalTag) ?? asText(payload.tagNumber),
        evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
        choices: (Array.isArray(payload.evidence) ? payload.evidence : []).map(
          (value, slot) =>
            choiceSaid(
              versionOf.get(asText(payload.instanceId) ?? ""),
              asText(payload.stepId) ?? undefined,
              slot,
              value
            )
        ),
        skipReason: asText(payload.skipReason),
        refusal: (one.refusal as WhatWasHeld["refusal"]) ?? null,
        mayTakeIn: one.outcome === "kept" && one.payload !== null,
      },
    };
  });
};
