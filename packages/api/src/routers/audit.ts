import { startOfFarmDay } from "@OpenFarm/domain";
import { z } from "zod";

import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const LIMIT_MAX = 200;
const LIMIT_DEFAULT = 50;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The records whose trail is the Owner's alone, because the records are: who trusted her with money and on what
 * paper, how much each put in and was paid, what each Venture's Units are and what the run made. The investors
 * page and every Venture's money refuse the Manager (roles matrix); a trail that showed him every field of them
 * before and after would be the same pages by another door.
 */
const OWNERS_TRAIL = [
  "investor",
  "investment_agreement",
  "venture",
  "venture_movement",
  "venture_settlement",
  "venture_bank_check",
] as const;

/** The audit log. Owner and Manager see everyone's actions, less the Owner's own records for the Manager; every
 *  other Role sees only their own actions. Day filters are farm-local, half-open: [fromDay 00:00, toDay + 1 day
 *  00:00). */
export const auditRouter = {
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet", { visitingVet: true }))
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
      // The Owner as the investor procedures know her: holding the Role, and on her own phone rather than a
      // Shed Phone somebody could pick up.
      const seesTheMoney = context.roles.includes("owner") && !context.device;
      const hidden: readonly string[] = seesTheMoney ? [] : OWNERS_TRAIL;
      if (input.entity && hidden.includes(input.entity)) {
        return [];
      }
      const actorId = seesAll ? input.actorId : context.actor.id;
      const from = input.fromDay ? startOfFarmDay(input.fromDay) : undefined;
      const toExclusive = input.toDay
        ? new Date(startOfFarmDay(input.toDay).getTime() + ONE_DAY_MS)
        : undefined;
      const rows = await context.db.query.auditEvent.findMany({
        where: {
          farmId: context.farm.id,
          entity:
            input.entity ??
            (hidden.length > 0 ? { notIn: [...hidden] } : undefined),
          entityId: input.entityId,
          actorId,
          receivedAt: { gte: from, lt: toExclusive },
        },
        // The id breaks the tie: two events can share a received instant — an entry and the Correction
        // that follows it in the same second — and uuidv7 carries a counter so ids made in one
        // millisecond still sort in the order they were made. Without it the trail reads back in
        // whatever order the rows happen to lie in.
        orderBy: { receivedAt: "desc", id: "desc" },
        limit: input.limit,
        with: { actor: { columns: { name: true } } },
      });
      return rows;
    }),
};
