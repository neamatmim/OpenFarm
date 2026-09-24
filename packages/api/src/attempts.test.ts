import { describe, expect, it } from "vitest";

import { CODE_ATTEMPTS, countFailure, keysHeld, lockedOut } from "./attempts";

/** Far more keys than the farm's own mistakes ever make, as a script naming a new phone every time would. */
const A_SCRIPTS_WORTH = 6000;
/** Few enough that the old keys must have gone: only the one just counted, and any another test left. */
const HARDLY_ANY = 10;

describe("wrong guesses kept in memory", () => {
  it("are swept once there are many and they are old, so a script cannot grow them without end", () => {
    const at = new Date("2055-02-01T04:00:00.000Z");
    for (let one = 0; one < A_SCRIPTS_WORTH; one += 1) {
      countFailure(`sweep-test:${one}`, at, CODE_ATTEMPTS);
    }
    expect(keysHeld()).toBeGreaterThanOrEqual(A_SCRIPTS_WORTH);

    const later = new Date(at.getTime() + CODE_ATTEMPTS.windowMs + 60_000);
    countFailure("sweep-test:now", later, CODE_ATTEMPTS);

    expect(keysHeld()).toBeLessThan(HARDLY_ANY);
  });

  it("still count against a key within its window", () => {
    const at = new Date("2055-03-01T04:00:00.000Z");
    for (let one = 0; one < CODE_ATTEMPTS.limit; one += 1) {
      countFailure("sweep-test:held", at, CODE_ATTEMPTS);
    }
    expect(lockedOut("sweep-test:held", at, CODE_ATTEMPTS)).toBe(true);
  });
});
