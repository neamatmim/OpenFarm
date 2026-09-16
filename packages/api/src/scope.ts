import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";

/**
 * What a person may see and record acting under one Role (the glossary's Scope): the whole farm for the Owner, the
 * Manager and a Vet; their Pen Assignment for Barn Staff; their Visiting Scope for a Vet called in for a visit; and
 * both together for Barn Staff who are also visiting. Worked out from the Role a piece of work is done under — never
 * from the highest Role they hold — so it carries the Role it was worked out for.
 */
export type Scope =
  /** Somebody working under no Role sees and records nothing; the Role check refuses them before this matters. */
  | { kind: "nothing" }
  | { kind: "farm"; role: RoleName }
  | { kind: "pens"; role: RoleName; penIds: readonly string[] }
  | { kind: "cases"; role: RoleName; caseAnimalIds: readonly string[] }
  | {
      kind: "pens_or_cases";
      role: RoleName;
      penIds: readonly string[];
      caseAnimalIds: readonly string[];
    };

/** Who a person is on this farm, as far as their Scope goes. */
export interface PersonOnTheFarm {
  roles: readonly RoleName[];
  visiting: boolean;
  penIds: readonly string[];
  caseAnimalIds: readonly string[];
}

/**
 * Their Scope under the Role this work is done under. A visit narrows only what they do as the Vet: Barn Staff who are
 * also called in keep their Pens, and have their Cases besides.
 */
export const scopeOf = (
  person: Omit<PersonOnTheFarm, "roles">,
  role: RoleName | null
): Scope => {
  switch (role) {
    case "owner":
    case "manager": {
      return { kind: "farm", role };
    }
    case "vet": {
      return person.visiting
        ? { kind: "cases", role, caseAnimalIds: person.caseAnimalIds }
        : { kind: "farm", role };
    }
    case "staff": {
      return person.visiting && person.caseAnimalIds.length > 0
        ? {
            kind: "pens_or_cases",
            role,
            penIds: person.penIds,
            caseAnimalIds: person.caseAnimalIds,
          }
        : { kind: "pens", role, penIds: person.penIds };
    }
    default: {
      return { kind: "nothing" };
    }
  }
};

/** The Role a piece of work is done under, and the Scope it gives them — chosen together, so neither is ever set
 *  without the other. */
export const workingAs = (
  person: Omit<PersonOnTheFarm, "roles">,
  role: RoleName
) => ({ roleUsed: role, scope: scopeOf(person, role) });

/** Their Scope under each Role they hold, for a screen that has to show what each of their Roles lets them do. */
export const scopesOf = (
  person: PersonOnTheFarm
): Partial<Record<RoleName, Scope>> =>
  Object.fromEntries(person.roles.map((role) => [role, scopeOf(person, role)]));

/** Whether every Role they hold is a Vet on a visit: somebody the farm at large, and its settings, are not for. */
export const onlyOnAVisit = (person: PersonOnTheFarm): boolean =>
  person.roles.length > 0 &&
  person.roles.every((role) => scopeOf(person, role).kind === "cases");

const hasPen = (scope: Scope, penId: string | null): boolean =>
  "penIds" in scope && penId !== null && scope.penIds.includes(penId);

const hasCase = (scope: Scope, animalId: string | null): boolean =>
  "caseAnimalIds" in scope &&
  animalId !== null &&
  scope.caseAnimalIds.includes(animalId);

/** Whether an animal is theirs to record about: in their Pens, or on their Cases. */
export const isAnimalInScope = (
  scope: Scope,
  animal: { id: string; penId: string | null }
): boolean =>
  scope.kind === "farm" ||
  hasPen(scope, animal.penId) ||
  hasCase(scope, animal.id);

/**
 * Whether they may look her up by her Tag Number and read what she is. Barn Staff may look up any animal, read-only,
 * whichever Pen she stands in (roles matrix: "read-only lookup of any animal by Tag Number"); a Vet on a visit only the
 * animals on their Cases.
 */
export const mayLookUp = (scope: Scope, animal: { id: string }): boolean =>
  scope.kind !== "nothing" &&
  (scope.kind !== "cases" || hasCase(scope, animal.id));

/** Whether she is on one of their Cases — what lets Barn Staff who are also visiting read her as the Vet would. */
export const isOnTheirCase = (scope: Scope, animalId: string): boolean =>
  hasCase(scope, animalId);

/**
 * Whether what the Vet concluded is theirs to read: the Diagnoses on her page, the Prescriptions that followed,
 * what she is said to have died of.
 *
 * Barn Staff record what they see and give the doses they are told to give; the conclusions drawn from them are
 * not theirs (roles matrix: Staff read treatment instances only). They still read the round's own Observations —
 * what somebody saw is not a conclusion — and Barn Staff who are also the visiting Vet on her Case read what a
 * Vet reads.
 */
export const readsTheClinicalRecord = (
  who: { roleUsed: RoleName | null; scope: Scope },
  animalId: string
): boolean => who.roleUsed !== "staff" || isOnTheirCase(who.scope, animalId);

/**
 * Whether what she cost and what she fetched are theirs to read.
 *
 * The Intake and Sale rows of the roles matrix: `R` to the Owner, `C R U` to the Manager, and nothing to anybody
 * else. A milker weighs her and a Vet treats her without being told what she cost.
 */
export const readsWhatSheCost = (who: { roleUsed: RoleName | null }): boolean =>
  who.roleUsed === "owner" || who.roleUsed === "manager";

/** Whether a Pen is theirs to act in — to walk an animal into or out of. A visit is to animals, not Pens. */
export const isPenInScope = (scope: Scope, penId: string): boolean =>
  scope.kind === "farm" || hasPen(scope, penId);

/**
 * Whether a piece of work is theirs to see and do: work in their Pens; work about an animal on their Cases; and work
 * about the whole farm, which is in no Pen — theirs when it is for the Role they work under, and nobody's to keep from
 * those who run the farm. A Vet on a visit has none of the farm's own work.
 */
export const isWorkInScope = (
  scope: Scope,
  work: { penId: string | null; animalId: string | null; assignedRole: string }
): boolean => {
  if (scope.kind === "farm") {
    return true;
  }
  const farmWideAndTheirs =
    work.penId === null &&
    "penIds" in scope &&
    work.assignedRole === scope.role;
  return (
    farmWideAndTheirs ||
    hasPen(scope, work.penId) ||
    hasCase(scope, work.animalId)
  );
};

/**
 * Why something is not theirs. To a Vet on a visit it is not there at all, so it is not found; Barn Staff know the
 * farm's Pens are there and not theirs, and are told so; somebody working under no Role has nothing.
 */
export const outOfScope = (scope: Scope) => {
  switch (scope.kind) {
    case "cases": {
      return new ORPCError("NOT_FOUND", { message: "Not one of your cases" });
    }
    case "nothing": {
      return new ORPCError("FORBIDDEN");
    }
    default: {
      return new ORPCError("FORBIDDEN", { message: "That pen is not yours" });
    }
  }
};

/** Refuses an animal that is not theirs to record about. */
export const requireAnimalInScope = (
  scope: Scope,
  animal: { id: string; penId: string | null }
) => {
  if (!isAnimalInScope(scope, animal)) {
    throw outOfScope(scope);
  }
};

/** Refuses an animal they may not look up. */
export const requireLookUp = (scope: Scope, animal: { id: string }) => {
  if (!mayLookUp(scope, animal)) {
    throw outOfScope(scope);
  }
};

/** Refuses a Pen that is not theirs to act in. */
export const requirePenInScope = (scope: Scope, penId: string) => {
  if (!isPenInScope(scope, penId)) {
    throw outOfScope(scope);
  }
};

/** Refuses a piece of work that is not theirs. */
export const requireWorkInScope = (
  scope: Scope,
  work: { penId: string | null; animalId: string | null; assignedRole: string }
) => {
  if (!isWorkInScope(scope, work)) {
    throw outOfScope(scope);
  }
};

/**
 * Refuses a clinical record — a Diagnosis, a Prescription, an abortion — about an animal a Vet may not reach: any
 * animal is a Vet's on the farm's staff, and a Vet on a visit has their Cases'. Only for work the Vet alone does.
 */
export const requireClinicalInScope = (scope: Scope, animalId: string) => {
  if (scope.kind === "cases" && !hasCase(scope, animalId)) {
    throw outOfScope(scope);
  }
};

/**
 * The clinical records a Vet may read, as a query asks for them: every animal's for a Vet on the farm's staff, their
 * Cases' for a visit. Only for records the Vet alone reads.
 */
export const clinicalRecordsInScope = (scope: Scope) =>
  scope.kind === "cases" ? { animalId: { in: [...scope.caseAnimalIds] } } : {};

/** Their Pens, or the one of them they asked for — never a Pen that is not theirs, and never all of theirs quietly
 *  when they asked for one. */
const pensAsked = (penIds: readonly string[], penId?: string): string[] =>
  penId ? penIds.filter((id) => id === penId) : [...penIds];

/**
 * What they may see, as a query over rows about animals asks for it — the animals themselves (`id`), or work about
 * them (`animalId`), which also answers for work about the whole farm that is for their Role — narrowed to one Pen when
 * they ask for one.
 */
const inScopeWhere = (
  scope: Scope,
  {
    animalKey,
    penId,
    work,
  }: { animalKey: "id" | "animalId"; penId?: string; work: boolean }
) => {
  const inPen = penId ? { penId } : {};
  const farmWide =
    work && !penId && "penIds" in scope
      ? [{ penId: { isNull: true as const }, assignedRole: scope.role }]
      : [];
  switch (scope.kind) {
    case "nothing": {
      return { [animalKey]: { in: [] as string[] } };
    }
    case "farm": {
      return inPen;
    }
    case "cases": {
      return { [animalKey]: { in: [...scope.caseAnimalIds] }, ...inPen };
    }
    case "pens": {
      return {
        OR: [{ penId: { in: pensAsked(scope.penIds, penId) } }, ...farmWide],
      };
    }
    default: {
      return {
        OR: [
          { penId: { in: pensAsked(scope.penIds, penId) } },
          { [animalKey]: { in: [...scope.caseAnimalIds] }, ...inPen },
          ...farmWide,
        ],
      };
    }
  }
};

/** The animals they may see, as a query asks for them. */
export const animalsInScopeWhere = (scope: Scope, penId?: string) =>
  inScopeWhere(scope, { animalKey: "id", penId, work: false });

/** The work they may see, as a query asks for it: work about the whole farm that is for their Role included. */
export const workInScopeWhere = (scope: Scope, penId?: string) =>
  inScopeWhere(scope, { animalKey: "animalId", penId, work: true });
