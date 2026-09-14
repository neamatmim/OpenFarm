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
  | "visiting_vet"
  | "vet_only"
  | "manager_only"
  | "owner_only"
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

/**
 * What a visiting Vet can reach: their own cases' animals, what the Vet does for them, the Drug List and the
 * notifiable-disease list to do it with, and their own notices and trail. Everything else on the farm is not
 * theirs to see (roles matrix, Vet (visiting)). The procedures listed still narrow themselves to the Cases.
 */
export const VISITING_VET_REACH: ReadonlySet<string> = new Set([
  "alerts.sweep",
  "alerts.digest",
  "alerts.mine",
  "alerts.dismiss",
  "animals.list",
  "animals.byTag",
  "animals.photo",
  "audit.list",
  "breeding.recordAbortion",
  "breeding.correctAbortion",
  "diagnoses.record",
  "diagnoses.correct",
  "diagnoses.waiting",
  "diagnoses.mine",
  "drugs.list",
  "herd.list",
  "instances.ensureDue",
  "instances.today",
  "instances.get",
  "instances.claim",
  "instances.completeStep",
  "instances.correctStep",
  "instances.complete",
  "milk.forAnimal",
  "notifiable.list",
  "observations.record",
  "papers.passport",
  "papers.withdrawalSummary",
  "prescriptions.prescribe",
  "prescriptions.forAnimal",
  "push.key",
  "push.listen",
  "push.stopListening",
  "sops.card",
  "sops.get",
  "sops.version",
  "sync.batch",
  "vetCases.close",
  "vetCases.mine",
]);

const VISITING_VET: Refusal = {
  message: "A visiting vet sees only the animals on their cases",
  reason: "visiting_vet",
};

const roleGate = (allowed: readonly RoleName[], refusal?: Refusal) =>
  os
    .$context<Context & { actor: Actor }>()
    .middleware(({ context, next, path }) => {
      const roleUsed = pickRoleUsed(context.roles, allowed);
      if (!roleUsed || !context.farm) {
        throw refusal ? forbidden(refusal) : new ORPCError("FORBIDDEN");
      }
      if (
        roleUsed === "vet" &&
        context.visiting &&
        !VISITING_VET_REACH.has(path.join("."))
      ) {
        throw forbidden(VISITING_VET);
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
