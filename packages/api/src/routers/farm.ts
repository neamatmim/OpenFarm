import { uuidv7 } from "@OpenFarm/db/ids";
import { eq, sql } from "@OpenFarm/db/operators";
import { farm, roleAssignment } from "@OpenFarm/db/schema/farm";
import { identityView } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { startOfFarmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** The Farm Parameters, as a set that grows a row at a time as the increments needing them
 *  land. Each is a number the Manager may tune, never a rule hidden in the code. */
const parameters = z
  .object({
    /** How far the tank reading may sit from what the cows account for before the Manager
     *  is asked to look. */
    milkTolerancePercent: z.number().int().min(0).max(100).optional(),
    feedTolerancePercent: z.number().int().min(0).max(100).optional(),
    digestTimes: z.array(z.string().trim()).min(1).max(6).optional(),
    quietFrom: z.string().trim().optional(),
    quietUntil: z.string().trim().optional(),
    /** How long an Overdue Instance may stay open before the Owner is told as well. */
    escalationMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .optional(),
    /** How long after making an entry Staff may still put it right. */
    staffCorrectionHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 7)
      .optional(),
    /** How long after an entry was made the Manager may still put it right. */
    managerCorrectionDays: z.number().int().min(0).max(365).optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Nothing to change" }
  );

/** A day as the certificate prints it. */
const FARM_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "YYYY-MM-DD");

/**
 * What the farm is, rather than how it is tuned: where it is, how to reach it, and the
 * registration an inspector asks for first.
 *
 * Its own act and not one of the Parameters, because those are numbers the Manager may turn up
 * and down, and this is the farm's identity — it appears on documents that leave the farm, and
 * changing it changes what those documents say.
 */
const identity = z
  .object({
    address: z.string().trim().max(300).nullish(),
    phone: z.string().trim().max(20).nullish(),
    registrationNumber: z.string().trim().max(60).nullish(),
    registrationOffice: z.string().trim().max(200).nullish(),
    /** Days as the certificate prints them, read on the farm's own clock: what a certificate
     *  says is a date, not an instant, and the office in Dhaka and the farm in Savar must
     *  agree on which day it means. */
    registrationIssuedOn: FARM_DAY.nullish(),
    registrationExpiresOn: FARM_DAY.nullish(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    { message: "Nothing to change" }
  );

/** One advisory lock key for "creating the farm", so concurrent first-run submissions serialise. */
const BOOTSTRAP_LOCK = 7001;

/** The farm as the trail records it either side of a change. */
const readIdentity = async (tx: Tx, farmId: string) => {
  const row = await tx.query.farm.findFirst({
    where: { id: farmId },
    columns: {
      name: true,
      address: true,
      phone: true,
      registrationNumber: true,
      registrationOffice: true,
      registrationIssuedOn: true,
      registrationExpiresOn: true,
    },
  });
  return row ?? null;
};

/** "HH:MM" on the farm's own clock, which is what every time of day here is. */
const TIME_OF_DAY = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/** First-run setup: the signed-in person names the Farm and becomes its Owner.
 *  Refused once a Farm exists — after that, people arrive by invitation. */
export const farmRouter = {
  bootstrap: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1) }))
    .handler(async ({ context, input }) => {
      if (context.farm) {
        throw new ORPCError("CONFLICT", { message: "The farm already exists" });
      }
      const now = context.clock.now();
      const farmId = uuidv7(now);
      const ownerId = context.actor.id;
      await audited(context, farmId).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "create",
          after: { name: input.name, ownerId },
        },
        async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`
          );
          const existing = await tx.query.farm.findFirst({
            columns: { id: true },
          });
          if (existing) {
            throw new ORPCError("CONFLICT", {
              message: "The farm already exists",
            });
          }
          await tx
            .insert(farm)
            .values({ id: farmId, name: input.name, createdAt: now });
          await tx.insert(roleAssignment).values({
            id: uuidv7(now),
            farmId,
            userId: ownerId,
            role: "owner",
            grantedBy: ownerId,
            grantedByRole: "owner",
            createdAt: now,
          });
        }
      );
      return { id: farmId, name: input.name };
    }),
  current: protectedProcedure.handler(({ context }) => context.farm),

  /** The Manager tunes the Farm Parameters. Audited like any other write, with the values
   *  as they stood before, so a flag raised under an old tolerance stays explicable. */
  /**
   * What the farm is. Read by anybody who is on it — a Vet writing a letter and a milker looking
   * at the farm's own page both see the same thing the office sees.
   */
  identity: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) => identityView(context.farm, context.clock.now())),

  /**
   * Writes the farm down. The Owner or the Manager (roles matrix: farm parameters are both
   * theirs), because the registration decision has the Manager entering it from the certificate
   * at go-live and the Owner answering for it afterwards.
   */
  setIdentity: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(identity)
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      await audited(context).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "update",
          // What it said before, because these are the words on documents the farm has already
          // sent out, and "what did the card say in March" is a question with an answer.
          before: (tx) => readIdentity(tx, farmId),
          after: (tx) => readIdentity(tx, farmId),
        },
        (tx) =>
          tx
            .update(farm)
            .set({
              ...(input.address === undefined
                ? {}
                : { address: input.address ?? null }),
              ...(input.phone === undefined
                ? {}
                : { phone: input.phone ?? null }),
              ...(input.registrationNumber === undefined
                ? {}
                : { registrationNumber: input.registrationNumber ?? null }),
              ...(input.registrationOffice === undefined
                ? {}
                : { registrationOffice: input.registrationOffice ?? null }),
              ...(input.registrationIssuedOn === undefined
                ? {}
                : {
                    registrationIssuedOn: input.registrationIssuedOn
                      ? startOfFarmDay(input.registrationIssuedOn)
                      : null,
                  }),
              ...(input.registrationExpiresOn === undefined
                ? {}
                : {
                    registrationExpiresOn: input.registrationExpiresOn
                      ? startOfFarmDay(input.registrationExpiresOn)
                      : null,
                  }),
            })
            .where(eq(farm.id, farmId))
      );
      return { id: farmId };
    }),

  setParameters: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(parameters)
    .handler(async ({ context, input }) => {
      const changes: Partial<typeof farm.$inferInsert> = {};
      for (const time of [
        ...(input.digestTimes ?? []),
        input.quietFrom,
        input.quietUntil,
      ]) {
        if (time !== undefined && !TIME_OF_DAY.test(time)) {
          throw new ORPCError("BAD_REQUEST", {
            message: `"${time}" is not a time of day`,
          });
        }
      }
      const quietFrom = input.quietFrom ?? context.farm.quietFrom;
      const quietUntil = input.quietUntil ?? context.farm.quietUntil;
      if (quietFrom === quietUntil) {
        // Silently meaning "never quiet" is how a farm ends up being woken at two in the
        // morning by a setting it thought it had made.
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Quiet hours that begin when they end are not quiet hours; set them apart or say so plainly",
        });
      }
      if (input.digestTimes !== undefined) {
        changes.digestTimes = input.digestTimes;
      }
      if (input.quietFrom !== undefined) {
        changes.quietFrom = input.quietFrom;
      }
      if (input.quietUntil !== undefined) {
        changes.quietUntil = input.quietUntil;
      }
      if (input.feedTolerancePercent !== undefined) {
        changes.feedTolerancePercent = input.feedTolerancePercent;
      }
      if (input.milkTolerancePercent !== undefined) {
        changes.milkTolerancePercent = input.milkTolerancePercent;
      }
      if (input.escalationMinutes !== undefined) {
        changes.escalationMinutes = input.escalationMinutes;
      }
      if (input.staffCorrectionHours !== undefined) {
        changes.staffCorrectionHours = input.staffCorrectionHours;
      }
      if (input.managerCorrectionDays !== undefined) {
        changes.managerCorrectionDays = input.managerCorrectionDays;
      }
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: async (tx) =>
            (await tx.query.farm.findFirst({
              where: { id: context.farm.id },
              columns: {
                milkTolerancePercent: true,
                feedTolerancePercent: true,
                digestTimes: true,
                quietFrom: true,
                quietUntil: true,
                escalationMinutes: true,
                staffCorrectionHours: true,
                managerCorrectionDays: true,
              },
            })) ?? null,
          after: changes,
        },
        (tx) => tx.update(farm).set(changes).where(eq(farm.id, context.farm.id))
      );
      return { ...context.farm, ...changes };
    }),
};
