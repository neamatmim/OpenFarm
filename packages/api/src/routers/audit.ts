import { z } from "zod";

import { farmDay, startOfFarmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const LIMIT_MAX = 200;
const LIMIT_DEFAULT = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** The audit log. Owner and Manager see everything; every other Role sees only their own
 *  actions. Day filters are farm-local, half-open: [fromDay 00:00, toDay + 1 day 00:00). */
export const auditRouter = {
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z
        .object({
          entity: z.string().min(1).optional(),
          entityId: z.string().min(1).optional(),
          actorId: z.string().min(1).optional(),
          fromDay: farmDay.optional(),
          toDay: farmDay.optional(),
          limit: z.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
        })
        .default({ limit: LIMIT_DEFAULT })
    )
    .handler(async ({ context, input }) => {
      const seesAll =
        context.roleUsed === "owner" || context.roleUsed === "manager";
      const actorId = seesAll ? input.actorId : context.actor.id;
      const from = input.fromDay ? startOfFarmDay(input.fromDay) : undefined;
      const toExclusive = input.toDay
        ? new Date(startOfFarmDay(input.toDay).getTime() + ONE_DAY_MS)
        : undefined;
      const rows = await context.db.query.auditEvent.findMany({
        where: {
          farmId: context.farm.id,
          entity: input.entity,
          entityId: input.entityId,
          actorId,
          receivedAt: { gte: from, lt: toExclusive },
        },
        orderBy: { receivedAt: "desc" },
        limit: input.limit,
        with: { actor: { columns: { name: true } } },
      });
      return rows;
    }),
};
