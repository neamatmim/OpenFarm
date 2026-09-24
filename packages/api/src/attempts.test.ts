import { describe, expect, it } from "vitest";

import { CODE_ATTEMPTS, countFailure, keysHeld, lockedOut } from "./attempts";

describe("wrong guesses kept in memory", () => {
  it("are swept once there are many and they are old, so a script cannot grow them without end", () => {
    const at = new Date("2055-02-01T04:00:00.000Z");
    for (let one = 0; one < 6000; one += 1) {
      countFailure(`sweep-test:${one}`, at, CODE_ATTEMPTS);
    }
    expect(keysHeld()).toBeGreaterThanOrEqual(6000);

    const later = new Date(at.getTime() + CODE_ATTEMPTS.windowMs + 60_000);
    countFailure("sweep-test:now", later, CODE_ATTEMPTS);

    expect(keysHeld()).toBeLessThan(10);
  });

  it("still count against a key within its window", () => {
    const at = new Date("2055-03-01T04:00:00.000Z");
    for (let one = 0; one < CODE_ATTEMPTS.limit; one += 1) {
      countFailure("sweep-test:held", at, CODE_ATTEMPTS);
    }
    expect(lockedOut("sweep-test:held", at, CODE_ATTEMPTS)).toBe(true);
  });
});
