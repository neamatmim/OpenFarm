import { farm, roleAssignment } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";

/** First-run setup: the signed-in person names the Farm and becomes its Owner.
 *  Refused once a Farm exists — after that, people arrive by invitation. */
export const farmRouter = {
  bootstrap: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1) }))
    .handler(async ({ context, input }) => {
      if (context.farm) {
        throw new ORPCError("CONFLICT", { message: "The farm already exists" });
      }
      const now = context.clock.now();
      const farmId = crypto.randomUUID();
      await context.db.transaction(async (tx) => {
        await tx
          .insert(farm)
          .values({ id: farmId, name: input.name, createdAt: now });
        await tx.insert(roleAssignment).values({
          id: crypto.randomUUID(),
          farmId,
          userId: context.session.user.id,
          role: "owner",
          grantedBy: context.session.user.id,
          grantedByRole: "owner",
          createdAt: now,
        });
      });
      return { id: farmId, name: input.name };
    }),
  current: protectedProcedure.handler(({ context }) => context.farm),
};
