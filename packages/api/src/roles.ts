import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ORPCError, os } from "@orpc/server";

import type { Context, Session } from "./context";

export type { RoleName } from "@OpenFarm/db/schema/farm";
export { ROLES } from "@OpenFarm/db/schema/farm";

/** Highest privilege first — the Role recorded when several held Roles would do. */
const PRECEDENCE: readonly RoleName[] = ["owner", "manager", "vet", "staff"];

export const pickRoleUsed = (
  held: readonly RoleName[],
  allowed: readonly RoleName[]
): RoleName | null =>
  PRECEDENCE.find((role) => held.includes(role) && allowed.includes(role)) ??
  null;

/** Runs after requireAuth (the session is already known good). Requires any of `allowed`
 *  and narrows the context: the Role used and the Farm are certain from here on. */
export const requireRole = (...allowed: RoleName[]) =>
  os
    .$context<Context & { session: Session }>()
    .middleware(({ context, next }) => {
      const roleUsed = pickRoleUsed(context.roles, allowed);
      if (!roleUsed || !context.farm) {
        throw new ORPCError("FORBIDDEN");
      }
      return next({ context: { roleUsed, farm: context.farm } });
    });
