import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { applyBatch } from "../batch-store";
import { protectedProcedure } from "../index";
import { pushRaised } from "../push-send";
import { requireRole } from "../roles";
import type { EntryResult } from "../sync-entries";
import { entryInput } from "../sync-entries";
import { batchUnder, fingerprint, sourceKeyFor } from "../sync-store";

/** How much one batch may carry. A phone out of signal for a week has plenty to send, but it
 *  sends it in batches: one transaction should stay a size a farm's database can hold. */
const BATCH_MAX = 200;

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
    .use(requireRole("owner", "manager", "staff", "vet"))
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
      });
      // Outside the transaction, like every other notice: an entry the farm refused is work
      // somebody believes they have done, and they are told at once.
      await pushRaised(context, told, receivedAt);
      return { results };
    }),
};
