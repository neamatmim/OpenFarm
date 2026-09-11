import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ORPCError, os } from "@orpc/server";

import type { Actor, Context } from "./context";

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

/** Runs after requireAuth (the principal is already known good). Requires any of `allowed`
 *  and narrows the context: the Role used and the Farm are certain from here on. */
export const requireRole = (...allowed: RoleName[]) =>
  os.$context<Context & { actor: Actor }>().middleware(({ context, next }) => {
    const roleUsed = pickRoleUsed(context.roles, allowed);
    if (!roleUsed || !context.farm) {
      throw new ORPCError("FORBIDDEN");
    }
    return next({ context: { roleUsed, farm: context.farm } });
  });

/** Some work must never come from a shared Shed Phone, whatever Role the active person
 *  holds: office work, and every clinical act a Vet signs (ADR 0003). */
export const requirePersonalSession = () =>
  os.$context<Context & { actor: Actor }>().middleware(({ context, next }) => {
    if (context.device) {
      throw new ORPCError("FORBIDDEN", {
        message: "This can only be done from your own phone, not a shed phone",
      });
    }
    return next();
  });
