import { lactationView, roundLitres } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { litresOf } from "../milk-store";
import { requireRole } from "../roles";

/** How many of a cow's recent milkings to hand back; enough for a fortnight of two-a-day
 *  sessions, which is as far as a phone screen usefully goes. */
const RECENT_RECORDS = 30;

const sessionShape = {
  columns: {
    id: true,
    instanceId: true,
    penId: true,
    dueAt: true,
    bulkLitres: true,
    sumBulkLitres: true,
    differenceLitres: true,
    tolerancePercent: true,
    flaggedAt: true,
  },
  with: {
    pen: {
      columns: { name: true },
      with: { shed: { columns: { name: true } } },
    },
  },
} as const;

export const milkRouter = {
  /** One Milking Session as the Manager reads it: the tank reading, what the cows account
   *  for, and every cow's litres with where they went. */
  session: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ instanceId: z.string() }))
    .handler(async ({ context, input }) => {
      const session = await context.db.query.milkingSession.findFirst({
        where: { farmId: context.farm.id, instanceId: input.instanceId },
        ...sessionShape,
        with: {
          ...sessionShape.with,
          records: {
            with: { animal: { columns: { tagNumber: true } } },
            orderBy: { recordedAt: "asc" },
          },
        },
      });
      if (!session) {
        throw new ORPCError("NOT_FOUND", {
          message: "Nothing has been milked in this session yet",
        });
      }
      return session;
    }),

  /** The Manager's queue: Sessions whose tank reading did not match the cows. */
  flagged: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      context.db.query.milkingSession.findMany({
        where: { farmId: context.farm.id, flaggedAt: { isNotNull: true } },
        ...sessionShape,
        orderBy: { dueAt: "desc" },
        limit: 50,
      })
    ),

  /** One cow's lactation as the system derives it — never as anyone typed it. */
  forAnimal: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ tagNumber: z.string().trim().min(1).max(32) }))
    .handler(async ({ context, input }) => {
      const beast = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: {
          tagNumber: true,
          state: true,
          lactationNumber: true,
          lactationStartedAt: true,
          milkWithdrawalUntil: true,
        },
        with: {
          milkRecords: {
            columns: {
              litres: true,
              destination: true,
              forced: true,
              lactationNumber: true,
              recordedAt: true,
            },
            orderBy: { recordedAt: "desc" },
            limit: RECENT_RECORDS,
          },
        },
      });
      if (!beast) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      // Only what she gave in the Lactation she is in: an earlier one is a different curve,
      // and a total spanning both would be a number that means nothing.
      const records = beast.milkRecords.filter(
        (record) => record.lactationNumber === beast.lactationNumber
      );
      return {
        tagNumber: beast.tagNumber,
        ...lactationView(beast, context.clock.now()),
        lactationLitres: roundLitres(
          records.reduce((total, record) => total + litresOf(record.litres), 0)
        ),
        records,
      };
    }),
};
