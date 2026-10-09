import { afterEach, describe, expect, it } from "vitest";

import {
  FAILURES_COUNT_FOR_MS,
  aFailureWasSeen,
  failuresInTheLastHour,
  forgetEveryFailure,
} from "./failures-seen";

// The server counting its own failures, for its timer to read: how many in the last hour, and when the first came.

const MINUTE = 60_000;
const at = (minutes: number) =>
  new Date(Date.UTC(2049, 2, 10, 6, 0) + minutes * MINUTE);

afterEach(() => {
  forgetEveryFailure();
});

describe("the failures the server has seen", () => {
  it("are none on a server that has not failed", () => {
    expect(failuresInTheLastHour(at(0))).toEqual({ count: 0, since: null });
  });

  it("are counted from the first of them", () => {
    aFailureWasSeen(at(1));
    aFailureWasSeen(at(2));
    aFailureWasSeen(at(3));
    expect(failuresInTheLastHour(at(10))).toEqual({ count: 3, since: at(1) });
  });

  it("forget one older than the hour, so the count is the last hour's and not the day's", () => {
    aFailureWasSeen(at(0));
    aFailureWasSeen(at(30));
    const anHourOn = new Date(at(0).getTime() + FAILURES_COUNT_FOR_MS);
    expect(failuresInTheLastHour(anHourOn)).toEqual({
      count: 1,
      since: at(30),
    });
  });
});
