import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { abortion, repeatBreederAnswer } from "@OpenFarm/db/schema/breeding";
import { animal } from "@OpenFarm/db/schema/herd";
import { REPEAT_BREEDER_DECISIONS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import {
  pregnancyTimesOf,
  repeatBreederFor,
  repeatBreedersOn,
} from "../breeding-store";
import { followExpectedCalving } from "../calving-work";
import { reasonInput } from "../corrections";
import { entersState, loadLiveAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";
import { assertOnTheirCases } from "../visiting-store";

const tagInput = z.string().trim().min(1).max(32);

const VET_ONLY = {
  message: "Only the Vet records an abortion, from their own account",
  reason: "vet_only",
} as const;

/** An abortion is a clinical finding the Vet signs, so it comes from the Vet's own account and
 *  never a Shed Phone — as a Diagnosis does. */
const abortionByTheVet = protectedProcedure
  .use(requireOnly("vet", VET_ONLY))
  .use(requirePersonalSession());

/** The abortion as the trail records it either side of a change. */
const readAbortion = async (tx: Tx, id: string) =>
  (await tx.query.abortion.findFirst({ where: { id } })) ?? null;

/**
 * When a pregnancy can have been lost: not later than now, and not before the service it came from.
 * A late entry dated before she was served is a date written wrong, and it would clear a pregnancy
 * she had not begun.
 */
const assertLostWhenItCouldBe = async (
  tx: Tx,
  abortedAt: Date,
  now: Date,
  serviceId: string | null
) => {
  if (abortedAt > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "An abortion cannot have happened later than now",
      data: { refusal: "aborted_in_the_future" },
    });
  }
  const served = serviceId
    ? await tx.query.service.findFirst({
        where: { id: serviceId },
        columns: { servedAt: true },
      })
    : undefined;
  if (served && abortedAt < served.servedAt) {
    throw new ORPCError("BAD_REQUEST", {
      message: "An abortion cannot be earlier than the service it ends",
      data: { refusal: "aborted_before_she_was_served" },
    });
  }
};

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
          assertOnTheirCases(context, her.id);
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
          await tx
            .update(animal)
            .set({
              expectedCalvingAt: null,
              expectedCalvingServiceId: null,
              updatedAt: now,
            })
            .where(eq(animal.id, her.id));
          // A heifer who lost her first calf is back on heat watch; a cow is where her Lactation leaves her.
          if (her.state === "pregnant_heifer") {
            await entersState(tx, context.farm.id, her, {
              state: "heifer",
              at: input.abortedAt,
              now,
            });
          }
          await followExpectedCalving(
            tx,
            { ...her, expectedCalvingAt: null },
            pregnancyTimesOf(context.farm).calvingLeadDays,
            { expectedAgain: false }
          );
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
    .input(
      z
        .object({
          id: z.string(),
          abortedAt: z.coerce.date().optional(),
          stageMonths: z.number().int().min(1).max(9).optional(),
          note: z.string().trim().min(1).max(2000).optional(),
          reason: reasonInput,
        })
        .refine(
          (value) =>
            value.abortedAt !== undefined ||
            value.stageMonths !== undefined ||
            value.note !== undefined,
          { message: "Nothing to correct" }
        )
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const standing = await context.db.query.abortion.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, serviceId: true, animalId: true },
      });
      if (!standing) {
        throw new ORPCError("NOT_FOUND", { message: "No such abortion" });
      }
      assertOnTheirCases(context, standing.animalId);
      await audited(context).write(
        {
          entity: "abortion",
          entityId: standing.id,
          action: "correct",
          reason: input.reason,
          before: (tx) => readAbortion(tx, standing.id),
          after: (tx) => readAbortion(tx, standing.id),
        },
        async (tx) => {
          if (input.abortedAt) {
            await assertLostWhenItCouldBe(
              tx,
              input.abortedAt,
              now,
              standing.serviceId
            );
          }
          await tx
            .update(abortion)
            .set({
              ...(input.abortedAt ? { abortedAt: input.abortedAt } : {}),
              ...(input.stageMonths ? { stageMonths: input.stageMonths } : {}),
              ...(input.note ? { note: input.note } : {}),
            })
            .where(eq(abortion.id, standing.id));
        }
      );
      return { id: standing.id };
    }),

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
