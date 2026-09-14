import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";

import type { AuditedWrite, Tx } from "../audit";
import { audited, readSnapshot } from "../audit";
import type { Recorder } from "../completion-store";
import { roleFor } from "../roles";

/** When an Entry happened, and when the farm heard of it (ADR 0004). */
export interface EntryTimes {
  /** When the work was done: now, with signal; the phone's own time, for work it held. */
  doneAt: Date;
  receivedAt: Date;
  /** The phone's own id for what it recorded, so a replay is the same fact rather than a second one. */
  id?: string;
  /** The Audit Event the Entry will be written under, for work that has to point at its own trail. */
  eventId: string;
}

/**
 * One kind of thing a person records, taken the same way however it reaches the farm (ADR 0004): which Roles may
 * record it, how the trail describes it, and what it writes. Its procedure and the Batch are its two callers, and
 * neither says anything about it the Entry does not.
 */
export interface EntryKind<Input, Result> {
  roles: readonly RoleName[];
  /** The Audit Event: what it is about, what it did, and that thing as it stood either side. Readers run on the
   *  Entry's own transaction, before and after it applies. */
  trail: (context: Recorder, input: Input) => AuditedWrite;
  /** Writes it. Refuses with `lateEntry` when the world has moved since it was recorded — the animal has left, someone
   *  else took the work — so a phone's Batch keeps it for a person rather than refusing it. */
  apply: (
    tx: Tx,
    context: Recorder,
    input: Input,
    times: EntryTimes
  ) => Promise<Result>;
}

/** Recorded with signal, by its procedure: done now, and heard of now. The procedure's own Role gate has already
 *  chosen the Role, from the same Roles. */
export const recordNow = <Input, Result>(
  context: Recorder,
  kind: EntryKind<Input, Result>,
  input: Input
): Promise<Result> => {
  const now = context.clock.now();
  return audited(context).write(kind.trail(context, input), (tx, eventId) =>
    kind.apply(tx, context, input, { doneAt: now, receivedAt: now, eventId })
  );
};

/**
 * Recorded from a phone's Outbox, on the Batch's transaction: under the Role it would have been done under with signal,
 * dated when it was done — never later than the farm heard of it, whatever the phone's clock says — and with the
 * phone and its Sequence Number in the trail.
 */
export const recordHeld = async <Input, Result>(
  tx: Tx,
  recorder: Recorder,
  kind: EntryKind<Input, Result>,
  input: Input,
  held: {
    recordedAt: Date;
    receivedAt: Date;
    id: string;
    eventId: string;
    device: { id: string | null; seq: number };
  }
): Promise<Result> => {
  const roleUsed = roleFor(recorder, kind.roles);
  if (!roleUsed) {
    // The same answer its procedure's Role gate gives: a phone's queue is no way round it.
    throw new ORPCError("FORBIDDEN", {
      message: "This is not this person's to record",
    });
  }
  const context: Recorder = { ...recorder, roleUsed };
  const doneAt =
    held.recordedAt > held.receivedAt ? held.receivedAt : held.recordedAt;
  const trail = {
    ...kind.trail(context, input),
    recordedAt: doneAt,
    device: held.device,
  };
  const before = await readSnapshot(tx, trail.before);
  const result = await kind.apply(tx, context, input, {
    doneAt,
    receivedAt: held.receivedAt,
    id: held.id,
    eventId: held.eventId,
  });
  const after = await readSnapshot(tx, trail.after);
  await audited(context).recordEvent(tx, trail, {
    before,
    after,
    eventId: held.eventId,
    receivedAt: held.receivedAt,
  });
  return result;
};
