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

/** The reasons a Role gate gives. A word, not a sentence: the screen says it in the
 *  reader's own language, so a new one is a decision taken here and there rather than a
 *  blank line on somebody's phone. */
export type RefusalReason =
  | "vet_only"
  | "manager_only"
  | "staff_or_manager_only";

/** Why a Role gate refused, for the gates whose answer a person needs to understand. */
export interface Refusal {
  /** For whoever reads a log. The screen composes what the person reads, in their language. */
  message: string;
  reason: RefusalReason;
}

/** One refusal shape for every "this is not yours to do", whether a gate raised it or a
 *  handler did. */
export const forbidden = (refusal: Refusal) =>
  new ORPCError("FORBIDDEN", {
    message: refusal.message,
    data: { refusal: refusal.reason },
  });

const roleGate = (allowed: readonly RoleName[], refusal?: Refusal) =>
  os.$context<Context & { actor: Actor }>().middleware(({ context, next }) => {
    const roleUsed = pickRoleUsed(context.roles, allowed);
    if (!roleUsed || !context.farm) {
      throw refusal ? forbidden(refusal) : new ORPCError("FORBIDDEN");
    }
    return next({ context: { roleUsed, farm: context.farm } });
  });

/** Runs after requireAuth (the principal is already known good). Requires any of `allowed`
 *  and narrows the context: the Role used and the Farm are certain from here on. */
export const requireRole = (...allowed: RoleName[]) => roleGate(allowed);

/**
 * The same gate, for work exactly one Role may ever do — and which therefore owes an
 * explanation. A bare "forbidden" sends a Manager looking for a permission to change, and
 * there is none to find: a Diagnosis is the Vet's act in law, not a setting on the farm.
 *
 * One Role, not several: a person holding it is acting under it whatever else they hold, so
 * the Role recorded is the one the work belongs to rather than the highest they happen to
 * have.
 */
export const requireOnly = (role: RoleName, refusal: Refusal) =>
  roleGate([role], refusal);

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
