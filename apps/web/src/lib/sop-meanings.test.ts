import type { Step } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { toBilingualList, toChoices } from "./sop-draft";
import { lostMeaningsOf, takersOf, withMeaningGiven } from "./sop-meanings";

// The choices and skip reasons the farm acts on: a heat sends the breeding work, "not found" opens a Missing. Their
// meaning is held by the value or the mark under the words, so the editor never moves it by the words' place, and
// shows one left behind.

const round: Step = {
  id: "look",
  text: { bn: "প্রতিটি পশু দেখুন" },
  repeatPerAnimal: true,
  effect: { kind: "observation" },
  evidence: [
    {
      type: "choice",
      required: true,
      choices: [
        { value: "heat", label: { bn: "গরম হয়েছে" } },
        { value: "off_feed", label: { bn: "খাবারে অরুচি" } },
      ],
    },
  ],
  skipReasons: [
    { bn: "পশু পাওয়া যায়নি", means: "not_found" },
    { bn: "ভালো আছে", means: "nothing_to_note" },
  ],
};

/** The round with its choices typed again. */
const choicesTyped = (typed: string): Step => ({
  ...round,
  evidence: [
    {
      ...round.evidence[0],
      type: "choice",
      required: true,
      choices: toChoices(typed, round.evidence[0]?.choices),
    },
  ],
});

describe("a choice the farm acts on, edited", () => {
  it("is not handed to the word put in its place: a limp is not a heat", () => {
    const limping = choicesTyped("খোঁড়া, খাবারে অরুচি");
    expect(limping.evidence[0]?.choices?.[0]?.value).not.toBe("heat");
    expect(lostMeaningsOf(round, limping)).toEqual([
      {
        kind: "choice",
        value: "heat",
        was: { bn: "গরম হয়েছে" },
        means: "heat",
      },
    ]);
  });

  it("is given back to new words once the Owner says they are the same thing", () => {
    const reworded = choicesTyped("গরমে এসেছে, খাবারে অরুচি");
    const [lost] = lostMeaningsOf(round, reworded);
    expect(lost).toBeDefined();
    if (!lost) {
      return;
    }
    expect(takersOf(round, reworded, lost)).toEqual([
      { index: 0, words: { bn: "গরমে এসেছে" } },
    ]);
    const given = withMeaningGiven(reworded, lost, 0);
    expect(given.evidence[0]?.choices?.[0]).toEqual({
      value: "heat",
      label: { bn: "গরমে এসেছে" },
    });
    expect(lostMeaningsOf(round, given)).toEqual([]);
  });
});

describe("a skip reason the farm acts on, reworded", () => {
  it("is shown to have lost its meaning, and takes it back when given", () => {
    const typed = {
      ...round,
      skipReasons: toBilingualList("পশুটি পাওয়া যায়নি, ভালো আছে", round.skipReasons),
    };
    const lost = lostMeaningsOf(round, typed);
    expect(lost).toEqual([
      { kind: "skip", was: { bn: "পশু পাওয়া যায়নি" }, means: "not_found" },
    ]);
    const [missing] = lost;
    if (!missing) {
      return;
    }
    expect(takersOf(round, typed, missing).map((one) => one.index)).toEqual([
      0,
    ]);
    const given = withMeaningGiven(typed, missing, 0);
    expect(given.skipReasons[0]).toEqual({
      bn: "পশুটি পাওয়া যায়নি",
      means: "not_found",
    });
  });
});
