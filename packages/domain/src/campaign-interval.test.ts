import { describe, expect, it } from "vitest";

import {
  addMonths,
  campaignDueOf,
  campaignIntervalOf,
  campaignProductOf,
  dueForACampaign,
  penDueSince,
} from "./campaign-interval";
import { findStructuralProblems } from "./sop";
import { standardPlaybook } from "./standard-playbook";

const playbook = standardPlaybook({
  fmdVaccine: "fmd-product",
  dewormer: "drench-product",
});

describe("a Campaign's interval", () => {
  it("counts calendar months, the end of a short month standing for a long month's last day", () => {
    expect(addMonths("2026-10-13", 4)).toBe("2027-02-13");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("falls due the interval after her last dose of the product", () => {
    expect(
      campaignDueOf({
        lastGivenOn: "2026-03-10",
        countedFrom: "2025-01-01",
        months: 4,
      })
    ).toBe("2026-07-10");
  });

  it("counts an animal never given it on the farm from when she was first counted, not from today", () => {
    expect(
      campaignDueOf({ lastGivenOn: null, countedFrom: "2026-10-13", months: 4 })
    ).toBe("2027-02-13");
  });

  it("says she is due once the day has come, soon within the fortnight before, and nothing further off", () => {
    const today = "2026-10-13";
    expect(dueForACampaign("2026-10-01", today)).toBe("due");
    expect(dueForACampaign("2026-10-13", today)).toBe("due");
    expect(dueForACampaign("2026-10-27", today)).toBe("soon");
    expect(dueForACampaign("2026-10-28", today)).toBeNull();
  });

  it("raises a Pen's Campaign from the earliest day one of its animals came due, and not before any has", () => {
    const today = "2026-10-13";
    expect(penDueSince(["2026-11-01", "2026-10-02", "2026-09-20"], today)).toBe(
      "2026-09-20"
    );
    expect(penDueSince(["2026-11-01", "2026-12-02"], today)).toBeNull();
    expect(penDueSince([], today)).toBeNull();
  });
});

describe("the standard Campaigns", () => {
  it("come round every four months for FMD and for deworming, as DLS gives it", () => {
    expect(campaignIntervalOf(playbook.fmdVaccination)).toBe(4);
    expect(campaignIntervalOf(playbook.deworming)).toBe(4);
    expect(campaignProductOf(playbook.fmdVaccination)).toBe("fmd-product");
    expect(campaignProductOf(playbook.deworming)).toBe("drench-product");
  });

  it("are not intervals for work that is not a Campaign", () => {
    expect(campaignIntervalOf(playbook.morningMilking)).toBeNull();
    expect(campaignProductOf(playbook.morningMilking)).toBeNull();
  });

  it("publish with their interval", () => {
    expect(findStructuralProblems(playbook.fmdVaccination)).toEqual([]);
    expect(findStructuralProblems(playbook.deworming)).toEqual([]);
  });
});

describe("an interval the Playbook refuses", () => {
  const fmd = playbook.fmdVaccination;

  it("is whole months, from one to two years", () => {
    for (const months of [0, 1.5, 25]) {
      expect(
        findStructuralProblems({
          ...fmd,
          triggers: [{ kind: "every_months", months }],
        })
      ).toContain(
        "triggers[0].months: a Campaign comes round in whole months, from one to twenty-four"
      );
    }
  });

  it("stands on a dose: a procedure that gives none has nothing to count the months from", () => {
    expect(
      findStructuralProblems({
        ...playbook.morningMilking,
        triggers: [{ kind: "every_months", months: 4 }],
      })
    ).toContain(
      "triggers: a Campaign comes round by its last dose, and this procedure gives no dose of a product to every animal"
    );
  });
});
