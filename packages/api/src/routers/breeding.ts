import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { abortion, repeatBreederAnswer } from "@OpenFarm/db/schema/breeding";
import { animal } from "@OpenFarm/db/schema/herd";
import { REPEAT_BREEDER_DECISIONS, failedAttempts } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { followExpectedCalving, pregnancyTimesOf } from "../breeding-store";
import { loadLiveAnimal, requireAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";

const tagInput = z.string().trim().min(1).max(32);

/** Every clinical act the Vet signs comes from their own account, never a Shed Phone. */
const theVetsOwnAct = protectedProcedure
  .use(
    requireOnly("vet", {
      message: "Only the Vet records an abortion, from their own account",
      reason: "vet_only",
    })
  )
  .use(requirePersonalSession());

export const breedingRouter = {
  /**
   * A pregnancy lost before she calved: when, how far along, and what the Vet made of it.
   *
   * The Vet's act (roles matrix: Breeding — Abortion is `C R U` to the Vet). It clears her Expected
   * Calving and the work that was being pulled towards a calving that will not happen, and a
   * Pregnant Heifer is a Heifer again, back on heat watch. Not a failed attempt: she took, and lost
   * it — which is a different question for the Vet than a cow who does not take.
   */
  recordAbortion: theVetsOwnAct
    .input(
      z.object({
        tagNumber: tagInput,
        abortedAt: z.coerce.date(),
        stageMonths: z.number().int().min(1).max(9),
        note: z.string().trim().min(1).max(2000),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.abortedAt > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "An abortion cannot have happened later than now",
        });
      }
      const tagNumber = input.tagNumber.toUpperCase();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "abortion",
          entityId: id,
          action: "create",
          after: async (tx) =>
            (await tx.query.abortion.findFirst({ where: { id } })) ?? null,
        },
        async (tx) => {
          const her = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          if (!her.expectedCalvingAt) {
            throw new ORPCError("BAD_REQUEST", {
              message: `${tagNumber} is not carrying, so there is no pregnancy to lose`,
              data: { refusal: "abortion_of_a_cow_not_carrying" },
            });
          }
          await tx.insert(abortion).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            abortedAt: input.abortedAt,
            stageMonths: input.stageMonths,
            note: input.note,
            serviceId: her.expectedCalvingServiceId,
            expectedCalvingAt: her.expectedCalvingAt,
            recordedBy: context.actor.id,
            recordedAt: now,
          });
          const backToHeatWatch = her.state === "pregnant_heifer";
          await tx
            .update(animal)
            .set({
              expectedCalvingAt: null,
              expectedCalvingServiceId: null,
              ...(backToHeatWatch
                ? { state: "heifer" as const, stateChangedAt: input.abortedAt }
                : {}),
              updatedAt: now,
            })
            .where(eq(animal.id, her.id));
          await followExpectedCalving(
            tx,
            { ...her, expectedCalvingAt: null },
            pregnancyTimesOf(context.farm).calvingLeadDays,
            { expectedAgain: false }
          );
        }
      );
      return { tagNumber };
    }),

  /**
   * Somebody's answer to a Repeat Breeder on the Manager's queue: serve her again, treat her, or
   * cull her, and why.
   *
   * A decision recorded as one and nothing more (the Owner, 2026-09-13): it changes no State and
   * culls nobody. The Manager's queue, and the Vet's word counts too; the Owner reads it.
   */
  answerRepeatBreeder: protectedProcedure
    .use(requireRole("manager", "vet"))
    .input(
      z.object({
        tagNumber: tagInput,
        decision: z.enum(REPEAT_BREEDER_DECISIONS),
        note: z.string().trim().min(1).max(2000),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const target = await requireAnimal(
        context.db,
        context.farm.id,
        tagNumber
      );
      const id = newId(now);
      await audited(context).write(
        {
          entity: "repeat_breeder_answer",
          entityId: id,
          action: "create",
          after: async (tx) =>
            (await tx.query.repeatBreederAnswer.findFirst({ where: { id } })) ??
            null,
        },
        async (tx) => {
          const services = await tx.query.service.findMany({
            where: { animalId: target.id },
            columns: { id: true, animalId: true, servedAt: true },
          });
          const checks = await tx.query.pregnancyCheck.findMany({
            where: { animalId: target.id },
            columns: {
              id: true,
              serviceId: true,
              result: true,
              checkedAt: true,
            },
          });
          await tx.insert(repeatBreederAnswer).values({
            id,
            farmId: context.farm.id,
            animalId: target.id,
            decision: input.decision,
            note: input.note,
            // What she had failed at when this was decided: a failure after it raises her again.
            failedAttempts: failedAttempts(services, checks),
            answeredBy: context.actor.id,
            answeredByRole: context.roleUsed ?? "manager",
            answeredAt: now,
          });
        }
      );
      return { tagNumber };
    }),
};
