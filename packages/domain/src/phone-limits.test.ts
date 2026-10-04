import { describe, expect, it } from "vitest";

import { SYNC_BATCH_MAX_BYTES, heavierThanAPhoneSends } from "./phone-limits";

/** An entry carrying a photograph of this many characters of base64. */
const photo = (characters: number) => ({
  kind: "completion_photo",
  data: "x".repeat(characters),
});

describe("what one batch from a phone may weigh", () => {
  it("is what a phone sends: four megabytes of entries, or one entry however heavy", () => {
    const half = SYNC_BATCH_MAX_BYTES / 2 - 100;
    expect(heavierThanAPhoneSends([photo(half), photo(half)])).toBe(false);
    expect(heavierThanAPhoneSends([photo(SYNC_BATCH_MAX_BYTES * 2)])).toBe(
      false
    );
  });

  it("is not photographs piled past it in one request", () => {
    const heavy = photo(1_900_000);
    expect(heavierThanAPhoneSends([heavy, heavy, heavy])).toBe(true);
  });
});
