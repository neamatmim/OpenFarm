import { VENTURE_STATES as COLUMN_STATES } from "@OpenFarm/db/schema/venture";
import { VENTURE_STATES } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

// The domain says a Venture's states so both sides can read them without depending on the database.
// This is the seam where the two lists have to agree, and it lives here because this is the package
// that depends on both. No database: it is a question about two declarations.

describe("the Venture's states", () => {
  it("are the same list the column accepts, in the same order", () => {
    // Order as well as membership: the screens draw tabs and badges from the domain's list, and a
    // state the column would take but the domain has never heard of arrives as a blank badge.
    expect([...VENTURE_STATES]).toEqual([...COLUMN_STATES]);
  });
});
