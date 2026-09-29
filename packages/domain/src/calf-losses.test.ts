import { describe, expect, it } from "vitest";

import type { CalfRecord } from "./calf-losses";
import { calfLosses, lostBeforeWeaning } from "./calf-losses";

const day = (on: string) => new Date(`${on}T00:00:00.000Z`);

const calf = (more: Partial<CalfRecord> = {}): CalfRecord => ({
  bornAt: day("2026-03-01"),
  stillborn: false,
  lostAt: null,
  cause: null,
  weanedAt: null,
  ...more,
});

const YEAR = {
  from: day("2026-01-01"),
  until: day("2027-01-01"),
  weaningDays: 90,
};

describe("calves lost before weaning", () => {
  it("counts a calf that died before her weaning, and not one that died after", () => {
    const weaned = day("2026-05-30");
    expect(
      lostBeforeWeaning(
        calf({ lostAt: day("2026-04-01"), weanedAt: weaned }),
        90
      )
    ).toBe(true);
    expect(
      lostBeforeWeaning(
        calf({ lostAt: day("2026-06-01"), weanedAt: weaned }),
        90
      )
    ).toBe(false);
  });

  it("uses the weaning age for a calf never weaned", () => {
    expect(lostBeforeWeaning(calf({ lostAt: day("2026-05-29") }), 90)).toBe(
      true
    );
    // Ninety days on is the day she would have been weaned: no longer a calf's death.
    expect(lostBeforeWeaning(calf({ lostAt: day("2026-05-30") }), 90)).toBe(
      false
    );
  });

  it("never counts a calf alive today, or sold, or born dead", () => {
    expect(lostBeforeWeaning(calf(), 90)).toBe(false);
    expect(
      lostBeforeWeaning(
        calf({ stillborn: true, lostAt: day("2026-03-01") }),
        90
      )
    ).toBe(false);
  });
});

describe("the calf-loss figure", () => {
  it("counts born alive, stillborn and lost apart, and what they died of", () => {
    const losses = calfLosses(
      [
        calf(),
        calf(),
        calf({
          stillborn: true,
          lostAt: day("2026-03-01"),
          cause: "stillbirth",
        }),
        calf({ lostAt: day("2026-03-10"), cause: "পাতলা পায়খানা" }),
        calf({ lostAt: day("2026-03-20"), cause: "পাতলা পায়খানা" }),
        calf({ lostAt: day("2026-04-10"), cause: "নিউমোনিয়া" }),
        // Twins count as two calves.
        calf({ bornAt: day("2026-08-01") }),
        calf({ bornAt: day("2026-08-01") }),
      ],
      YEAR
    );
    expect(losses).toEqual({
      bornAlive: 7,
      stillborn: 1,
      diedBeforeWeaning: 3,
      lostShare: 3 / 7,
      causes: [
        { cause: "পাতলা পায়খানা", count: 2 },
        { cause: "নিউমোনিয়া", count: 1 },
      ],
    });
  });

  it("counts only calves born in the stretch, and says nothing of a stretch with none", () => {
    const losses = calfLosses([calf({ bornAt: day("2025-12-31") })], YEAR);
    expect(losses).toMatchObject({ bornAlive: 0, lostShare: null });
  });
});
