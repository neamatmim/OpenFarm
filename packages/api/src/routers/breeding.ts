import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { abortion, repeatBreederAnswer } from "@OpenFarm/db/schema/breeding";
import { REPEAT_BREEDER_DECISIONS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  assertLostWhenItCouldBe,
  pregnancyTimesOf,
  readAbortion,
  repeatBreederFor,
  repeatBreedersOn,
} from "../breeding-store";
import {
  abortionCorrection,
  abortionCorrectionInput,
} from "../corrections/abortion";
import { correct } from "../corrections/correction";
import {
  entersState,
  forgetExpectedCalving,
  loadLiveAnimal,
} from "../herd-store";
import { protectedProcedure } from "../index";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";
import { requireClinicalInScope } from "../scope";

const tagInput = z.string().trim().min(1).max(32);

const VET_ONLY = {
  message: "Only the Vet records an abortion, from their own account",
  reason: "vet_only",
} as const;

/** An abortion is a clinical finding the Vet signs, so it comes from the Vet's own account and
 *  never a Shed Phone — as a Diagnosis does. */
const abortionByTheVet = protectedProcedure
  .use(requireOnly("vet", VET_ONLY, { visitingVet: true }))
  .use(requirePersonalSession());

export const breedingRouter = {
  /**
   * A pregnancy the Vet found lost before she calved: when, how far along, and what the Vet made of it.
   *
   * The Vet's act (roles matrix: Breeding — Abortion is `C R U` to the Vet). It clears her Expected
   * Calving and the work that was being pulled towards a calving that will not happen, and a
   * Pregnant Heifer is a Heifer again, back on heat watch. Not a failed attempt: she took, and lost
   * it — which is a different question for the Vet than a cow who does not take.
   */
  recordAbortion: abortionByTheVet
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
      const tagNumber = input.tagNumber.toUpperCase();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "abortion",
          entityId: id,
          action: "create",
          after: (tx) => readAbortion(tx, id),
        },
        async (tx) => {
          const her = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          requireClinicalInScope(context.scope, her.id);
          if (!her.expectedCalvingAt) {
            throw new ORPCError("BAD_REQUEST", {
              message: `${tagNumber} is not carrying, so there is no pregnancy to lose`,
              data: { refusal: "abortion_of_a_cow_not_carrying" },
            });
          }
          await assertLostWhenItCouldBe(
            tx,
            input.abortedAt,
            now,
            her.expectedCalvingServiceId
          );
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
          // The calving she was expected to have is not coming, and the work before it goes with it.
          await forgetExpectedCalving(tx, context.farm.id, her, {
            now,
            calvingLeadDays: pregnancyTimesOf(context.farm).calvingLeadDays,
          });
          // A heifer who lost her first calf is back on heat watch; a cow is where her Lactation leaves her.
          if (her.state === "pregnant_heifer") {
            await entersState(tx, context.farm.id, her, {
              state: "heifer",
              at: input.abortedAt,
              now,
            });
          }
        }
      );
      return { tagNumber, id };
    }),

  /**
   * Puts an abortion right: the day, how far along, or the note. The Vet's to change, as it was the
   * Vet's to record, and a Correction like any other — with a reason, and the trail holding what it
   * said before. What it did to her pregnancy stands: an abortion recorded against the wrong cow is a
   * pregnancy to find again with a check, not one to restore from here.
   */
  correctAbortion: abortionByTheVet
    .input(abortionCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, abortionCorrection, input)
    ),

  /**
   * The cows somebody has to decide about, for whoever may read the question: the Manager's queue,
   * which the Vet decides on as well and the Owner reads (roles matrix: Repeat Breeder flag — Vet R,
   * decide). Listed, never pushed.
   */
  repeatBreeders: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(({ context }) =>
      repeatBreedersOn(
        context.db,
        context.farm.id,
        context.farm.repeatBreederThreshold
      )
    ),

  /**
   * Somebody's answer to a Repeat Breeder: serve her again, treat her, or cull her, and why.
   *
   * A decision recorded as one and nothing more (the Owner, 2026-09-13): it changes no State and
   * culls nobody. The Manager's or the Vet's to give; the Owner reads it. Only a cow who is on the
   * queue can be answered — an answer for one who is not would quietly hold back her flag later, and a
   * second tap on the same answer finds nothing left to answer.
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
      const answeredByRole = context.roleUsed;
      if (!answeredByRole) {
        throw new ORPCError("FORBIDDEN");
      }
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
          const her = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          const question = await repeatBreederFor(
            tx,
            her.id,
            context.farm.repeatBreederThreshold
          );
          if (!question?.flagged) {
            throw new ORPCError("BAD_REQUEST", {
              message: `${tagNumber} is not waiting for a decision`,
              data: { refusal: "not_a_repeat_breeder" },
            });
          }
          await tx.insert(repeatBreederAnswer).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            decision: input.decision,
            note: input.note,
            // What she had failed at when this was decided: a failure after it raises her again.
            failedAttempts: question.failedAttempts,
            answeredBy: context.actor.id,
            answeredByRole,
            answeredAt: now,
          });
        }
      );
      return { tagNumber };
    }),
};
