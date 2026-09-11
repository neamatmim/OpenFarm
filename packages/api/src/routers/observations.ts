import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const MAX_ROWS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export const observationsRouter = {
  /**
   * What the rounds have noticed lately, newest first — every animal at once, which is the
   * point: the Manager wants the cows seen bulling this week without opening seven
   * Instances and remembering what was in them.
   */
  recent: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(
      z
        .object({
          /** One kind of thing seen, by the Version's own word for it. */
          saw: z.string().trim().max(60).optional(),
          days: z.number().int().min(1).max(MAX_DAYS).default(DEFAULT_DAYS),
        })
        .default(() => ({ days: DEFAULT_DAYS }))
    )
    .handler(async ({ context, input }) => {
      const since = new Date(context.clock.now().getTime() - input.days * DAY_MS);
      const rows = await context.db.query.observation.findMany({
        where: {
          farmId: context.farm.id,
          seenAt: { gte: since },
          // What was withdrawn by a Correction is kept, but it is not what the farm saw.
          withdrawnAt: { isNull: true },
          ...(input.saw ? { saw: input.saw } : {}),
        },
        orderBy: { seenAt: "desc" },
        limit: MAX_ROWS,
        with: {
          animal: { columns: { tagNumber: true, penId: true } },
          observer: { columns: { name: true } },
          completion: { columns: { instanceId: true } },
        },
      });
      return rows.map(({ animal, observer, completion, ...seen }) => ({
        ...seen,
        tagNumber: animal.tagNumber,
        penId: animal.penId,
        seenByName: observer?.name ?? null,
        instanceId: completion.instanceId,
      }));
    }),

  /** The words the farm's rounds have actually used lately, for the filter to offer. */
  kinds: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(
      z
        .object({
          days: z.number().int().min(1).max(MAX_DAYS).default(DEFAULT_DAYS),
        })
        .default(() => ({ days: DEFAULT_DAYS }))
    )
    .handler(async ({ context, input }) => {
      const since = new Date(context.clock.now().getTime() - input.days * DAY_MS);
      const rows = await context.db.query.observation.findMany({
        where: {
          farmId: context.farm.id,
          seenAt: { gte: since },
          withdrawnAt: { isNull: true },
        },
        columns: { saw: true, sawLabel: true },
        limit: MAX_ROWS,
      });
      const seen = new Map<string, string>();
      for (const row of rows) {
        seen.set(row.saw, row.sawLabel);
      }
      return [...seen].map(([saw, label]) => ({ saw, label }));
    }),
};
