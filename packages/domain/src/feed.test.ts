import { describe, expect, it } from "vitest";

import {
  SESSIONS_TO_JUDGE,
  WASTING_LEFTOVER_PERCENT,
  leftoverPercent,
  leftoverStanding,
} from "./feed";

// A Pen's Leftovers of one Feed Item over a week, read the way a farmer reads the trough: a lot left behind is feed
// paid for and not eaten; nothing ever left may be a Pen going short, or a feeder not writing it down.

/** A week fed twice a day. */
const WEEK = 14;

describe("where a Pen's Leftovers stand", () => {
  it("is wasting once more than the farm's share of it comes back", () => {
    // 100 kg of straw given, 15 kg left behind: they are given more straw than they eat.
    expect(
      leftoverStanding(
        {
          givenKg: 100,
          leftoverKg: 15,
          sessions: WEEK,
          sessionsWithLeftover: 9,
        },
        { penLeftAnything: true }
      )
    ).toBe("wasting");
  });

  it("is fine with a little left now and then", () => {
    expect(
      leftoverStanding(
        {
          givenKg: 100,
          leftoverKg: WASTING_LEFTOVER_PERCENT,
          sessions: WEEK,
          sessionsWithLeftover: 4,
        },
        { penLeftAnything: true }
      )
    ).toBe("fine");
  });

  it("says when the Pen's trough was never left with a scrap of anything", () => {
    const clearedEverything = {
      givenKg: 100,
      leftoverKg: 0,
      sessions: WEEK,
      sessionsWithLeftover: 0,
    };
    expect(
      leftoverStanding(clearedEverything, { penLeftAnything: false })
    ).toBe("all_eaten");
    // Minerals cleared in a Pen that leaves some napier: a Pen fed enough, not one going short.
    expect(leftoverStanding(clearedEverything, { penLeftAnything: true })).toBe(
      "fine"
    );
  });

  it("says nothing of a Pen fed too seldom to judge", () => {
    // Two meals, both wasted: a new Pen, or a Ration changed yesterday — not yet a pattern.
    expect(
      leftoverStanding(
        {
          givenKg: 10,
          leftoverKg: 5,
          sessions: SESSIONS_TO_JUDGE - 1,
          sessionsWithLeftover: SESSIONS_TO_JUDGE - 1,
        },
        { penLeftAnything: true }
      )
    ).toBe("too_few");
  });

  it("counts what came back against what was given, and nothing given as nothing wasted", () => {
    expect(leftoverPercent({ givenKg: 80, leftoverKg: 6 })).toBe(8);
    expect(leftoverPercent({ givenKg: 0, leftoverKg: 0 })).toBe(0);
  });
});
