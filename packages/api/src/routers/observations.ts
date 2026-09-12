import { MAX_SEEN_ROWS, seenLately, seenLatelyInput } from "../health-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** A week is the Manager's question: which cows were seen bulling since Friday. */
const MANAGER_WINDOW_DAYS = 7;

export const observationsRouter = {
  /**
   * What the rounds have noticed lately, newest first — every animal at once, which is the
   * point: the Manager wants the cows seen bulling this week without opening seven
   * Instances and remembering what was in them.
   */
  recent: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(seenLatelyInput(MANAGER_WINDOW_DAYS))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.observation.findMany({
        where: seenLately({
          farmId: context.farm.id,
          saw: input.saw,
          days: input.days,
          now: context.clock.now(),
        }),
        orderBy: { seenAt: "desc" },
        limit: MAX_SEEN_ROWS,
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
    .input(seenLatelyInput(MANAGER_WINDOW_DAYS))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.observation.findMany({
        where: seenLately({
          farmId: context.farm.id,
          days: input.days,
          now: context.clock.now(),
        }),
        columns: { saw: true, sawLabel: true },
        limit: MAX_SEEN_ROWS,
      });
      const seen = new Map<string, string>();
      for (const row of rows) {
        seen.set(row.saw, row.sawLabel);
      }
      return [...seen].map(([saw, label]) => ({ saw, label }));
    }),
};
