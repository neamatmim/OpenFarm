import { and, eq, isNull, sql } from "@OpenFarm/db/operators";
import { weighIn } from "@OpenFarm/db/schema/fattening";
import { needsReview } from "@OpenFarm/db/schema/review";
import { syncEntry } from "@OpenFarm/db/schema/sync";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { takeInHeld } from "../batch-store";
import type { Recorder } from "../completion-store";
import type { Context } from "../context";
import { buildContext } from "../context";
import { judgeAgainAfter } from "../effects/weigh-in";
import { protectedProcedure } from "../index";
import { withTheirWork, withWhatWasHeld } from "../review-store";
import { pickRoleUsed, requireRole } from "../roles";
import { workingAs } from "../scope";

/** How much of the queue a screen is handed at once. */
const QUEUE_LIMIT = 100;

/** A doubted reading the Manager found right: no longer doubted, and the readings after it judged again against it. */
const letTheReadingStand = async (
  tx: Tx,
  farmId: string,
  completionId: string,
  now: Date
): Promise<void> => {
  const [reading] = await tx
    .update(weighIn)
    .set({ flaggedNote: null })
    .where(
      and(eq(weighIn.farmId, farmId), eq(weighIn.completionId, completionId))
    )
    .returning({ animalId: weighIn.animalId, weighedAt: weighIn.weighedAt });
  if (reading) {
    await judgeAgainAfter(tx, {
      farmId,
      animalId: reading.animalId,
      after: reading.weighedAt,
      now,
    });
  }
};

/** Somebody whose held work is being taken in, read as they were on the phone it came from — a Shed Phone holds Barn
 *  Staff alone — and as they were until they left, for work done before. */
const readAsTheyWorked =
  (context: Context) =>
  async (actorId: string, deviceId: string | null): Promise<Recorder> => {
    const phone = deviceId
      ? await context.db.query.shedPhone.findFirst({
          where: { id: deviceId },
          columns: { id: true, name: true, farmId: true },
        })
      : undefined;
    const theirs = await buildContext({
      session: null,
      device: phone ? { ...phone, activeUserId: actorId } : null,
      personId: phone ? null : actorId,
      clock: context.clock,
      db: context.db,
      push: context.push,
      sms: context.sms,
      evenIfLeft: true,
    });
    const roleUsed = pickRoleUsed(theirs.roles, [
      "owner",
      "manager",
      "staff",
      "vet",
    ]);
    if (!(theirs.actor && theirs.farm && roleUsed)) {
      throw new ORPCError("FORBIDDEN", {
        message: "Recorded under somebody who no longer works on this farm",
      });
    }
    return { ...theirs, ...workingAs(theirs, roleUsed) } as Recorder;
  };

export const reviewQueueRouter = {
  /** What the system could not put right on its own, oldest first — the things that have
   *  been waiting longest are the ones most likely to have been forgotten. */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) =>
      withWhatWasHeld(
        context.db,
        context.farm.id,
        await withTheirWork(
          context.db,
          context.farm.id,
          await context.db.query.needsReview.findMany({
            where: { farmId: context.farm.id, resolvedAt: { isNull: true } },
            // Narrowed: the queue needs the Correction's reason and who made it, not the
            // before-and-after snapshots of the entry it changed.
            with: {
              raisedBy: {
                columns: {
                  id: true,
                  action: true,
                  reason: true,
                  actorId: true,
                  roleUsed: true,
                  recordedAt: true,
                },
              },
            },
            orderBy: { raisedAt: "asc" },
            limit: QUEUE_LIMIT,
          })
        )
      )
    ),

  /** How many are waiting in all: the list carries the oldest of them, and a tab that counted only those would say a
   *  hundred however many more were behind them. */
  waiting: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const [row] = await context.db
        .select({ waiting: sql<number>`count(*)::int` })
        .from(needsReview)
        .where(
          and(
            eq(needsReview.farmId, context.farm.id),
            isNull(needsReview.resolvedAt)
          )
        );
      return { waiting: row?.waiting ?? 0 };
    }),

  /** Closing one is a judgement, so it is recorded as one: what was decided, by whom, under
   *  which Role. Nothing is removed. */
  resolve: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string(),
        resolution: z.string().trim().min(1).max(400),
        /** For a doubted weight: the Manager looked, and the reading is right. Its doubt is lifted, and the readings
         *  after it are judged again against it. */
        readingStands: z.boolean().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "needs_review",
          entityId: input.id,
          action: "update",
          reason: input.resolution,
          after: {
            resolvedAt: now.toISOString(),
            resolvedBy: context.actor.id,
          },
        },
        async (tx) => {
          const [row] = await tx
            .update(needsReview)
            .set({
              resolvedAt: now,
              resolvedBy: context.actor.id,
              resolution: input.resolution,
            })
            .where(
              and(
                eq(needsReview.id, input.id),
                eq(needsReview.farmId, context.farm.id),
                // Only an open one: resolving twice would overwrite the first person's
                // judgement with the second's.
                isNull(needsReview.resolvedAt)
              )
            )
            .returning({
              id: needsReview.id,
              entity: needsReview.entity,
              entityId: needsReview.entityId,
              reason: needsReview.reason,
            });
          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "That is not waiting to be looked at",
              data: { refusal: "review_closed" },
            });
          }
          if (
            input.readingStands &&
            row.entity === "weigh_in" &&
            row.reason === "implausible_weight"
          ) {
            await letTheReadingStand(tx, context.farm.id, row.entityId, now);
          }
        }
      );
      return { id: input.id, resolved: true };
    }),

  /**
   * Work a phone sent that the farm held for a person, taken into the records: the Manager has looked at it and says it
   * was done. Written as it was recorded — under whoever did it, dated when they did it — and the Needs Review closed
   * with the Manager's word for it, in one act. Refused with the Entry's own reason where the farm still cannot take
   * it, and then nothing changes.
   */
  takeIn: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        id: z.string(),
        note: z.string().trim().min(1).max(400).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const review = await context.db.query.needsReview.findFirst({
        where: {
          id: input.id,
          farmId: context.farm.id,
          resolvedAt: { isNull: true },
        },
        columns: { entity: true, entityId: true, reason: true },
      });
      if (!review) {
        throw new ORPCError("NOT_FOUND", {
          message: "That is not waiting to be looked at",
          data: { refusal: "review_closed" },
        });
      }
      const held =
        review.entity === "sync_entry" && review.reason === "late_entry"
          ? await context.db.query.syncEntry.findFirst({
              where: {
                id: review.entityId,
                farmId: context.farm.id,
                outcome: "kept",
              },
            })
          : undefined;
      if (!held?.payload) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only work a phone sent and the farm held can be taken in",
          data: { refusal: "not_held_work" },
        });
      }
      const batch = await context.db.query.syncBatch.findFirst({
        where: { key: held.batchKey },
        columns: { actorId: true },
      });
      const resolution = input.note ?? "Taken into the records";
      await audited(context).write(
        {
          entity: "needs_review",
          entityId: input.id,
          action: "update",
          reason: resolution,
          after: {
            resolvedAt: now.toISOString(),
            resolvedBy: context.actor.id,
            takenIn: held.id,
          },
        },
        async (tx) => {
          const [row] = await tx
            .update(needsReview)
            .set({ resolvedAt: now, resolvedBy: context.actor.id, resolution })
            .where(
              and(
                eq(needsReview.id, input.id),
                eq(needsReview.farmId, context.farm.id),
                isNull(needsReview.resolvedAt)
              )
            )
            .returning({ id: needsReview.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND", {
              message: "That is not waiting to be looked at",
              data: { refusal: "review_closed" },
            });
          }
          await takeInHeld(
            tx,
            {
              id: held.id,
              farmId: context.farm.id,
              payload: held.payload,
              sourceKey: held.sourceKey,
              seq: held.seq,
              sentBy: batch?.actorId ?? context.actor.id,
            },
            { recorderOf: readAsTheyWorked(context), now }
          );
          // In the records now, as a phone asking about it again is told.
          await tx
            .update(syncEntry)
            .set({ outcome: "applied", refusal: null })
            .where(eq(syncEntry.id, held.id));
        }
      );
      return { id: input.id, takenIn: true };
    }),
};
