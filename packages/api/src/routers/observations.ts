import { uuidv7 } from "@OpenFarm/db/ids";

import { audited } from "../audit";
import { MAX_SEEN_ROWS, seenLately, seenLatelyInput } from "../health-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";
import { recordSighting, sightingInput } from "../sighting-store";

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
        instanceId: completion?.instanceId ?? null,
      }));
    }),

  /**
   * Something seen of an animal with no round asking — a limp at the gate, a cow bulling in the yard. Anybody who
   * handles the animals may say so; Barn Staff for the Pens they work.
   */
  record: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(sightingInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "observation",
          entityId: id,
          action: "create",
          after: input,
        },
        async (tx) => {
          await recordSighting(tx, context, input, { seenAt: now, now, id });
        }
      );
      return { id };
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
