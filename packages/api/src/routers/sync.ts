import { eq } from "@OpenFarm/db/operators";
import { syncBatch } from "@OpenFarm/db/schema/sync";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import type { CompletionEntry, Recorder } from "../completion-store";
import { applyCompletion, applyMove, isLate } from "../completion-store";
import { protectedProcedure } from "../index";
import { raiseNeedsReview } from "../review-store";
import { requireRole } from "../roles";
import {
  clockIsOut,
  entrySeen,
  fingerprint,
  gapsBefore,
  highestSeq,
  rememberEntry,
  sourceKeyFor,
} from "../sync-store";

/** How much one batch may carry. A phone out of signal for a week has plenty to send, but it
 *  sends it in batches: one transaction should stay a size a farm's database can hold. */
const BATCH_MAX = 200;

const evidenceValue = z.union([z.boolean(), z.number(), z.string()]);

/** Every entry carries what the phone knew: its own id for the record, where in its own
 *  sequence the entry sits, and when it says the work happened. The server stamps when it
 *  took it, and the phone can never set that (ADR 0002). */
const entryBase = {
  id: z.string().min(1).max(64),
  seq: z.number().int().min(0),
  recordedAt: z.coerce.date(),
};

const entryInput = z.discriminatedUnion("kind", [
  z.object({
    ...entryBase,
    kind: z.literal("step_completion"),
    instanceId: z.string(),
    stepId: z.string().trim().min(1),
    animalTag: z.string().trim().optional(),
    evidence: z.array(evidenceValue).default([]),
    destination: z.enum(["bulk", "calves", "discard"]).optional(),
    outOfRange: z.string().trim().max(120).optional(),
    skipReason: z.string().trim().max(120).optional(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("animal_move"),
    tagNumber: z.string().trim().min(1).max(32),
    toPenId: z.string(),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal("observation"),
    tagNumber: z.string().trim().min(1).max(32),
    note: z.string().trim().max(2000),
  }),
]);

type Entry = z.infer<typeof entryInput>;

export interface EntryResult {
  id: string;
  seq: number;
  outcome: "applied" | "flagged" | "rejected";
  /** Why it was flagged or refused, in words the client can show and keep. */
  reason?: string;
}

const message = (error: unknown): string =>
  error instanceof ORPCError
    ? error.message
    : ((error as Error)?.message ?? "could not be recorded");

/** One entry, applied on the batch's own transaction with its Audit Event beside it. */
const applyEntry = async (
  tx: Tx,
  context: Recorder,
  entry: Entry,
  receivedAt: Date
): Promise<{ entity: string; entityId: string }> => {
  if (entry.kind === "step_completion") {
    const completion: CompletionEntry = {
      instanceId: entry.instanceId,
      stepId: entry.stepId,
      animalTag: entry.animalTag,
      evidence: entry.evidence,
      destination: entry.destination,
      outOfRange: entry.outOfRange,
      skipReason: entry.skipReason,
      recordedAt: entry.recordedAt,
    };
    const recorded = await applyCompletion(
      tx,
      context,
      completion,
      receivedAt,
      entry.id
    );
    return { entity: "step_completion", entityId: recorded.completionId };
  }
  if (entry.kind === "animal_move") {
    const moved = await applyMove(tx, context, entry, receivedAt);
    return { entity: "animal", entityId: moved };
  }
  // Observations arrive with health, in a later increment. The kind exists so a client
  // written against this contract does not have to change; refusing it by name is honest
  // about what the farm can hold today.
  throw new ORPCError("NOT_IMPLEMENTED", {
    message: "Observations are not recorded yet",
  });
};

/**
 * Every entry in the batch, in the order the phone sent them — which is the order they
 * happened. A rejection is that entry's alone; the rest of the batch still applies, because
 * one malformed entry is no reason to lose a morning's milking.
 */
const applyEntries = async (
  tx: Tx,
  context: Recorder,
  input: { key: string; entries: Entry[] },
  { receivedAt, sourceKey }: { receivedAt: Date; sourceKey: string }
): Promise<EntryResult[]> => {
  const audit = audited(context);
  const seen = await highestSeq(tx, sourceKey);
  const gaps = gapsBefore(
    seen,
    input.entries.map((entry) => entry.seq)
  );
  const results: EntryResult[] = [];

  for (const entry of input.entries) {
    // Deliberately sequential: entries are in the order they happened, and a later one can
    // depend on an earlier one — a Move before the Completion that follows it.
    // oxlint-disable-next-line no-await-in-loop
    const before = await entrySeen(tx, entry.id);
    if (before) {
      // The same entry, read already. Its answer stands.
      results.push({
        id: entry.id,
        seq: entry.seq,
        outcome: before.outcome,
        reason: "already recorded",
      });
      continue;
    }
    const skewed = clockIsOut(
      entry.recordedAt,
      receivedAt,
      context.farm.clockSkewMinutes
    );
    try {
      // oxlint-disable-next-line no-await-in-loop
      const target = await applyEntry(tx, context, entry, receivedAt);
      // oxlint-disable-next-line no-await-in-loop
      const eventId = await audit.recordEvent(
        tx,
        {
          entity: target.entity,
          entityId: target.entityId,
          action: "create",
          recordedAt: entry.recordedAt,
          device: context.device
            ? { id: context.device.id, seq: entry.seq }
            : { id: "", seq: entry.seq },
          after: null,
        },
        { receivedAt }
      );
      const outcome = skewed ? "flagged" : "applied";
      if (skewed) {
        // oxlint-disable-next-line no-await-in-loop
        await raiseNeedsReview(
          tx,
          context.farm.id,
          {
            entity: target.entity,
            entityId: target.entityId,
            reason: "clock_skew",
            auditEventId: eventId,
            params: {
              seq: entry.seq,
              recordedAt: entry.recordedAt.toISOString(),
            },
          },
          receivedAt
        );
      }
      // oxlint-disable-next-line no-await-in-loop
      await rememberEntry(tx, {
        id: entry.id,
        farmId: context.farm.id,
        sourceKey,
        seq: entry.seq,
        kind: entry.kind,
        outcome,
        batchKey: input.key,
        recordedAt: entry.recordedAt,
        receivedAt,
      });
      results.push({ id: entry.id, seq: entry.seq, outcome });
    } catch (error) {
      if (!isLate(error)) {
        // Malformed, unauthorised, or about something the farm has never heard of. Refused
        // on its own, so the client keeps it and can show it to someone.
        results.push({
          id: entry.id,
          seq: entry.seq,
          outcome: "rejected",
          reason: message(error),
        });
        continue;
      }
      // The world moved while the phone was out of signal. The entry is a fact the farm
      // wants; it is kept as a notice for the Manager rather than thrown away.
      // oxlint-disable-next-line no-await-in-loop
      const eventId = await audit.recordEvent(
        tx,
        {
          entity: "sync_entry",
          entityId: entry.id,
          action: "create",
          recordedAt: entry.recordedAt,
          reason: message(error),
          after: { kind: entry.kind, seq: entry.seq },
        },
        { receivedAt }
      );
      // oxlint-disable-next-line no-await-in-loop
      await raiseNeedsReview(
        tx,
        context.farm.id,
        {
          entity: "sync_entry",
          entityId: entry.id,
          reason: "late_entry",
          auditEventId: eventId,
          params: { kind: entry.kind, seq: entry.seq, why: message(error) },
        },
        receivedAt
      );
      // oxlint-disable-next-line no-await-in-loop
      await rememberEntry(tx, {
        id: entry.id,
        farmId: context.farm.id,
        sourceKey,
        seq: entry.seq,
        kind: entry.kind,
        outcome: "flagged",
        batchKey: input.key,
        recordedAt: entry.recordedAt,
        receivedAt,
      });
      results.push({
        id: entry.id,
        seq: entry.seq,
        outcome: "flagged",
        reason: message(error),
      });
    }
  }

  if (gaps.length > 0) {
    // Entries this phone made and the farm has never read. Worth saying out loud; never a
    // reason to refuse what did arrive.
    const eventId = await audit.recordEvent(
      tx,
      {
        entity: "sync_entry",
        entityId: `${sourceKey}:${gaps[0]}`,
        action: "create",
        after: { missing: gaps },
      },
      { receivedAt }
    );
    await raiseNeedsReview(
      tx,
      context.farm.id,
      {
        entity: "sync_entry",
        entityId: `${sourceKey}:${gaps[0]}`,
        reason: "sync_gap",
        auditEventId: eventId,
        params: { sourceKey, missing: gaps },
      },
      receivedAt
    );
  }
  return results;
};

export const syncRouter = {
  /**
   * A phone's outbox, arriving. Everything in the batch is written with its Audit Events in
   * one transaction: the batch applies whole or not at all, so a phone that is told "yes"
   * knows the farm holds all of it.
   *
   * The same batch arriving again — the signal went as the request landed — is answered from
   * what was stored rather than applied a second time.
   */
  batch: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({
        /** The client's own key for this transaction. */
        key: z.string().min(1).max(64),
        entries: z.array(entryInput).min(1).max(BATCH_MAX),
      })
    )
    .handler(async ({ context, input }) => {
      const receivedAt = context.clock.now();
      const hash = fingerprint(input.entries);
      const sourceKey = sourceKeyFor(context);

      const already = await context.db.query.syncBatch.findFirst({
        where: { key: input.key, farmId: context.farm.id },
      });
      if (already) {
        if (already.requestHash !== hash) {
          throw new ORPCError("CONFLICT", {
            message: "That key has already been used for different entries",
          });
        }
        // The same batch again: the stored answer, and nothing written.
        return already.response as { results: EntryResult[] };
      }

      const results = await context.db.transaction(async (tx) => {
        // Reserved first: two phones replaying the same batch at once meet here rather than
        // both applying it.
        const [reserved] = await tx
          .insert(syncBatch)
          .values({
            key: input.key,
            farmId: context.farm.id,
            actorId: context.actor.id,
            requestHash: hash,
            receivedAt,
          })
          .onConflictDoNothing()
          .returning({ key: syncBatch.key });
        if (!reserved) {
          throw new ORPCError("CONFLICT", {
            message: "That batch is already being applied",
          });
        }
        const applied = await applyEntries(tx, context, input, {
          receivedAt,
          sourceKey,
        });
        await tx
          .update(syncBatch)
          .set({ response: { results: applied } })
          .where(eq(syncBatch.key, input.key));
        return applied;
      });
      return { results };
    }),
};
