import { uuidv7 } from "@OpenFarm/db/ids";
import { sql } from "@OpenFarm/db/operators";
import { farm, roleAssignment } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";

/** One advisory lock key for "creating the farm", so concurrent first-run submissions serialise. */
const BOOTSTRAP_LOCK = 7001;

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
      const farmId = uuidv7(now);
      const ownerId = context.actor.id;
      await audited(context, farmId).write(
        {
          entity: "farm",
          entityId: farmId,
          action: "create",
          after: { name: input.name, ownerId },
        },
        async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`
          );
          const existing = await tx.query.farm.findFirst({
            columns: { id: true },
          });
          if (existing) {
            throw new ORPCError("CONFLICT", {
              message: "The farm already exists",
            });
          }
          await tx
            .insert(farm)
            .values({ id: farmId, name: input.name, createdAt: now });
          await tx.insert(roleAssignment).values({
            id: uuidv7(now),
            farmId,
            userId: ownerId,
            role: "owner",
            grantedBy: ownerId,
            grantedByRole: "owner",
            createdAt: now,
          });
        }
      );
      return { id: farmId, name: input.name };
    }),
  current: protectedProcedure.handler(({ context }) => context.farm),
};
