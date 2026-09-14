import { uuidv7 } from "@OpenFarm/db/ids";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { isExitState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { AuditedWrite, Tx } from "../audit";
import { audited, readSnapshot } from "../audit";
import type { Recorder } from "../completion-store";
import { requireAnimal } from "../herd-store";
import { roleFor } from "../roles";

/**
 * An entry that was true when it was written and is not true now: the animal has been sold,
 * the work has been signed off, the cow has already been recorded. A phone out of signal
 * writes these honestly, so they are kept and put in front of a person rather than refused
 * (ADR 0002). Marked so a batch can tell them from an entry that was never valid at all —
 * a Step no Version has, an animal the farm has never heard of — which is the client's to
 * keep and fix.
 */
export const lateEntry = (message: string, data: object = {}) =>
  new ORPCError("CONFLICT", { message, data: { ...data, late: true } });

/** Was this refused because the world moved, rather than because the entry was wrong? */
export const isLate = (error: unknown): boolean =>
  error instanceof ORPCError &&
  (error.data as { late?: boolean } | undefined)?.late === true;

/**
 * The animal an Entry is about, as long as she is still on the farm. One that has left since the Entry was made is the
 * world moving under it — she was sold while the phone was in the shed — so it is late, not wrong (ADR 0004).
 */
export const requireAnimalStillHere = async (
  tx: Tx,
  farmId: string,
  tagNumber: string
) => {
  const beast = await requireAnimal(tx, farmId, tagNumber.toUpperCase());
  if (isExitState(beast.state)) {
    throw lateEntry(
      `Animal ${beast.tagNumber} has left the farm (${beast.state})`
    );
  }
  return beast;
};

/** Which Entry this is, and when it happened and was heard of (ADR 0004). */
export interface EntryTimes {
  /** Its own id — the phone's, for work it held — so a replay is the same fact rather than a second one. */
  id: string;
  /** When the work was done: now, with signal; the phone's own time, for work it held. */
  doneAt: Date;
  receivedAt: Date;
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
  trail: (context: Recorder, input: Input, times: EntryTimes) => AuditedWrite;
  /** Writes it. Refuses with `lateEntry` when the world has moved since it was recorded — the animal has left, someone
   *  else took the work — so a phone's Batch keeps it for a person rather than refusing it. */
  apply: (
    tx: Tx,
    context: Recorder,
    input: Input,
    times: EntryTimes & {
      /** The Audit Event it will be written under, for work that has to point at its own trail. */
      eventId: string;
    }
  ) => Promise<Result>;
  /** Says an Entry changed nothing — the work was already finished, by this phone's earlier send or by somebody else —
   *  so no Audit Event is written: a trail entry for a transition that did not happen is a trail that lies. */
  unchanged?: (result: Result) => boolean;
}

/** Thrown inside the write to roll back an Entry that changed nothing, taking its Audit Event with it. */
class NothingChangedError extends Error {
  override name = "NothingChangedError";
}

/** Recorded with signal, by its procedure: done now, and heard of now. The procedure's own Role gate has already
 *  chosen the Role, from the same Roles. */
export const recordNow = async <Input, Result>(
  context: Recorder,
  kind: EntryKind<Input, Result>,
  input: Input
): Promise<Result> => {
  const now = context.clock.now();
  const times = { id: uuidv7(now), doneAt: now, receivedAt: now };
  let result: Result | undefined;
  try {
    return await audited(context).write(
      kind.trail(context, input, times),
      async (tx, eventId) => {
        result = await kind.apply(tx, context, input, { ...times, eventId });
        if (kind.unchanged?.(result)) {
          throw new NothingChangedError("nothing changed");
        }
        return result;
      }
    );
  } catch (error) {
    if (error instanceof NothingChangedError) {
      return result as Result;
    }
    throw error;
  }
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
  const times = {
    id: held.id,
    doneAt:
      held.recordedAt > held.receivedAt ? held.receivedAt : held.recordedAt,
    receivedAt: held.receivedAt,
  };
  const trail = {
    ...kind.trail(context, input, times),
    recordedAt: times.doneAt,
    device: held.device,
  };
  const before = await readSnapshot(tx, trail.before);
  const result = await kind.apply(tx, context, input, {
    ...times,
    eventId: held.eventId,
  });
  if (kind.unchanged?.(result)) {
    return result;
  }
  const after = await readSnapshot(tx, trail.after);
  await audited(context).recordEvent(tx, trail, {
    before,
    after,
    eventId: held.eventId,
    receivedAt: held.receivedAt,
  });
  return result;
};
