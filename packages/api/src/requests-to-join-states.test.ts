import {
  LIVE_REQUEST_STATES as COLUMN_LIVE,
  REQUEST_TO_JOIN_STATES as COLUMN_STATES,
} from "@OpenFarm/db/schema/venture";
import {
  LIVE_REQUEST_STATES,
  REQUEST_TO_JOIN_STATES,
  isLiveRequest,
} from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

// The domain says where a Request to Join stands so the portal can read it without the database; the schema says it
// for the column and for the index that keeps one live Request per Venture. This is where the two have to agree.

describe("where a Request to Join stands", () => {
  it("is the same list the column accepts, in the same order", () => {
    expect([...REQUEST_TO_JOIN_STATES]).toEqual([...COLUMN_STATES]);
  });

  it("is live in the same places the one-live-Request index counts", () => {
    expect([...LIVE_REQUEST_STATES]).toEqual([...COLUMN_LIVE]);
    expect(REQUEST_TO_JOIN_STATES.filter(isLiveRequest)).toEqual([
      ...COLUMN_LIVE,
    ]);
  });
});
