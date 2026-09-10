import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";

import { o } from "./index";

export type { RoleName } from "@OpenFarm/db/schema/farm";

/** Highest privilege first — the Role recorded when several held Roles would do. */
const PRECEDENCE: readonly RoleName[] = ["owner", "manager", "vet", "staff"];

export const pickRoleUsed = (
  held: readonly RoleName[],
  allowed: readonly RoleName[]
): RoleName | null =>
  PRECEDENCE.find((role) => held.includes(role) && allowed.includes(role)) ??
  null;

/** Requires a signed-in, enabled person holding any of `allowed`; puts `roleUsed` on the context. */
export const requireRole = (...allowed: RoleName[]) =>
  o.middleware(({ context, next }) => {
    const { session } = context;
    const expired = session
      ? session.session.expiresAt <= context.clock.now()
      : true;
    if (!session?.user || expired || context.person?.disabledAt) {
      throw new ORPCError("UNAUTHORIZED");
    }
    const roleUsed = pickRoleUsed(context.roles, allowed);
    if (!roleUsed) {
      throw new ORPCError("FORBIDDEN");
    }
    return next({ context: { session, roleUsed } });
  });
