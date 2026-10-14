import { describe, expect, it } from "vitest";

import {
  addMonths,
  campaignDueOf,
  campaignIntervalOf,
  campaignProductOf,
  dueForACampaign,
  mayHoldForSale,
  mayPassAsNotDue,
  notDueSince,
  penDueBy,
} from "./campaign-interval";
import type { Step } from "./sop";
import {
  HELD_FOR_SALE,
  NOT_DUE_YET,
  findStructuralProblems,
  meaningOfSkip,
} from "./sop";
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

  it("keys a Pen's Campaign on the latest day one of its animals came due, and nothing before any has", () => {
    const today = "2026-10-13";
    expect(penDueBy(["2026-11-01", "2026-10-02", "2026-09-20"], today)).toBe(
      "2026-10-02"
    );
    expect(penDueBy(["2026-11-01", "2026-12-02"], today)).toBeNull();
    expect(penDueBy([], today)).toBeNull();
  });

  it("is not pinned by one animal left undosed: the others coming round again is a new day", () => {
    // She was missed in January; the rest were dosed in June and come round in October.
    expect(penDueBy(["2026-01-05", "2026-10-05"], "2026-10-13")).toBe(
      "2026-10-05"
    );
  });

  it("says an animal dosed within the interval is not due, from the day she was dosed", () => {
    const today = "2026-10-13";
    expect(notDueSince({ lastGivenOn: "2026-08-01", months: 4, today })).toBe(
      "2026-08-01"
    );
    expect(
      notDueSince({ lastGivenOn: "2026-06-13", months: 4, today })
    ).toBeNull();
    expect(notDueSince({ lastGivenOn: null, months: 4, today })).toBeNull();
  });
});

describe("an animal passed on a Campaign's walk as not due", () => {
  const dose = playbook.fmdVaccination.steps.find(
    (step) => step.effect?.kind === "treatment"
  );

  it("is a farm's own reason a Campaign's dose may be passed with, meaning not due, and no other Step's", () => {
    if (!dose) {
      throw new Error("expected the Campaign's dose");
    }
    expect(mayPassAsNotDue(dose)).toBe(true);
    expect(meaningOfSkip(dose, NOT_DUE_YET.bn)).toBe("not_due");
    const milking = playbook.morningMilking.steps.find(
      (step) => step.repeatPerAnimal
    );
    if (!milking) {
      throw new Error("expected a milking step");
    }
    expect(mayPassAsNotDue(milking)).toBe(false);
    expect(meaningOfSkip(milking, NOT_DUE_YET.bn)).toBeNull();
  });
});

/** The Step of a procedure that gives its dose. */
const doseOf = (content: { steps: Step[] }) => {
  const dose = content.steps.find((step) => step.effect?.kind === "treatment");
  if (!dose) {
    throw new Error("expected a dose");
  }
  return dose;
};

describe("an animal Ready for Sale held on a dose given one animal at a time", () => {
  it("is the farm's own reason on a Campaign's dose and on an arrival dose, meaning held for her sale", () => {
    for (const dose of [
      doseOf(playbook.fmdVaccination),
      doseOf(playbook.arrivalFmd),
    ]) {
      expect(mayHoldForSale(dose)).toBe(true);
      expect(meaningOfSkip(dose, HELD_FOR_SALE.bn)).toBe("held_for_sale");
    }
  });

  it("is no reason on a Prescription's dose, nor on a Step that gives no dose", () => {
    // Her course is the Vet's to stop, not the walk's to hold.
    const prescribed = doseOf(playbook.treatmentDose);
    expect(mayHoldForSale(prescribed)).toBe(false);
    expect(meaningOfSkip(prescribed, HELD_FOR_SALE.bn)).toBeNull();
    const milking = playbook.morningMilking.steps.find(
      (step) => step.repeatPerAnimal
    );
    if (!milking) {
      throw new Error("expected a milking step");
    }
    expect(mayHoldForSale(milking)).toBe(false);
    expect(meaningOfSkip(milking, HELD_FOR_SALE.bn)).toBeNull();
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
