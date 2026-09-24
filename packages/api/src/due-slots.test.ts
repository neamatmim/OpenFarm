import { standardPlaybook } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { dueSlotsFor } from "./instances-store";

// What the day's schedule raises when the farm has no animals, or none of the kind a procedure is for.

const playbook = standardPlaybook();
const NOW = new Date("2027-01-10T02:00:00.000Z");
const sop = (key: keyof typeof playbook) => ({
  definitionId: key,
  versionId: `${key}-1`,
  content: playbook[key],
});

describe("the day's scheduled work", () => {
  it("raises nothing on a farm with no animals", () => {
    const slots = dueSlotsFor(
      NOW,
      [
        sop("morningMilking"),
        sop("feeding"),
        sop("healthRound"),
        sop("biosecurity"),
      ],
      []
    );

    expect(slots).toEqual([]);
  });

  it("raises no milking where no cow is in milk, and no fattening round where no bull stands", () => {
    const heifersOnly = [
      { penId: "heifers", side: "dairy", state: "heifer" },
      { penId: "calves", side: "dairy", state: "calf" },
    ];

    const milking = dueSlotsFor(NOW, [sop("morningMilking")], heifersOnly);
    const tickSpray = dueSlotsFor(NOW, [sop("tickSpray")], heifersOnly);

    expect(milking).toEqual([]);
    expect(tickSpray).toEqual([]);
  });

  it("raises milking once for each Pen with a cow in milk, and none for the others", () => {
    const slots = dueSlotsFor(
      NOW,
      [sop("morningMilking")],
      [
        { penId: "milking-1", side: "dairy", state: "milking" },
        { penId: "milking-1", side: "dairy", state: "milking" },
        { penId: "dry", side: "dairy", state: "dry" },
      ]
    );

    expect(slots.map((one) => one.penId)).toEqual(["milking-1"]);
  });

  it("raises the farm's one biosecurity check once, in no Pen, however many Pens stand full", () => {
    const slots = dueSlotsFor(
      NOW,
      [sop("biosecurity")],
      [
        { penId: "a", side: "dairy", state: "milking" },
        { penId: "b", side: "dairy", state: "heifer" },
        { penId: "c", side: "fattening", state: "fattening" },
      ]
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]?.penId).toBeNull();
    // Kept to one a day by its cause, as work in no Pen has no Pen to keep it so.
    expect(slots[0]?.cause).toMatch(/^whole-farm:/u);
  });
});
