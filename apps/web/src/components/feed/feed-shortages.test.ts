import { describe, expect, it } from "vitest";

import { feedsInUse, shortFeedLines } from "@/lib/feed-shortages";

import type { RationRow } from "./feed-types";

const ration = (changes: Partial<RationRow> = {}): RationRow => ({
  id: "ration",
  name: { bn: "রেশন", en: null },
  number: 1,
  items: [{ feedItemId: "used", kgPerAnimalPerDay: 2 }],
  band: { fromKg: null, toKg: null },
  penIds: ["pen"],
  retiredAt: null,
  ...changes,
});
const line = (feedItemId: string, onHand: number, runningLow = false) => ({
  feedItemId,
  onHand,
  runningLow,
  retiredAt: null,
});

describe("operational feed shortages", () => {
  it("counts exhausted active feed and configured low stock, while excluding unused empty items and retired feed", () => {
    const lines = [
      line("used", 0),
      line("unused", 0),
      line("watched", 4, true),
      { ...line("retired", 0, true), retiredAt: new Date() },
    ];
    expect(
      shortFeedLines(lines, feedsInUse([ration()])).map((one) => one.feedItemId)
    ).toEqual(["used", "watched"]);
  });
  it("stops treating an empty item as a shortage when its ration has no pens or is retired", () => {
    const stock = [line("used", -2)];
    expect(shortFeedLines(stock, feedsInUse([ration({ penIds: [] })]))).toEqual(
      []
    );
    expect(
      shortFeedLines(stock, feedsInUse([ration({ retiredAt: new Date() })]))
    ).toEqual([]);
    expect(shortFeedLines(stock, feedsInUse([ration()]))).toHaveLength(1);
  });
});
