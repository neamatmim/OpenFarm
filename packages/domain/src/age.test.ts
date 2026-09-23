import { describe, expect, it } from "vitest";

import { ageOf, bornAroundOf } from "./age";

// A bought bull arrives with the seller's word for his age and no birth date. Before this, every one of
// them showed no age at all; the estimate has to grow with him, and has to say it is one.

const at = (instant: string) => new Date(instant);

describe("how old an animal is", () => {
  it("counts from her birth, a month at a time as its day comes round", () => {
    const her = {
      birthDate: at("2024-03-15T00:00:00+06:00"),
      ageAtIntake: null,
    };
    expect(ageOf(her, at("2026-03-14T12:00:00+06:00"))).toEqual({
      months: 23,
      estimated: false,
    });
    expect(ageOf(her, at("2026-03-15T12:00:00+06:00"))).toEqual({
      months: 24,
      estimated: false,
    });
  });

  it("reads the day on the farm's clock, not the reader's", () => {
    // Born at 22:09 UTC on the 20th, which is already the 21st in Savar: a month old on the 21st.
    const her = { birthDate: at("2026-07-20T22:09:00Z"), ageAtIntake: null };
    expect(ageOf(her, at("2026-08-21T08:00:00+06:00"))?.months).toBe(1);
    expect(ageOf(her, at("2026-08-20T20:00:00+06:00"))?.months).toBe(0);
  });

  it("grows a bought animal's estimate by the months she has been here, and says it is one", () => {
    const bull = {
      birthDate: null,
      ageAtIntake: {
        estimatedAgeMonths: 18,
        arrivedAt: at("2026-06-16T09:30:00+06:00"),
      },
    };
    expect(ageOf(bull, at("2026-06-16T18:00:00+06:00"))).toEqual({
      months: 18,
      estimated: true,
    });
    expect(ageOf(bull, at("2026-09-23T10:00:00+06:00"))).toEqual({
      months: 21,
      estimated: true,
    });
  });

  it("takes a written birth date over the seller's word", () => {
    const cow = {
      birthDate: at("2022-04-04T00:00:00+06:00"),
      ageAtIntake: {
        estimatedAgeMonths: 30,
        arrivedAt: at("2024-01-10T09:00:00+06:00"),
      },
    };
    expect(ageOf(cow, at("2026-09-23T10:00:00+06:00"))).toEqual({
      months: 53,
      estimated: false,
    });
  });

  it("says nothing of an animal nobody has said anything about", () => {
    expect(
      ageOf(
        { birthDate: null, ageAtIntake: null },
        at("2026-09-23T10:00:00+06:00")
      )
    ).toBeNull();
  });

  it("puts a bought animal's birth in the month the seller's word points to", () => {
    // Nineteen months old on 16 June 2026: born around November 2024, across the turn of a year.
    expect(
      bornAroundOf({
        estimatedAgeMonths: 19,
        arrivedAt: at("2026-06-16T09:30:00+06:00"),
      })
    ).toEqual(at("2024-11-01T00:00:00+06:00"));
    // Arrived at 20:00 UTC on 31 May, which is already June in Savar: the month is read on the farm's clock.
    expect(
      bornAroundOf({
        estimatedAgeMonths: 5,
        arrivedAt: at("2026-05-31T20:00:00Z"),
      })
    ).toEqual(at("2026-01-01T00:00:00+06:00"));
  });
});
