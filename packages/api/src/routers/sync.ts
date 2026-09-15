import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { RecorderFor } from "../batch-store";
import { applyBatch } from "../batch-store";
import type { Recorder } from "../completion-store";
import type { Context } from "../context";
import { buildContext } from "../context";
import { hashToken } from "../device";
import { protectedProcedure } from "../index";
import { pushRaised } from "../push-send";
import { pickRoleUsed, requireRole } from "../roles";
import { scopeOf } from "../scope";
import type { EntryResult } from "../sync-entries";
import { entryInput } from "../sync-entries";
import { batchUnder, fingerprint, sourceKeyFor } from "../sync-store";

/** How much one batch may carry. A phone out of signal for a week has plenty to send, but it
 *  sends it in batches: one transaction should stay a size a farm's database can hold. */
const BATCH_MAX = 200;

/** How long before a PIN reached the farm the work it covers may have been recorded: a PIN entered with no signal
 *  is proved when signal comes back, after the work — within a shift, with room. */
const PROOF_BEFORE_MS = 24 * 60 * 60 * 1000;
/** And after the switch ran out, for a phone's clock a little ahead of the farm's. */
const PROOF_AFTER_MS = 10 * 60 * 1000;

const ANY_ROLE = ["owner", "manager", "staff", "vet"] as const;

/**
 * Who each entry is written as. Unnamed, or naming the sender, it is the sender's. From a Shed Phone it may name
 * somebody else who works on that phone — the person switched in when it was recorded, offline, before whoever is
 * switched in now — provided it carries the switch token the farm gave that person for that stint on this phone,
 * and was recorded during it. Knowing that somebody has a PIN, or that they once used the phone, is not enough.
 * From a person's own phone it may name nobody but them.
 */
const recordersFor = (context: Recorder): RecorderFor => {
  const known = new Map<string, Promise<Recorder>>();
  const provedFor = async (entry: {
    actorId?: string;
    recordedAt: Date;
    switchToken?: string;
  }) => {
    const stint = entry.switchToken
      ? await context.db.query.deviceSwitch.findFirst({
          where: {
            tokenHash: await hashToken(entry.switchToken),
            deviceId: context.device?.id ?? "",
            userId: entry.actorId ?? "",
          },
          columns: { createdAt: true, expiresAt: true },
        })
      : undefined;
    const at = entry.recordedAt.getTime();
    const during =
      stint !== undefined &&
      at >= stint.createdAt.getTime() - PROOF_BEFORE_MS &&
      at <= stint.expiresAt.getTime() + PROOF_AFTER_MS;
    if (!during) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "Recorded under somebody who did not enter their PIN on this phone for it",
      });
    }
  };
  const asSomebodyElse = async (actorId: string): Promise<Recorder> => {
    if (!context.device) {
      throw new ORPCError("FORBIDDEN", {
        message:
          "This was recorded by somebody else; it can only come from their own phone or a Shed Phone",
      });
    }
    const pin = await context.db.query.staffPin.findFirst({
      where: { farmId: context.farm.id, userId: actorId },
      columns: { userId: true },
    });
    if (!pin) {
      throw new ORPCError("FORBIDDEN", {
        message: "Recorded under somebody who does not work on this phone",
      });
    }
    const theirs: Context = await buildContext({
      session: null,
      device: { ...context.device, activeUserId: actorId },
      deviceStatus: "ok",
      clock: context.clock,
      db: context.db,
      push: context.push,
      sms: context.sms,
    });
    // The Role they act under, chosen the way the batch's own gate chose the sender's: the checks that follow —
    // a Staff member's Pens, the Role the trail records — depend on it.
    const roleUsed = pickRoleUsed(theirs.roles, ANY_ROLE);
    if (!(theirs.actor && theirs.farm && roleUsed)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Recorded under somebody who no longer works on this farm",
      });
    }
    return {
      ...theirs,
      roleUsed,
      scope: scopeOf(theirs, roleUsed),
    } as Recorder;
  };
  return async (entry) => {
    if (!entry.actorId || entry.actorId === context.actor.id) {
      return context;
    }
    const found = known.get(entry.actorId) ?? asSomebodyElse(entry.actorId);
    known.set(entry.actorId, found);
    const recorder = await found;
    await provedFor(entry);
    return recorder;
  };
};

export const syncRouter = {
  /**
   * A phone's outbox, arriving. Everything in the batch is written with its Audit Events in
   * one transaction; each entry sits in its own savepoint, so an entry the farm cannot take
   * rolls back whatever it had half-written rather than leaving a row nothing accounts for.
   *
   * The same batch arriving again — the signal went as the request landed — is answered from
   * what was stored rather than applied a second time.
   */
  batch: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(
      z.object({
        /** The client's own key for this transaction. */
        key: z.string().min(1).max(64),
        /** The phone's clock at the moment it sent. How far an entry's own time is from now
         *  says nothing about a phone's clock — a milking recorded at five and sent at nine
         *  is exactly what an outbox is for — but how far the phone thinks it is from the
         *  farm, at the same instant, says everything. */
        sentAt: z.coerce.date().optional(),
        entries: z.array(entryInput).min(1).max(BATCH_MAX),
      })
    )
    .handler(async ({ context, input }) => {
      const receivedAt = context.clock.now();
      const requestHash = fingerprint(input.entries);

      const already = await batchUnder(context.db, input.key);
      if (already) {
        // Keys are the client's own, so one belonging to another Farm is a collision worth
        // saying out loud rather than answering with somebody else's work.
        if (already.farmId !== context.farm.id) {
          throw new ORPCError("CONFLICT", {
            message: "That key belongs to another farm",
          });
        }
        if (already.requestHash !== requestHash) {
          throw new ORPCError("CONFLICT", {
            message: "That key has already been used for different entries",
          });
        }
        if (!already.response) {
          // Reserved but never answered: the transaction that took it is still running, or
          // died without committing. Either way this is not the moment to apply it again.
          throw new ORPCError("CONFLICT", {
            message: "That batch is still being applied",
          });
        }
        // The same batch again: the stored answer, and nothing written.
        return already.response as { results: EntryResult[] };
      }

      const { results, told } = await applyBatch(context.db, context, input, {
        receivedAt,
        sourceKey: sourceKeyFor(context),
        requestHash,
        recorderFor: recordersFor(context),
      });
      // Outside the transaction, like every other notice: an entry the farm refused is work
      // somebody believes they have done, and they are told at once.
      await pushRaised(context, told, receivedAt);
      return { results };
    }),
};
