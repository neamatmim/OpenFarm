import { describe, expect, it } from "vitest";

import type { VentureState } from "./venture-lifecycle";
import {
  VENTURE_STATES,
  hasEnded,
  isRunning,
  isStillBuying,
  mayMoveTo,
  nextVentureStates,
} from "./venture-lifecycle";

// Written out state by state rather than as a rule about a rule, so the answers read at a glance and a
// state added to the list cannot quietly inherit somebody else's.

/** Each question answered for every state there is, so none is left to an assumption. */
const EXPECTED: Record<
  VentureState,
  { running: boolean; ended: boolean; buying: boolean }
> = {
  open: { running: false, ended: false, buying: true },
  buying: { running: true, ended: false, buying: true },
  fattening: { running: true, ended: false, buying: false },
  selling: { running: true, ended: false, buying: false },
  settled: { running: false, ended: true, buying: false },
  cancelled: { running: false, ended: true, buying: false },
};

describe("where a Venture stands", () => {
  it.each(VENTURE_STATES)("says what is true of one that is %s", (state) => {
    expect(isRunning(state)).toBe(EXPECTED[state].running);
    expect(hasEnded(state)).toBe(EXPECTED[state].ended);
    expect(isStillBuying(state)).toBe(EXPECTED[state].buying);
  });

  it("counts a run as on only once it is buying, never while merely Open", () => {
    // The screens group an Open Venture with the current ones, which is a different question: it has
    // spent nothing, so the budget warning and the buy-back are not about it.
    expect(isRunning("open")).toBe(false);
  });

  it("holds a Venture to one answer either way it ended", () => {
    expect(hasEnded("settled")).toBe(true);
    expect(hasEnded("cancelled")).toBe(true);
    expect(isRunning("settled")).toBe(false);
    expect(isRunning("cancelled")).toBe(false);
  });
});

describe("where a Venture may go next", () => {
  it("opens on buying, or is called off", () => {
    expect(nextVentureStates("open")).toEqual(["buying", "cancelled"]);
  });

  it("reaches Selling from Buying as well as from Fattening", () => {
    // A Sale is what moves a Venture to Selling, and one may be recorded before buying is called over.
    expect(mayMoveTo("buying", "selling")).toBe(true);
    expect(mayMoveTo("fattening", "selling")).toBe(true);
  });

  it("settles only from Selling, which is where the last payout finds it", () => {
    expect(mayMoveTo("selling", "settled")).toBe(true);
    expect(mayMoveTo("fattening", "settled")).toBe(false);
    expect(mayMoveTo("open", "settled")).toBe(false);
  });

  it("calls off only a Venture still Open, because capital is all that goes back", () => {
    expect(mayMoveTo("open", "cancelled")).toBe(true);
    expect(mayMoveTo("buying", "cancelled")).toBe(false);
    expect(mayMoveTo("fattening", "cancelled")).toBe(false);
  });

  it("lets a Venture whose run is over go nowhere", () => {
    expect(nextVentureStates("settled")).toEqual([]);
    expect(nextVentureStates("cancelled")).toEqual([]);
  });

  it("never moves a Venture backwards", () => {
    expect(mayMoveTo("fattening", "buying")).toBe(false);
    expect(mayMoveTo("selling", "fattening")).toBe(false);
    expect(mayMoveTo("buying", "open")).toBe(false);
  });
});
