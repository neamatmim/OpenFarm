import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import type { SyncKind } from "@OpenFarm/db/schema/sync";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Recorder } from "./completion-store";
import { claimEntry } from "./entries/claim";
import type { EntryKind, EntryRefusal } from "./entries/entry";
import { recordHeld, refusalOf } from "./entries/entry";
import { finishEntry } from "./entries/finish";
import { moveEntry } from "./entries/move";
import { observationEntry } from "./entries/observation";
import { stepCompletionEntry } from "./entries/step-completion";
import { stepPhotoEntry } from "./entries/step-photo";
import type { RaisedAlert } from "./instances-store";
import { tell } from "./notice";
import type { Entry, EntryResult } from "./sync-entries";
import {
  clockIsOut,
  entrySeen,
  highestSeq,
  missingSeqs,
  recordBatchResponse,
  rememberEntry,
  reserveBatch,
  seqTaken,
} from "./sync-store";

/** What to tell the phone about an entry the farm could not take. */
const message = (error: unknown): string =>
  error instanceof ORPCError
    ? error.message
    : ((error as Error)?.message ?? "could not be recorded");

/** Each kind a phone can send, and the Entry that records it (ADR 0004). */
const ENTRIES = {
  instance_claim: claimEntry,
  instance_complete: finishEntry,
  step_completion: stepCompletionEntry,
  completion_photo: stepPhotoEntry,
  animal_move: moveEntry,
  observation: observationEntry,
} as const satisfies Record<SyncKind, unknown>;

/** One entry, recorded by its Entry on the transaction the caller holds, with its Audit Event. */
const applyEntry = (
  tx: Tx,
  context: Recorder,
  entry: Entry,
  receivedAt: Date,
  /** Made before the entry is applied, because an effect may have to hang a Needs Review on
   *  it inside this same transaction. The Audit Event is then written under the same id. */
  eventId: string
): Promise<unknown> =>
  recordHeld(
    tx,
    context,
    ENTRIES[entry.kind] as EntryKind<Entry, unknown>,
    entry,
    {
      recordedAt: entry.recordedAt,
      receivedAt,
      id: entry.id,
      eventId,
      device: { id: context.device?.id ?? null, seq: entry.seq },
    }
  );

/** What the phone sent, as the trail and a held entry record it. The photo is left out: it
 *  is a row of its own where the entry was taken, and a megabyte of base64 in an Audit Event
 *  would make the trail unreadable to the people who most need to read it. */
const entryAfter = (entry: Entry): Record<string, unknown> => {
  // The image itself never goes in the trail: a megabyte of base64 in an Audit Event would
  // make it unreadable to the people who most need to read it. What it was, and which slot
  // it answered, is the part worth keeping.
  const rest =
    entry.kind === "completion_photo" ? { ...entry, data: undefined } : entry;
  // Nor the switch token: it proves who recorded it, and a proof written into a record anybody can read is a proof
  // anybody can use.
  return {
    ...rest,
    switchToken: undefined,
    recordedAt: entry.recordedAt.toISOString(),
  };
};

/** Records that the entry was read, holding what the phone sent whenever the farm could not
 *  take it into its records as it stands — so nothing written down is lost. */
const keep = async (
  tx: Tx,
  context: Recorder,
  entry: Entry,
  {
    input,
    sourceKey,
    receivedAt,
    outcome,
    reason,
    refusal,
  }: {
    input: { key: string };
    sourceKey: string;
    receivedAt: Date;
    outcome: EntryResult["outcome"];
    reason: string | null;
    /** How the farm sorted one it could not take, kept with it so the same entry asked about again is answered the
     *  same way, in the reader's language. Null for one it took. */
    refusal: EntryRefusal | null;
  }
): Promise<void> => {
  const held = outcome === "kept" || outcome === "rejected";
  await rememberEntry(tx, {
    id: entry.id,
    farmId: context.farm.id,
    sourceKey,
    seq: entry.seq,
    kind: entry.kind,
    outcome,
    batchKey: input.key,
    payload: held ? entryAfter(entry) : null,
    reason,
    refusal,
    recordedAt: entry.recordedAt,
    receivedAt,
  });
  if (outcome !== "kept") {
    return;
  }
  // The world moved while the phone was out of signal. What it recorded is held whole on
  // the entry above; a person is asked what to do with it.
  const audit = audited(context);
  const eventId = await audit.recordEvent(
    tx,
    {
      entity: "sync_entry",
      entityId: entry.id,
      action: "create",
      recordedAt: entry.recordedAt,
      reason: reason ?? undefined,
      after: entryAfter(entry),
    },
    { receivedAt }
  );
  await tell(
    tx,
    context.farm.id,
    {
      kind: "needs_review",
      about: { id: entry.id, entity: "sync_entry", auditEventId: eventId },
      facts: {
        reason: "late_entry",
        kind: entry.kind,
        seq: entry.seq,
        why: reason ?? undefined,
      },
    },
    receivedAt
  );
};

/** One notice about a phone, not one per entry it sent. */
const flagSource = async (
  tx: Tx,
  context: Recorder,
  {
    sourceKey,
    reason,
    receivedAt,
    params,
  }: {
    sourceKey: string;
    reason: "clock_skew" | "sync_gap";
    receivedAt: Date;
    params: Record<string, unknown>;
  }
): Promise<void> => {
  const entityId = `${sourceKey}:${reason}:${receivedAt.toISOString()}`;
  const eventId = await audited(context).recordEvent(
    tx,
    {
      entity: "sync_entry",
      entityId,
      action: "create",
      after: params,
    },
    { receivedAt }
  );
  await tell(
    tx,
    context.farm.id,
    {
      kind: "needs_review",
      about: { id: entityId, entity: "sync_entry", auditEventId: eventId },
      facts: { ...params, reason },
    },
    receivedAt
  );
};

/**
 * Every entry in the batch, in the order the phone sent them — which is the order they
 * happened.
 *
 * Each is applied inside its own savepoint, so an entry the farm cannot take rolls back
 * whatever it had half-written rather than leaving a row behind with nothing in the trail to
 * account for it — and so one failure does not abort the transaction the rest of the batch
 * is riding on.
 */
const applyEntries = async (
  tx: Tx,
  context: Recorder,
  input: { key: string; entries: Entry[]; sentAt?: Date },
  {
    receivedAt,
    sourceKey,
    recorderFor,
  }: { receivedAt: Date; sourceKey: string; recorderFor: RecorderFor }
): Promise<EntryResult[]> => {
  // Asked once, of the phone, not of each entry: it is one clock.
  const skewed =
    input.sentAt !== undefined &&
    clockIsOut(input.sentAt, receivedAt, context.farm.clockSkewMinutes);
  const seen = await highestSeq(tx, sourceKey);
  const missing = missingSeqs(
    seen,
    input.entries.map((entry) => entry.seq)
  );
  const results: EntryResult[] = [];

  for (const entry of input.entries) {
    // Deliberately sequential: entries are in the order they happened, and a later one can
    // depend on an earlier one — a Move before the Completion that follows it.
    // oxlint-disable-next-line no-await-in-loop
    const before = await entrySeen(tx, context.farm.id, entry.id);
    if (before) {
      // The same entry, read already — under this key or another one. Its answer stands, and so does the reason it
      // was refused for: a phone asking again is told what it was told the first time.
      results.push({
        id: entry.id,
        seq: entry.seq,
        outcome: before.outcome,
        reason: before.reason ?? "already recorded",
        ...(before.refusal ? { refusal: before.refusal as EntryRefusal } : {}),
      });
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    const clash = await seqTaken(tx, sourceKey, entry.seq);
    if (clash) {
      // Two different entries under one number: the phone's own count is wrong, and taking
      // the second would leave the farm unable to say which is which.
      // oxlint-disable-next-line no-await-in-loop
      await keep(tx, context, entry, {
        input,
        sourceKey,
        receivedAt,
        outcome: "rejected",
        reason: `sequence ${entry.seq} is already used by another entry`,
        refusal: { category: "wrong" },
      });
      results.push({
        id: entry.id,
        seq: entry.seq,
        outcome: "rejected",
        reason: `sequence ${entry.seq} is already used by another entry`,
        refusal: { category: "wrong" },
      });
      continue;
    }

    let outcome: EntryResult["outcome"] = "applied";
    let reason: string | null = null;
    let refusal: EntryRefusal | null = null;
    const eventId = uuidv7(receivedAt);
    try {
      // oxlint-disable-next-line no-await-in-loop
      const recorder = await recorderFor(entry);
      // An Entry that changed nothing — a claim already theirs, work already finished — writes nothing down; the
      // entry is still read, which is what stops it being offered for ever.
      // oxlint-disable-next-line no-await-in-loop
      await tx.transaction((entryTx) =>
        applyEntry(entryTx, recorder, entry, receivedAt, eventId)
      );
    } catch (error) {
      refusal = refusalOf(error);
      outcome = refusal.category === "late" ? "kept" : "rejected";
      reason = message(error);
    }
    if (outcome === "applied" && skewed) {
      // The litres are still the litres; the phone's clock is the thing to look at.
      outcome = "flagged";
    }
    // oxlint-disable-next-line no-await-in-loop
    await keep(tx, context, entry, {
      input,
      sourceKey,
      receivedAt,
      outcome,
      reason,
      refusal,
    });
    results.push({
      id: entry.id,
      seq: entry.seq,
      outcome,
      ...(reason ? { reason } : {}),
      ...(refusal ? { refusal } : {}),
    });
  }

  if (input.sentAt && skewed) {
    // One notice about one phone, however many entries its clock stamped.
    await flagSource(tx, context, {
      sourceKey,
      reason: "clock_skew",
      receivedAt,
      params: {
        sourceKey,
        entries: input.entries.length,
        sentAt: input.sentAt.toISOString(),
        receivedAt: receivedAt.toISOString(),
      },
    });
  }
  if (missing.length > 0) {
    // Entries this phone made and the farm has never read. Worth saying out loud; never a
    // reason to refuse what did arrive.
    await flagSource(tx, context, {
      sourceKey,
      reason: "sync_gap",
      receivedAt,
      params: { sourceKey, missing },
    });
  }
  return results;
};

/** Who an entry is to be written as: the person who recorded it, which on a Shed Phone need not be whoever sent it. */
export type RecorderFor = (entry: Entry) => Promise<Recorder>;

/**
 * A whole batch, in one transaction. Held here rather than in the router because a router
 * that opens its own transaction is a router that can write without a trail — the rule the
 * audit guard exists to keep.
 */
export const applyBatch = async (
  db: Database,
  context: Recorder,
  input: { key: string; entries: Entry[]; sentAt?: Date },
  {
    receivedAt,
    sourceKey,
    requestHash,
    recorderFor,
  }: {
    receivedAt: Date;
    sourceKey: string;
    requestHash: string;
    recorderFor: RecorderFor;
  }
): Promise<{
  results: EntryResult[];
  /** The notice raised for whoever sent the batch, when the farm refused any of it. */
  told: RaisedAlert[];
}> =>
  await db.transaction(async (tx) => {
    const reserved = await reserveBatch(tx, {
      key: input.key,
      farmId: context.farm.id,
      actorId: context.actor.id,
      requestHash,
      receivedAt,
    });
    if (!reserved) {
      throw new ORPCError("CONFLICT", {
        message: "That batch is already being applied",
      });
    }
    const applied = await applyEntries(tx, context, input, {
      receivedAt,
      sourceKey,
      recorderFor,
    });
    await recordBatchResponse(tx, input.key, context.farm.id, {
      results: applied,
    });
    // An entry the farm would not take is work somebody believes they have done. They are told
    // at once, in the app, because the alternative is a phone quietly holding an entry nobody
    // will ever look at again.
    const refused = applied.filter((one) => one.outcome === "rejected");
    // The whole notice, not its id: whoever pushes it needs what it says, and rebuilding it at
    // the call site is how the count and the reason got lost.
    const told =
      refused.length > 0
        ? await tell(
            tx,
            context.farm.id,
            {
              kind: "entry_rejected",
              about: { id: input.key, person: context.actor.id },
              facts: {
                count: refused.length,
                reason: refused[0]?.reason ?? "",
              },
            },
            receivedAt
          )
        : [];
    return { results: applied, told };
  });
