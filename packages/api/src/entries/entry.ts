import { uuidv7 } from "@OpenFarm/db/ids";
import type { AuditAction } from "@OpenFarm/db/schema/audit";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { isExitState } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { SnapshotValue, Tx } from "../audit";
import { audited } from "../audit";
import type { Recorder } from "../completion-store";
import { requireAnimal } from "../herd-store";
import { isLate, lateEntry } from "../late";
import { VISITING_VET, forbidden, roleFor } from "../roles";
import { workingAs } from "../scope";

/**
 * How the farm sorted an Entry it did not simply take (ADR 0004): late, when the world moved under it; not theirs, when
 * it was never the person's to record; wrong, when it could never have been taken. With the refusal's own word where
 * the Entry gave one, so a phone can say it in the reader's language rather than show the server's English.
 */
export interface EntryRefusal {
  category: "late" | "wrong" | "not_yours";
  word?: string;
}

export const refusalOf = (error: unknown): EntryRefusal => {
  const word = (error as { data?: { refusal?: unknown } } | undefined)?.data
    ?.refusal;
  const worded = typeof word === "string" ? { word } : {};
  if (isLate(error)) {
    return { category: "late", ...worded };
  }
  if (error instanceof ORPCError && error.code === "FORBIDDEN") {
    return { category: "not_yours", ...worded };
  }
  return { category: "wrong", ...worded };
};

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

/** The Audit Event an Entry is written under: what it is about, what it did, and that thing as it stood either side.
 *  Readers run on the Entry's own transaction; the one after it, and the id, see what the Entry wrote. */
export interface EntryTrail<Result> {
  entity: string;
  action: AuditAction;
  reason?: string;
  entityId: (result: Result) => string;
  before?: (tx: Tx) => Promise<SnapshotValue>;
  after: (tx: Tx, result: Result) => Promise<SnapshotValue>;
}

/**
 * One kind of thing a person records, taken the same way however it reaches the farm (ADR 0004): which Roles may
 * record it, how the trail describes it, and what it writes. Its procedure and the Batch are its two callers, and
 * neither says anything about it the Entry does not.
 */
export interface EntryKind<Input, Result> {
  roles: readonly RoleName[];
  /** Whether a Vet called in for a visit may record it at all — they still reach only the animals on their cases. Said
   *  here, so a phone's Batch is held to it as the procedure is. */
  visitingVet: boolean;
  /** Whether this one must come from the person's own phone, never a shared Shed Phone (ADR 0003): the Registration's
   *  renewal is the Owner's own act. */
  needsPersonalSession?: (input: Input) => boolean;
  trail: (
    context: Recorder,
    input: Input,
    times: EntryTimes
  ) => EntryTrail<Result>;
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
  /** Why this one cannot come from a phone's Outbox at all, when it cannot — the Registration's renewal is the Owner's
   *  own act on their own phone, with its certificate — or nothing. */
  heldRefusal?: (input: Input) => string | undefined;
}

/** Thrown inside the write to roll back an Entry that changed nothing, taking its Audit Event with it. */
class NothingChangedError extends Error {
  override name = "NothingChangedError";
}

/** Refuses an Entry that may not come from where it came from: a shared Shed Phone, for one that must come from the
 *  person's own. The same on both paths. */
const assertFromTheRightPhone = <Input, Result>(
  context: Recorder,
  kind: EntryKind<Input, Result>,
  input: Input
) => {
  if (context.device && kind.needsPersonalSession?.(input)) {
    throw new ORPCError("FORBIDDEN", {
      message: "This can only be done from your own phone, not a shed phone",
    });
  }
};

/** Recorded with signal, by its procedure: done now, and heard of now. The procedure's own Role gate has already
 *  chosen the Role, from the same Roles. */
export const recordNow = async <Input, Result>(
  context: Recorder,
  kind: EntryKind<Input, Result>,
  input: Input
): Promise<Result> => {
  assertFromTheRightPhone(context, kind, input);
  const now = context.clock.now();
  const times = { id: uuidv7(now), doneAt: now, receivedAt: now };
  let result: Result | undefined;
  const trail = kind.trail(context, input, times);
  try {
    return await audited(context).write(
      {
        entity: trail.entity,
        action: trail.action,
        reason: trail.reason,
        entityId: () => trail.entityId(result as Result),
        before: trail.before,
        after: (tx) => trail.after(tx, result as Result),
      },
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
  // What the procedure's Role gate checks by the procedure's name, checked here by the kind: a phone's queue is no way
  // round the visit either.
  if (roleUsed === "vet" && recorder.visiting && !kind.visitingVet) {
    throw forbidden(VISITING_VET);
  }
  assertFromTheRightPhone(recorder, kind, input);
  const refused = kind.heldRefusal?.(input);
  if (refused) {
    throw new ORPCError("BAD_REQUEST", { message: refused });
  }
  const context: Recorder = { ...recorder, ...workingAs(recorder, roleUsed) };
  const times = {
    id: held.id,
    doneAt:
      held.recordedAt > held.receivedAt ? held.receivedAt : held.recordedAt,
    receivedAt: held.receivedAt,
  };
  const trail = kind.trail(context, input, times);
  const before = (await trail.before?.(tx)) ?? null;
  const result = await kind.apply(tx, context, input, {
    ...times,
    eventId: held.eventId,
  });
  if (kind.unchanged?.(result)) {
    return result;
  }
  await audited(context).recordEvent(
    tx,
    {
      entity: trail.entity,
      entityId: trail.entityId(result),
      action: trail.action,
      reason: trail.reason,
      // The phone's own clock, as it said it, beside the farm's receipt (ADR 0002): the record is dated no later than the
      // farm heard of it, but the trail keeps what the phone claimed.
      recordedAt: held.recordedAt,
      device: held.device,
    },
    {
      before,
      after: await trail.after(tx, result),
      eventId: held.eventId,
      receivedAt: held.receivedAt,
    }
  );
  return result;
};
