import { and, eq, isNull, lte } from "@OpenFarm/db/operators";
import { roleAssignment } from "@OpenFarm/db/schema/farm";
import { vetCase } from "@OpenFarm/db/schema/health";

import { audited } from "./audit";
import type { Context } from "./context";

// A visiting Vet's days on the farm, and what happens when they run out. Here rather than in the router that lets a
// Vet be called in, because the farm's own day turning is what ends a visit — nobody asks for it.

/**
 * Ends every visit whose day has passed: the Role is revoked on the day it ran out, and the visiting Vet's open Cases
 * close with it. Run as the farm's day turns; a request already refuses an expired visit before this gets round to it.
 */
export const endExpiredVisits = async (
  context: Context & { farm: NonNullable<Context["farm"]> }
): Promise<number> => {
  const now = context.clock.now();
  const ended = await context.db.query.roleAssignment.findMany({
    where: {
      farmId: context.farm.id,
      role: "vet",
      scope: "visiting",
      revokedAt: { isNull: true },
      expiresAt: { lte: now },
    },
    columns: { id: true, userId: true, expiresAt: true },
  });
  for (const visit of ended) {
    // oxlint-disable-next-line no-await-in-loop
    await audited(context).write(
      {
        entity: "user",
        entityId: visit.userId,
        action: "update",
        after: {
          visitEndedAt: visit.expiresAt?.toISOString() ?? null,
          source: "visit ran out",
        },
      },
      async (tx) => {
        await tx
          .update(roleAssignment)
          .set({ revokedAt: visit.expiresAt ?? now })
          .where(
            and(
              eq(roleAssignment.id, visit.id),
              isNull(roleAssignment.revokedAt),
              lte(roleAssignment.expiresAt, now)
            )
          );
        await tx
          .update(vetCase)
          .set({ closedAt: now })
          .where(
            and(
              eq(vetCase.farmId, context.farm.id),
              eq(vetCase.vetId, visit.userId),
              isNull(vetCase.closedAt)
            )
          );
      }
    );
  }
  return ended.length;
};
