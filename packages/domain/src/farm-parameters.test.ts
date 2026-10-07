import { describe, expect, it } from "vitest";

import {
  ALL_FARM_PARAMETERS,
  FARM_PARAMETERS,
  parametersOwnersAlone,
} from "./farm-parameters";

describe("the Farm Parameters", () => {
  it("accept at least one whole number each", () => {
    for (const [key, bounds] of Object.entries(FARM_PARAMETERS)) {
      expect(Number.isInteger(bounds.min), key).toBe(true);
      expect(Number.isInteger(bounds.max), key).toBe(true);
      expect(bounds.min, key).toBeLessThanOrEqual(bounds.max);
    }
  });

  it("are each named once, numbers and times together", () => {
    expect(new Set(ALL_FARM_PARAMETERS).size).toBe(ALL_FARM_PARAMETERS.length);
  });

  it("keep the Owner's alone apart: what the Manager may not see, he may not set either", () => {
    const toSet = parametersOwnersAlone("to set");
    const toSetAndRead = parametersOwnersAlone("to set and read");
    expect(toSet.filter((key) => toSetAndRead.includes(key))).toEqual([]);
    expect(parametersOwnersAlone("either").toSorted()).toEqual(
      [...toSet, ...toSetAndRead].toSorted()
    );
    // A Venture's own figures and the lines past which the Manager's counts are told: the Owner's to read as well.
    expect(toSetAndRead).toContain("ventureFloorPercent");
    expect(toSetAndRead).toContain("cashShortTellMoney");
    // What the keep-or-sell figures read: the Manager reads it, the Owner sets it.
    expect(toSet).toContain("keepReadDays");
    expect(toSet).not.toContain("milkTolerancePercent");
  });
});
