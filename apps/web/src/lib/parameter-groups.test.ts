import { ALL_FARM_PARAMETERS, parametersOwnersAlone } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { PARAMETER_GROUPS, boundsOf } from "./parameter-groups";

const offered = PARAMETER_GROUPS.flatMap((group) =>
  group.fields.map((field) => field.key)
);

describe("the settings form", () => {
  it("offers every Farm Parameter, each once", () => {
    expect(offered.toSorted()).toEqual([...ALL_FARM_PARAMETERS].toSorted());
  });

  it("keeps each group wholly the Owner's or wholly not, so a Manager is never shown one of the Owner's figures", () => {
    const theOwners = new Set<string>(parametersOwnersAlone("either"));
    for (const group of PARAMETER_GROUPS) {
      const owners = group.fields.filter((field) => theOwners.has(field.key));
      expect(
        owners.length === 0 || owners.length === group.fields.length,
        group.id
      ).toBe(true);
    }
  });

  it("takes each number's bounds from the farm's own, and none for a time of day", () => {
    expect(boundsOf("cullOpenDays")).toEqual({ min: 60, max: 365 });
    expect(boundsOf("quietFrom")).toBeNull();
  });
});
