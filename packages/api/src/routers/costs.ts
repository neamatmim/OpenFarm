import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { costsBySide, economicsOfAnimal, farmCosts } from "../cost-store";
import { protectedProcedure } from "../index";
import { periodInput, periodOf } from "../period";
import { requireRole } from "../roles";

export const costsRouter = {
  /**
   * What one animal has cost and earned over her whole time on the farm: the feed charged to her, her
   * doses, what she was bought and sold for and the margin between, and what a litre of hers cost.
   *
   * The Owner's and the Manager's (roles matrix: finance reports — R). Barn Staff and the Vet see none of
   * it: it is money.
   */
  ofAnimal: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ tagNumber: z.string().trim().min(1).max(32) }))
    .handler(async ({ context, input }) => {
      const animal = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: { id: true, side: true },
      });
      if (!animal) {
        throw new ORPCError("NOT_FOUND", {
          message: `No animal with tag ${input.tagNumber}`,
        });
      }
      const costs = await farmCosts(context.db, context.farm.id);
      return { side: animal.side, ...economicsOfAnimal(costs, animal.id) };
    }),

  /** A period added up by Side: which side of the farm makes money. The Owner's and the Manager's. */
  bySide: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object(periodInput))
    .handler(async ({ context, input }) => {
      const range = periodOf(input);
      const costs = await farmCosts(context.db, context.farm.id);
      return costsBySide(costs, range);
    }),
};
