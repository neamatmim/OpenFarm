import { describe, expect, it } from "vitest";

import { adultDeaths } from "./adult-deaths";

const day = (d: string) => new Date(`${d}T06:00:00.000Z`);
const year = {
  from: day("2026-01-01"),
  until: day("2027-01-01"),
  weaningDays: 90,
};

describe("deaths among grown animals", () => {
  it("is deaths for every hundred head kept a year, culls apart, by Side", () => {
    const cows = Array.from({ length: 10 }, () => ({
      side: "dairy" as const,
      bornAt: null,
      arrivedAt: day("2025-01-01"),
      leftAt: null,
      death: null,
    }));
    const deaths = adultDeaths(
      [
        ...cows,
        // Died half way through the year: half a head-year, and one death.
        {
          side: "dairy",
          bornAt: null,
          arrivedAt: day("2025-01-01"),
          leftAt: day("2026-07-02"),
          death: { kind: "died", at: day("2026-07-02"), cause: "দুধ জ্বর" },
        },
        {
          side: "dairy",
          bornAt: null,
          arrivedAt: day("2025-01-01"),
          leftAt: day("2026-03-01"),
          death: { kind: "culled", at: day("2026-03-01"), cause: "বাঁজা" },
        },
      ],
      year
    );
    expect(deaths.dairy).toMatchObject({ died: 1, culled: 1 });
    expect(deaths.dairy.headYears).toBeCloseTo(10.7, 1);
    expect(deaths.dairy.perHundred).toBeCloseTo(9.4, 1);
    expect(deaths.fattening).toEqual({
      died: 0,
      culled: 0,
      headYears: 0,
      perHundred: null,
    });
    expect(deaths.causes).toEqual([{ cause: "দুধ জ্বর", count: 1 }]);
  });

  it("counts each day of a cow crossed to Fattening on the Side she stood on that day, and her death on her last", () => {
    // In milk until 2 July, then fattened for Eid, and she died on the fattening side on 1 December.
    const deaths = adultDeaths(
      [
        {
          side: "fattening",
          bornAt: null,
          arrivedAt: day("2025-01-01"),
          leftAt: day("2026-12-01"),
          death: { kind: "died", at: day("2026-12-01"), cause: "পেট ফাঁপা" },
          sides: [
            {
              side: "dairy",
              from: day("2025-01-01"),
              until: day("2026-07-02"),
            },
            {
              side: "fattening",
              from: day("2026-07-02"),
              until: day("2026-12-01"),
            },
          ],
        },
      ],
      year
    );
    // Half the year a cow, five months a bull for Eid — not the whole of her year on the fattening side.
    expect(deaths.dairy).toMatchObject({ died: 0, headYears: 0.5 });
    expect(deaths.fattening).toMatchObject({ died: 1, headYears: 0.4 });
  });

  it("leaves a calf that died before weaning to the calf-loss figure", () => {
    const deaths = adultDeaths(
      [
        {
          side: "dairy",
          bornAt: day("2026-03-01"),
          arrivedAt: day("2026-03-01"),
          leftAt: day("2026-04-01"),
          death: { kind: "died", at: day("2026-04-01"), cause: "পাতলা পায়খানা" },
        },
      ],
      year
    );
    expect(deaths.dairy).toMatchObject({ died: 0, headYears: 0 });
  });
});
