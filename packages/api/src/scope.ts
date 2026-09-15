import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ORPCError } from "@orpc/server";

/**
 * What a person may see and record acting under one Role (the glossary's Scope): the whole farm for the Owner, the
 * Manager and a Vet; their Pen Assignment for Barn Staff; their Visiting Scope for a Vet called in for a visit; and
 * both together for Barn Staff who are also visiting. Worked out from the Role a piece of work is done under — never
 * from the highest Role they hold — so it is worked out after the Role is chosen.
 */
export type Scope =
  /** A request acting under no Role reaches nothing; the Role check refuses it before it gets this far. */
  | { kind: "nothing" }
  | { kind: "farm" }
  | { kind: "pens"; penIds: readonly string[] }
  | { kind: "cases"; caseAnimalIds: readonly string[] }
  | {
      kind: "pens_or_cases";
      penIds: readonly string[];
      caseAnimalIds: readonly string[];
    };

/** What Scope is worked out from: who the person is on this farm. */
export interface ScopeOf {
  visiting: boolean;
  penIds: readonly string[];
  caseAnimalIds: readonly string[];
}

/**
 * Their Scope under the Role this work is done under. A visit narrows only what they do as the Vet: Barn Staff who are
 * also called in keep their Pens, and have their Cases besides.
 */
export const scopeOf = (person: ScopeOf, roleUsed: RoleName | null): Scope => {
  switch (roleUsed) {
    case "owner":
    case "manager": {
      return { kind: "farm" };
    }
    case "vet": {
      return person.visiting
        ? { kind: "cases", caseAnimalIds: person.caseAnimalIds }
        : { kind: "farm" };
    }
    case "staff": {
      return person.visiting && person.caseAnimalIds.length > 0
        ? {
            kind: "pens_or_cases",
            penIds: person.penIds,
            caseAnimalIds: person.caseAnimalIds,
          }
        : { kind: "pens", penIds: person.penIds };
    }
    default: {
      return { kind: "nothing" };
    }
  }
};

const hasPen = (scope: Scope, penId: string | null): boolean =>
  "penIds" in scope && penId !== null && scope.penIds.includes(penId);

const hasCase = (scope: Scope, animalId: string | null): boolean =>
  "caseAnimalIds" in scope &&
  animalId !== null &&
  scope.caseAnimalIds.includes(animalId);

/** Whether an animal is theirs to see and record about: in their Pens, or on their Cases. */
export const mayTouchAnimal = (
  scope: Scope,
  animal: { id: string; penId: string | null }
): boolean =>
  scope.kind === "farm" ||
  hasPen(scope, animal.penId) ||
  hasCase(scope, animal.id);

/** Whether a Pen is theirs to act in — to walk an animal into or out of. A visit reaches animals, not Pens. */
export const mayTouchPen = (scope: Scope, penId: string): boolean =>
  scope.kind === "farm" || hasPen(scope, penId);

/**
 * Whether a piece of work is theirs to see and do: work in their Pens, work about an animal on their Cases, and work
 * about the whole farm — which is in no Pen, and so in nobody's Pens to keep them from it — for anybody but a visitor.
 */
export const mayTouchWork = (
  scope: Scope,
  work: { penId: string | null; animalId: string | null }
): boolean => {
  if (scope.kind === "farm") {
    return true;
  }
  const farmWide = work.penId === null && "penIds" in scope;
  return farmWide || hasPen(scope, work.penId) || hasCase(scope, work.animalId);
};

/** Their Pens, or the one of them they asked for — never a Pen that is not theirs, and never all of theirs quietly
 *  when they asked for one. */
const pensAsked = (penIds: readonly string[], penId?: string): string[] =>
  penId ? penIds.filter((id) => id === penId) : [...penIds];

/** Refused as not found, because out of their Scope it is not there for them. */
export const outOfScope = () =>
  new ORPCError("NOT_FOUND", { message: "Not within your scope" });

/** The animals they may see, as a query asks for them, narrowed to one Pen when they ask for one. */
export const animalsInScope = (scope: Scope, penId?: string) => {
  const inPen = penId ? { penId } : {};
  switch (scope.kind) {
    case "nothing": {
      return { id: { in: [] as string[] } };
    }
    case "farm": {
      return inPen;
    }
    case "pens": {
      return { penId: { in: pensAsked(scope.penIds, penId) } };
    }
    case "cases": {
      return { id: { in: [...scope.caseAnimalIds] }, ...inPen };
    }
    default: {
      return {
        OR: [
          { penId: { in: pensAsked(scope.penIds, penId) } },
          { id: { in: [...scope.caseAnimalIds] }, ...inPen },
        ],
      };
    }
  }
};

/** The work they may see, as a query asks for it, narrowed to one Pen when they ask for one. */
export const workInScope = (scope: Scope, penId?: string) => {
  const inPen = penId ? { penId } : {};
  switch (scope.kind) {
    case "nothing": {
      return { id: { in: [] as string[] } };
    }
    case "farm": {
      return inPen;
    }
    case "pens": {
      return { penId: { in: pensAsked(scope.penIds, penId) } };
    }
    case "cases": {
      return { animalId: { in: [...scope.caseAnimalIds] }, ...inPen };
    }
    default: {
      return {
        OR: [
          { penId: { in: pensAsked(scope.penIds, penId) } },
          { animalId: { in: [...scope.caseAnimalIds] }, ...inPen },
        ],
      };
    }
  }
};
