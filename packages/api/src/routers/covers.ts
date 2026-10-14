import { farmDayOf } from "@OpenFarm/domain";
import { z } from "zod";

import { audited } from "../audit";
import { coversOn, endCover, setCover } from "../cover-store";
import { protectedProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";

/**
 * Covers (the glossary's Cover): Barn Staff looking after somebody's Pens for the day they are away. Set and ended by
 * whoever runs the farm, from their own phone, on the trail; a Cover ends by itself when the farm day turns.
 */
export const coversRouter = {
  /** Today's Covers on the farm, the standing ones and those ended early. */
  today: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const day = farmDayOf(context.clock.now());
      return { day, covers: await coversOn(context.db, context.farm.id, day) };
    }),

  /** Sets today's Cover: one person's Pens looked after by another until the day turns. */
  set: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        absentUserId: z.string().min(1),
        coverUserId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let id = "";
      let released: string[] = [];
      return await audited(context).write(
        {
          entity: "cover",
          entityId: () => id,
          action: "create",
          after: () =>
            Promise.resolve({ ...input, day: farmDayOf(now), released }),
        },
        async (tx) => {
          const set = await setCover(tx, {
            farmId: context.farm.id,
            ...input,
            by: context.actor.id,
            now,
          });
          ({ id } = set.row);
          ({ released } = set);
          // The Cover this one replaced ended here: its own line on the trail, beside this one's.
          for (const old of set.replaced) {
            // oxlint-disable-next-line no-await-in-loop -- at most one standing Cover is replaced
            await audited(context).recordEvent(tx, {
              entity: "cover",
              entityId: old,
              action: "update",
              before: { endedAt: null },
              after: { endedAt: now, replacedBy: set.row.id },
            });
          }
          return set.row;
        }
      );
    }),

  /** Ends a Cover before the day turns: the one away came in after all, or the Manager changed his mind. */
  end: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      return await audited(context).write(
        {
          entity: "cover",
          entityId: input.id,
          action: "update",
          before: { endedAt: null },
          after: { endedAt: now },
        },
        (tx) =>
          endCover(tx, {
            farmId: context.farm.id,
            id: input.id,
            by: context.actor.id,
            now,
          })
      );
    }),
};
