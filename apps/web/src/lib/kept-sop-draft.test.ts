import { describe, expect, it } from "vitest";

import { draftChanged, draftOf } from "./kept-sop-draft";
import { emptySop } from "./sop-draft";

// A half-written procedure kept on the device: read back only when it is one the page can open, and worth asking
// about only when it says something its start did not.

describe("a kept draft read back", () => {
  it("opens again as it was kept, and is nothing when broken or of another shape", () => {
    const draft = {
      content: { ...emptySop(), name: { bn: "নতুন" } },
      definitionId: null,
      basedOnVersionId: null,
      startedFrom: emptySop(),
    };
    expect(draftOf(JSON.stringify(draft))).toEqual(draft);
    expect(draftOf("{not json")).toBeNull();
    expect(draftOf(JSON.stringify({ content: "x" }))).toBeNull();
    expect(draftOf(null)).toBeNull();
  });

  it("is a change worth asking about only when it says something its start did not", () => {
    const start = emptySop();
    const same = {
      content: start,
      definitionId: null,
      basedOnVersionId: null,
      startedFrom: start,
    };
    expect(draftChanged(same)).toBe(false);
    expect(
      draftChanged({ ...same, content: { ...start, graceMinutes: 90 } })
    ).toBe(true);
    expect(draftChanged(null)).toBe(false);
  });
});
