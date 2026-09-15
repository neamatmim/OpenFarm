import type { RoleName } from "@OpenFarm/db/schema/farm";
import { describe, expect, it } from "vitest";

import type { PersonOnTheFarm } from "./scope";
import {
  animalsInScopeWhere,
  isAnimalInScope,
  isPenInScope,
  isWorkInScope,
  mayLookUp,
  onlyOnAVisit,
  scopeOf,
  scopesOf,
  workInScopeWhere,
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
  roles?: RoleName[];
  visiting?: boolean;
  pens?: boolean;
  cases?: boolean;
}): PersonOnTheFarm => ({
  roles: who.roles ?? [],
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
  /** Work about the whole farm, in no Pen, for Barn Staff to do. */
  farmWideStaffWork: boolean;
  /** Work about the whole farm, in no Pen, for the Owner to do. */
  farmWideOwnerWork: boolean;
}

const reaches = (who: PersonOnTheFarm, role: RoleName | null): Reaches => {
  const scope = scopeOf(who, role);
  const farmWide = (assignedRole: string) =>
    isWorkInScope(scope, { penId: null, animalId: null, assignedRole });
  return {
    kind: scope.kind,
    inTheirPen: isAnimalInScope(scope, inTheirPen),
    onTheirCase: isAnimalInScope(scope, onTheirCase),
    neither: isAnimalInScope(scope, neither),
    lookUpNeither: mayLookUp(scope, neither),
    otherPen: isPenInScope(scope, OTHER_PEN),
    farmWideStaffWork: farmWide("staff"),
    farmWideOwnerWork: farmWide("owner"),
  };
};

const FARM = {
  kind: "farm",
  inTheirPen: true,
  onTheirCase: true,
  neither: true,
  lookUpNeither: true,
  otherPen: true,
  farmWideStaffWork: true,
  farmWideOwnerWork: true,
};

const PENS = {
  kind: "pens",
  inTheirPen: true,
  onTheirCase: false,
  neither: false,
  lookUpNeither: true,
  otherPen: false,
  farmWideStaffWork: true,
  farmWideOwnerWork: false,
};

const CASES = {
  kind: "cases",
  inTheirPen: false,
  onTheirCase: true,
  neither: false,
  lookUpNeither: false,
  otherPen: false,
  farmWideStaffWork: false,
  farmWideOwnerWork: false,
};

describe("a person's Scope under the Role they work under", () => {
  it.each([
    ["the Owner", person({}), "owner", FARM],
    ["the Manager", person({}), "manager", FARM],
    ["a Vet on the farm's staff", person({}), "vet", FARM],
    ["Barn Staff", person({ pens: true }), "staff", PENS],
    [
      "a Vet called in for a visit",
      person({ visiting: true, cases: true }),
      "vet",
      CASES,
    ],
    [
      "Barn Staff also called in as a Vet, working the barn",
      person({ visiting: true, pens: true, cases: true }),
      "staff",
      { ...PENS, kind: "pens_or_cases", onTheirCase: true },
    ],
    [
      "Barn Staff also called in as a Vet, doing the Vet's work",
      person({ visiting: true, pens: true, cases: true }),
      "vet",
      CASES,
    ],
    [
      "Barn Staff visiting with no Case open yet",
      person({ visiting: true, pens: true }),
      "staff",
      PENS,
    ],
    [
      "Barn Staff who are also the farm's Vet, as the Vet",
      person({ pens: true }),
      "vet",
      FARM,
    ],
    [
      "Barn Staff who are also the farm's Vet, working the barn",
      person({ pens: true }),
      "staff",
      PENS,
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
        farmWideStaffWork: false,
        farmWideOwnerWork: false,
      },
    ],
  ] as const)("%s", (_who, who, role, expected) => {
    expect(reaches(who, role)).toEqual(expected);
  });
});

describe("a person's Scope under each Role they hold", () => {
  it("tells a screen their Pens as Barn Staff even when another Role they hold sees the whole farm", () => {
    const both = person({ roles: ["staff", "vet"], pens: true });
    expect(scopesOf(both)).toEqual({
      staff: { kind: "pens", role: "staff", penIds: [THEIR_PEN] },
      vet: { kind: "farm", role: "vet" },
    });
  });

  it("is only on a visit when every Role they hold is a Vet on a visit", () => {
    expect(
      onlyOnAVisit(person({ roles: ["vet"], visiting: true, cases: true }))
    ).toBe(true);
    expect(
      onlyOnAVisit(
        person({
          roles: ["staff", "vet"],
          visiting: true,
          pens: true,
          cases: true,
        })
      )
    ).toBe(false);
    expect(onlyOnAVisit(person({}))).toBe(false);
  });
});

describe("what a query asks for", () => {
  it("never widens a Pen asked for to all of theirs, nor to a Pen that is not theirs", () => {
    const staff = scopeOf(person({ pens: true }), "staff");
    expect(animalsInScopeWhere(staff, OTHER_PEN)).toEqual({
      OR: [{ penId: { in: [] } }],
    });
    expect(workInScopeWhere(staff, THEIR_PEN)).toEqual({
      OR: [{ penId: { in: [THEIR_PEN] } }],
    });
  });

  it("gives Barn Staff their Pens, their Cases when visiting, and the farm's work that is theirs to do", () => {
    const both = scopeOf(
      person({ visiting: true, pens: true, cases: true }),
      "staff"
    );
    expect(workInScopeWhere(both)).toEqual({
      OR: [
        { penId: { in: [THEIR_PEN] } },
        { animalId: { in: [ON_CASE] } },
        { penId: { isNull: true }, assignedRole: "staff" },
      ],
    });
    const visitor = scopeOf(person({ visiting: true, cases: true }), "vet");
    expect(animalsInScopeWhere(visitor)).toEqual({ id: { in: [ON_CASE] } });
  });
});
