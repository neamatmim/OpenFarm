import { describe, expect, it } from "vitest";

import {
  blankDraft,
  choosingOutput,
  makingOfDraft,
  whatIsMissing,
} from "./making-draft";

const LAST_MIX = {
  inputs: [
    { feedItemId: "bran", quantity: 400 },
    { feedItemId: "salt", quantity: 10 },
  ],
};

describe("a Feed Making as it is typed", () => {
  it("fills what goes in as the last making of the same feed, while nobody has typed into it", () => {
    const { draft, filled } = choosingOutput(
      blankDraft("2081-03-02"),
      "mix",
      LAST_MIX
    );
    expect(filled).toBe(true);
    expect(draft.lines.map((one) => [one.feedItemId, one.quantity])).toEqual([
      ["bran", "400"],
      ["salt", "10"],
    ]);
  });

  it("keeps what somebody already typed", () => {
    const typed = blankDraft("2081-03-02");
    typed.lines[0] = {
      ...typed.lines[0],
      key: "a",
      feedItemId: "maize",
      quantity: "50",
    };
    const { draft, filled } = choosingOutput(typed, "mix", LAST_MIX);
    expect(filled).toBe(false);
    expect(draft.lines[0]?.feedItemId).toBe("maize");
    expect(draft.outputFeedItemId).toBe("mix");
  });

  it("says what is missing, first first", () => {
    const draft = blankDraft("2081-03-02");
    expect(whatIsMissing(draft)).toBe("output");
    const chosen = choosingOutput(draft, "mix", LAST_MIX).draft;
    // A mix says how much it made.
    expect(whatIsMissing(chosen)).toBe("amount");
    expect(whatIsMissing({ ...chosen, how: "later" })).toBeNull();
    expect(
      whatIsMissing({
        ...chosen,
        cameOut: "400",
        lines: [{ key: "x", feedItemId: "bran", quantity: "0" }],
      })
    ).toBe("inputs");
  });

  it("sends a mix with what it made, and silage with when it is ready, leaving empty rows behind", () => {
    const mix = {
      ...choosingOutput(blankDraft("2081-03-02"), "mix", LAST_MIX).draft,
      cameOut: "405",
    };
    mix.lines.push({ key: "empty", feedItemId: "", quantity: "" });
    expect(makingOfDraft(mix)).toEqual({
      outputFeedItemId: "mix",
      madeOn: "2081-03-02",
      inputs: [
        { feedItemId: "bran", quantity: 400 },
        { feedItemId: "salt", quantity: 10 },
      ],
      cameOut: { quantity: 405 },
    });
    expect(
      makingOfDraft({
        ...mix,
        how: "later",
        readyOn: "2081-04-10",
        note: " উত্তরের গর্ত ",
      })
    ).toEqual({
      outputFeedItemId: "mix",
      madeOn: "2081-03-02",
      inputs: [
        { feedItemId: "bran", quantity: 400 },
        { feedItemId: "salt", quantity: 10 },
      ],
      readyOn: "2081-04-10",
      note: "উত্তরের গর্ত",
    });
  });
});
