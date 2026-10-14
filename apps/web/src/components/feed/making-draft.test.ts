import { describe, expect, it } from "vitest";

import {
  blankDraft,
  choosingOutput,
  inputsPutRight,
  makingOfDraft,
  shortNamed,
  whatIsMissing,
} from "./making-draft";

/** The feeds a refusal names, as `shortNamed` said them. */
const feedsOf = (error: unknown) =>
  (error as { data: { feeds?: string } }).data.feeds;

describe("what went in, put right", () => {
  const held = [
    { feedItemId: "bran", quantity: 400 },
    { feedItemId: "salt", quantity: 10 },
  ];

  it("is no change while the rows say what the farm holds, in any order", () => {
    expect(
      inputsPutRight(held, [
        { key: "b", feedItemId: "salt", quantity: "10" },
        { key: "a", feedItemId: "bran", quantity: "400" },
      ])
    ).toMatchObject({ changed: false, ready: true });
  });

  it("adds a feed and takes one away", () => {
    expect(
      inputsPutRight(held, [
        { key: "a", feedItemId: "bran", quantity: "380" },
        { key: "c", feedItemId: "maize", quantity: "20" },
      ])
    ).toEqual({
      changed: true,
      ready: true,
      to: [
        { feedItemId: "bran", quantity: 380 },
        { feedItemId: "maize", quantity: 20 },
      ],
    });
  });

  it("is not ready with a feed twice, a row half typed, or nothing at all", () => {
    expect(
      inputsPutRight(held, [
        { key: "a", feedItemId: "bran", quantity: "1" },
        { key: "b", feedItemId: "bran", quantity: "2" },
      ]).ready
    ).toBe(false);
    expect(
      inputsPutRight(held, [{ key: "a", feedItemId: "", quantity: "2" }]).ready
    ).toBe(false);
    expect(inputsPutRight(held, []).ready).toBe(false);
  });
});

describe("a store that could not spare it", () => {
  const items = [
    { id: "bran", nameBn: "গমের ভুসি", nameEn: "Wheat bran", unit: "kg" },
    { id: "molasses", nameBn: "চিটাগুড়", nameEn: "Molasses", unit: "liter" },
  ];
  const refusal = {
    code: "BAD_REQUEST",
    data: {
      refusal: "not_enough_in_the_store",
      short: [
        { feedItemId: "bran", onHand: 20 },
        { feedItemId: "molasses", onHand: 2.5 },
      ],
    },
  };
  it("names each feed and what could be spared, in the reader's language and digits", () => {
    expect(feedsOf(shortNamed(refusal, items, "bn"))).toBe(
      "গমের ভুসি ২০ কেজি · চিটাগুড় ২.৫ লিটার"
    );
    expect(feedsOf(shortNamed(refusal, items, "en"))).toBe(
      "Wheat bran 20 kg · Molasses 2.5 liters"
    );
  });

  it("leaves any other refusal as it came", () => {
    const other = { data: { refusal: "made_from_itself" } };
    expect(shortNamed(other, items, "bn")).toBe(other);
  });
});

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
