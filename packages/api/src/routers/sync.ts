import { SYNC_BATCH_MAX, heavierThanAPhoneSends } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { RecorderFor } from "../batch-store";
import { applyBatch } from "../batch-store";
import type { Recorder } from "../completion-store";
import type { Context } from "../context";
import { buildContext } from "../context";
import { hashToken, requireDevice, stretchSwitch } from "../device";
import { protectedProcedure, publicProcedure } from "../index";
import { lateEntry } from "../late";
import { pushRaised } from "../push-send";
import { pickRoleUsed, requireRole } from "../roles";
import { workingAs } from "../scope";
import type { EntryResult } from "../sync-entries";
import { entryInput } from "../sync-entries";
import { batchUnder, fingerprint, sourceKeyFor } from "../sync-store";

/** How long before a PIN reached the farm the work it covers may have been recorded: a PIN entered with no signal
 *  is proved when signal comes back, after the work — and a phone can be out of signal for days, a weekend in a
 *  drawer and more, without the work done on it coming back as nobody's. A week. */
const PROOF_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;
/** And after the switch ran out, for a phone's clock a little ahead of the farm's. */
const PROOF_AFTER_MS = 10 * 60 * 1000;
const MINUTE_MS = 60_000;

const ANY_ROLE = ["owner", "manager", "staff", "vet"] as const;

/** What the farm knows of a request before anybody is named in it: the Farm, and the phone it came from. */
type FarmAndPhone = Pick<
  Context,
  "db" | "clock" | "push" | "sms" | "device"
> & { farm: NonNullable<Context["farm"]> };

/**
 * Who each entry is written as. Unnamed, or naming the sender, it is the sender's. From a Shed Phone it may name
 * somebody else who works on that phone — the person switched in when it was recorded, offline, before whoever is
 * switched in now — provided it carries the switch token the farm gave that person for that stint on this phone,
 * and was recorded during it. Knowing that somebody has a PIN, or that they once used the phone, is not enough.
 * From a person's own phone it may name nobody but them.
 *
 * Sent by a Shed Phone with nobody switched in — locked on the shelf, its signal back — there is no sender: every entry
 * proves its own person by its token.
 */
const recordersFor = (
  context: FarmAndPhone,
  sender: Recorder | null
): RecorderFor => {
  const known = new Map<string, Promise<Recorder>>();
  const provedFor = async (entry: {
    actorId?: string;
    recordedAt: Date;
    switchToken?: string;
  }) => {
    // The stint the token was given for, on any of this farm's Shed Phones: the token is the proof, and a phone
    // enrolled again is a new phone to the farm though the same handset, holding work its people did before
    // (the Owner, 2026-10-07).
    const stint = entry.switchToken
      ? await context.db.query.deviceSwitch.findFirst({
          where: {
            tokenHash: await hashToken(entry.switchToken),
            userId: entry.actorId ?? "",
            device: { farmId: context.farm.id },
          },
          columns: {
            id: true,
            createdAt: true,
            expiresAt: true,
            endedAt: true,
          },
        })
      : undefined;
    const at = entry.recordedAt.getTime();
    // A stint ended on purpose — locked, or the PIN set anew — covers what was done up to its end, however the taps ran;
    // one still open, or run out, what its taps kept open.
    const until = stint?.endedAt ?? stint?.expiresAt;
    const during =
      stint !== undefined &&
      until !== undefined &&
      at >= stint.createdAt.getTime() - PROOF_BEFORE_MS &&
      at <= until.getTime() + PROOF_AFTER_MS;
    if (!(stint && during)) {
      // Somebody who works on this phone, with nothing to show the farm they were switched in when it was done: the PIN
      // they entered with no signal was lost with the tab, or the phone put away. Kept whole for the Manager to judge
      // — never refused back to whoever happened to send it, who did not do it (the glossary's Waiting for a PIN).
      throw lateEntry(
        "Recorded under somebody who did not enter their PIN on this phone for it",
        { refusal: "pin_not_proved" }
      );
    }
    // Each thing she recorded is a tap that kept the phone unlocked under her, as the keep-awake would have said had
    // there been signal to say it: a milking of an hour in a shed with none is hers to its last cow, each one within the
    // farm's lock window of the one before. Never back, and never past when the farm heard of it.
    const tapped = Math.min(at, context.clock.now().getTime());
    await stretchSwitch(
      context.db,
      stint.id,
      new Date(tapped + context.farm.pinAutoLockMinutes * MINUTE_MS)
    );
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
    // Read as they were until they left: work they did before it is theirs, whenever the phone brings it in (the Owner,
    // 2026-10-07). Work dated after they left is refused, entry by entry, below.
    const theirs: Context = await buildContext({
      session: null,
      device: { ...context.device, activeUserId: actorId },
      deviceStatus: "ok",
      clock: context.clock,
      db: context.db,
      push: context.push,
      sms: context.sms,
      evenIfLeft: true,
    });
    // The Role they act under, chosen the way the batch's own gate chose the sender's: the checks that follow —
    // a Staff member's Pens, the Role the trail records — depend on it.
    const roleUsed = pickRoleUsed(theirs.roles, ANY_ROLE);
    if (!(theirs.actor && theirs.farm && roleUsed)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Recorded under somebody who no longer works on this farm",
      });
    }
    return { ...theirs, ...workingAs(theirs, roleUsed) } as Recorder;
  };
  return async (entry) => {
    if (sender && (!entry.actorId || entry.actorId === sender.actor.id)) {
      return sender;
    }
    if (!entry.actorId) {
      throw new ORPCError("FORBIDDEN", {
        message: "Recorded under nobody",
      });
    }
    const found = known.get(entry.actorId) ?? asSomebodyElse(entry.actorId);
    known.set(entry.actorId, found);
    const recorder = await found;
    const left = recorder.person?.disabledAt;
    if (left && entry.recordedAt >= left) {
      throw new ORPCError("FORBIDDEN", {
        message: "Recorded under somebody who no longer works on this farm",
      });
    }
    await provedFor(entry);
    return recorder;
  };
};

const batchInput = z.object({
  /** The client's own key for this transaction. */
  key: z.string().min(1).max(64),
  /** The phone's clock at the moment it sent. How far an entry's own time is from now
   *  says nothing about a phone's clock — a milking recorded at five and sent at nine
   *  is exactly what an outbox is for — but how far the phone thinks it is from the
   *  farm, at the same instant, says everything. */
  sentAt: z.coerce.date().optional(),
  /** The Outbox's own id, kept on the device it lives on: a person on their own laptop and their own phone keeps
   *  two counts, each starting at one. Left out by a phone from before, which counts as the person. */
  outboxId: z.string().trim().min(1).max(64).optional(),
  // As much as a phone sends and no more: a request of two hundred photographs is not one a phone ever makes.
  entries: z
    .array(entryInput)
    .min(1)
    .max(SYNC_BATCH_MAX)
    .refine((entries) => !heavierThanAPhoneSends(entries), {
      message: "More than a phone sends in one batch",
    }),
});

/**
 * A phone's outbox, arriving. Everything in the batch is written with its Audit Events in one transaction; each entry
 * sits in its own savepoint, so an entry the farm cannot take rolls back whatever it had half-written rather than leaving
 * a row nothing accounts for.
 *
 * The same batch arriving again — the signal went as the request landed — is answered from what was stored rather than
 * applied a second time.
 */
const receive = async (
  context: Recorder,
  input: z.infer<typeof batchInput>,
  recorderFor: RecorderFor
): Promise<{ results: EntryResult[] }> => {
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
      // Said in a word the phone acts on: the same Batch tried again a moment later is answered from what was stored.
      throw new ORPCError("CONFLICT", {
        message: "That batch is still being applied",
        data: { refusal: "still_applying" },
      });
    }
    // The same batch again: the stored answer, and nothing written.
    return already.response as { results: EntryResult[] };
  }

  const { results, told } = await applyBatch(context.db, context, input, {
    receivedAt,
    sourceKey: sourceKeyFor(context, input.outboxId),
    requestHash,
    recorderFor,
  });
  // Outside the transaction, like every other notice: an entry the farm refused is work
  // somebody believes they have done, and they are told at once.
  await pushRaised(context, told, receivedAt);
  return { results };
};

export const syncRouter = {
  /** A phone's outbox, arriving from whoever is signed in or switched in on it: see `receive`. */
  batch: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
    .input(batchInput)
    .handler(({ context, input }) =>
      receive(context, input, recordersFor(context, context))
    ),

  /**
   * The same, from a Shed Phone with nobody switched in: put back on the shelf with work still on it, it sends what it
   * holds when its signal comes back rather than waiting for the next PIN — while the Manager would otherwise see the
   * milking undone and close it as Missed. Every entry proves its own person by the token their PIN earned; the Batch
   * is filed under the first one proved. A phone holding nothing anybody can prove is told to wait for a PIN.
   */
  fromTheShelf: publicProcedure
    // Asked before anything it was sent is read: only a Shed Phone sends from the shelf.
    .use(({ context, next }) => {
      requireDevice(context.device, context.deviceStatus);
      return next();
    })
    .input(batchInput)
    .handler(async ({ context, input }) => {
      const device = requireDevice(context.device, context.deviceStatus);
      if (!context.farm) {
        throw new ORPCError("UNAUTHORIZED");
      }
      const farmAndPhone: FarmAndPhone = {
        ...context,
        device,
        farm: context.farm,
      };
      const recorderFor = recordersFor(farmAndPhone, null);
      let sender: Recorder | null = null;
      for (const entry of input.entries) {
        try {
          // Sequential: the first entry somebody's token proves names the Batch, and asking further is wasted.
          // oxlint-disable-next-line no-await-in-loop
          sender = await recorderFor(entry);
          break;
        } catch {
          // Not proved: the next one may be.
        }
      }
      if (!sender) {
        throw new ORPCError("UNAUTHORIZED", {
          message:
            "Nothing on this phone proves who recorded it: a PIN is needed",
        });
      }
      return receive(sender, input, recorderFor);
    }),
};
