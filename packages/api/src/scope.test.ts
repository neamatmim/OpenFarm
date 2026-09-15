import type { RoleName } from "@OpenFarm/db/schema/farm";
import { describe, expect, it } from "vitest";

import type { ScopeOf } from "./scope";
import {
  animalsInScope,
  mayLookUpAnimal,
  mayTouchAnimal,
  mayTouchPen,
  mayTouchWork,
  scopeOf,
  workInScope,
} from "./scope";

// Who may see and record what, for every kind of person the farm has, under every Role they may work under. No
// database: the rule is a rule about people, Pens and Cases, and the combinations are where it was got wrong before.

const THEIR_PEN = "pen-theirs";
const OTHER_PEN = "pen-other";
const ON_CASE = "animal-on-case";

/** An animal in their Pen, one on their Case standing in a Pen that is not theirs, one in neither. */
const inTheirPen = { id: "animal-in-pen", penId: THEIR_PEN };
const onTheirCase = { id: ON_CASE, penId: OTHER_PEN };
const neither = { id: "animal-neither", penId: OTHER_PEN };

const person = (who: {
  visiting?: boolean;
  pens?: boolean;
  cases?: boolean;
}): ScopeOf => ({
  visiting: who.visiting ?? false,
  penIds: who.pens ? [THEIR_PEN] : [],
  caseAnimalIds: who.cases ? [ON_CASE] : [],
});

interface Reaches {
  kind: string;
  inTheirPen: boolean;
  onTheirCase: boolean;
  neither: boolean;
  /** Looking up by her Tag Number an animal neither in their Pen nor on their Case. */
  lookUpNeither: boolean;
  /** Walking an animal into a Pen that is not theirs. */
  otherPen: boolean;
  /** Work about the whole farm, in no Pen. */
  farmWideWork: boolean;
}

const reaches = (who: ScopeOf, roleUsed: RoleName | null): Reaches => {
  const scope = scopeOf(who, roleUsed);
  return {
    kind: scope.kind,
    inTheirPen: mayTouchAnimal(scope, inTheirPen),
    onTheirCase: mayTouchAnimal(scope, onTheirCase),
    neither: mayTouchAnimal(scope, neither),
    lookUpNeither: mayLookUpAnimal(scope, neither),
    otherPen: mayTouchPen(scope, OTHER_PEN),
    farmWideWork: mayTouchWork(scope, { penId: null, animalId: null }),
  };
};

const FARM = {
  kind: "farm",
  inTheirPen: true,
  onTheirCase: true,
  neither: true,
  lookUpNeither: true,
  otherPen: true,
  farmWideWork: true,
};

describe("a person's Scope under the Role they work under", () => {
  it.each([
    ["the Owner", person({}), "owner", FARM],
    ["the Manager", person({}), "manager", FARM],
    ["a Vet on the farm's staff", person({}), "vet", FARM],
    [
      "Barn Staff",
      person({ pens: true }),
      "staff",
      {
        kind: "pens",
        inTheirPen: true,
        onTheirCase: false,
        neither: false,
        lookUpNeither: true,
        otherPen: false,
        farmWideWork: true,
      },
    ],
    [
      "a Vet called in for a visit",
      person({ visiting: true, cases: true }),
      "vet",
      {
        kind: "cases",
        inTheirPen: false,
        onTheirCase: true,
        neither: false,
        lookUpNeither: false,
        otherPen: false,
        farmWideWork: false,
      },
    ],
    [
      "Barn Staff also called in as a Vet, working the barn",
      person({ visiting: true, pens: true, cases: true }),
      "staff",
      {
        kind: "pens_or_cases",
        inTheirPen: true,
        onTheirCase: true,
        neither: false,
        lookUpNeither: true,
        otherPen: false,
        farmWideWork: true,
      },
    ],
    [
      "Barn Staff also called in as a Vet, doing the Vet's work",
      person({ visiting: true, pens: true, cases: true }),
      "vet",
      {
        kind: "cases",
        inTheirPen: false,
        onTheirCase: true,
        neither: false,
        lookUpNeither: false,
        otherPen: false,
        farmWideWork: false,
      },
    ],
    [
      "Barn Staff visiting with no Case open yet",
      person({ visiting: true, pens: true }),
      "staff",
      {
        kind: "pens",
        inTheirPen: true,
        onTheirCase: false,
        neither: false,
        lookUpNeither: true,
        otherPen: false,
        farmWideWork: true,
      },
    ],
    [
      "Barn Staff who are also the farm's Vet, as the Vet",
      person({ pens: true }),
      "vet",
      FARM,
    ],
    [
      "somebody working under no Role",
      person({ pens: true, cases: true }),
      null,
      {
        kind: "nothing",
        inTheirPen: false,
        onTheirCase: false,
        neither: false,
        lookUpNeither: false,
        otherPen: false,
        farmWideWork: false,
      },
    ],
  ] as const)("%s", (_who, who, roleUsed, expected) => {
    expect(reaches(who, roleUsed)).toEqual(expected);
  });
});

describe("what a query asks for", () => {
  it("never widens a Pen asked for to all of theirs, nor to a Pen that is not theirs", () => {
    const staff = scopeOf(person({ pens: true }), "staff");
    expect(animalsInScope(staff, OTHER_PEN)).toEqual({ penId: { in: [] } });
    expect(workInScope(staff, THEIR_PEN)).toEqual({
      penId: { in: [THEIR_PEN] },
    });
  });

  it("gives Barn Staff who are also visiting their Pens or their Cases, and a visitor only their Cases", () => {
    const both = scopeOf(
      person({ visiting: true, pens: true, cases: true }),
      "staff"
    );
    expect(workInScope(both)).toEqual({
      OR: [{ penId: { in: [THEIR_PEN] } }, { animalId: { in: [ON_CASE] } }],
    });
    const visitor = scopeOf(person({ visiting: true, cases: true }), "vet");
    expect(animalsInScope(visitor)).toEqual({ id: { in: [ON_CASE] } });
  });
});
