import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { animalFeedPlan } from "@OpenFarm/db/schema/feeding-plan";
import { animal as animalTable } from "@OpenFarm/db/schema/herd";
import { farmDayOf, farmDaysApart, feedUnitOf } from "@OpenFarm/domain";
import {
  FEED_PLAN_SCENARIOS,
  feedingPlanProblems,
  forecastFeedingPlan,
  MAX_FEED_PLAN_DAYS,
} from "@OpenFarm/domain/feeding-plan";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { refuseFeedsNotFed } from "../feed-store";
import {
  farmFeedingPlan,
  feedingPlanDetail,
  planDayInput,
  planningAnimal,
  planningRations,
} from "../feeding-plan-store";
import { protectedProcedure } from "../index";
import { isOnTheFarm } from "../instances-store";
import { requirePersonalSession, requireRole } from "../roles";

const tagInput = z.string().trim().min(1).max(32);
const saveInput = z
  .object({
    tagNumber: tagInput,
    previousPlanId: z.string().nullable(),
    startDay: planDayInput,
    startWeightKg: z.number().positive().max(2000),
    saleDay: planDayInput,
    targetWeightKg: z.number().positive().max(2000),
    adaptationDays: z.number().int().min(0).max(60),
    transitionDays: z.number().int().min(0).max(30),
    reviewDays: z.number().int().min(7).max(90),
    reservePercent: z.number().min(0).max(50),
    arrivalRationId: z.string().nullable(),
    stageRationIds: z.array(z.string()).min(1).max(20),
  })
  .refine(
    (input) => {
      const days = farmDaysApart(input.startDay, input.saleDay);
      return days > 0 && days <= MAX_FEED_PLAN_DAYS;
    },
    {
      message: "Choose a sale day within 540 days after the start",
      path: ["saleDay"],
    }
  );

export const feedingPlansRouter = {
  summary: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u),
        scenario: z.enum(FEED_PLAN_SCENARIOS).default("expected"),
      })
    )
    .handler(
      async ({ context, input }) =>
        await farmFeedingPlan(
          context.db,
          context.farm,
          context.clock.now(),
          input.month,
          input.scenario
        )
    ),
  get: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ tagNumber: tagInput }))
    .handler(
      async ({ context, input }) =>
        await feedingPlanDetail(
          context.db,
          context.farm,
          context.clock.now(),
          input.tagNumber
        )
    ),

  save: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(saveInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "animal_feed_plan",
          entityId: id,
          action: "create",
          after: async (tx) =>
            (await tx.query.animalFeedPlan.findFirst({ where: { id } })) ??
            null,
        },
        async (tx) => {
          const animal = await planningAnimal(
            tx,
            context.farm.id,
            input.tagNumber,
            now
          );
          const [locked] = await tx
            .select({ id: animalTable.id, state: animalTable.state })
            .from(animalTable)
            .where(eq(animalTable.id, animal.id))
            .for("update");
          if (!locked || !isOnTheFarm(locked)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "An animal that has left cannot have a new feeding plan",
            });
          }
          const previous = await tx.query.animalFeedPlan.findFirst({
            where: { farmId: context.farm.id, animalId: animal.id },
            orderBy: { revision: "desc" },
          });
          if ((previous?.id ?? null) !== input.previousPlanId) {
            throw new ORPCError("CONFLICT", {
              message: "The plan changed. Refresh before saving a revision.",
            });
          }
          if (input.startDay > farmDayOf(now)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "An existing animal's plan starts on or before today",
            });
          }
          const options = await planningRations(tx, context.farm, animal);
          const selected = new Set(input.stageRationIds);
          const stages = options
            .filter((option) => selected.has(option.rationId))
            .toSorted((a, b) => (a.band.fromKg ?? 0) - (b.band.fromKg ?? 0));
          const arrival =
            options.find(
              (option) => option.rationId === input.arrivalRationId
            ) ?? null;
          if (
            stages.length !== input.stageRationIds.length ||
            (input.arrivalRationId && !arrival)
          ) {
            throw new ORPCError("BAD_REQUEST", {
              message: "Choose current rations belonging to this farm",
            });
          }
          const snapshot = {
            startDay: input.startDay,
            startWeightKg: input.startWeightKg,
            saleDay: input.saleDay,
            targetWeightKg: input.targetWeightKg,
            adaptationDays: input.adaptationDays,
            transitionDays: input.transitionDays,
            reviewDays: input.reviewDays,
            reservePercent: input.reservePercent,
            arrival,
            stages,
          };
          const problems = feedingPlanProblems(snapshot);
          if (problems.length > 0) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Check the adaptation ration and select non-overlapping stages with feed and expected gain",
              data: { problems },
            });
          }
          const feeds = await tx.query.feedItem.findMany({
            where: { farmId: context.farm.id },
          });
          refuseFeedsNotFed(
            feeds.map((feed) => ({ ...feed, unit: feedUnitOf(feed.unit) })),
            [...stages, ...(arrival ? [arrival] : [])].flatMap(
              (stage) => stage.items
            )
          );
          const incomplete = forecastFeedingPlan(snapshot, "fast").stopped;
          if (incomplete) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Add a ration covering ${incomplete.weightKg} kg before ${incomplete.day}`,
              data: { incomplete },
            });
          }
          await tx.insert(animalFeedPlan).values({
            id,
            revision: (previous?.revision ?? 0) + 1,
            farmId: context.farm.id,
            animalId: animal.id,
            supersedesId: previous?.id ?? null,
            snapshot,
            createdBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),
};
