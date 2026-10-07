import { asLoggedByAuth } from "@OpenFarm/auth/logged";
import { describe, expect, it } from "vitest";

// Better Auth writes a failed query whole into the server's log. What it writes goes through the farm's own logger,
// which keeps which statement failed and why, and leaves out what it was sent.

const HASH = "a1b2c3d4e5f6:9f8e7d6c5b4a39281706f5e4d3c2b1a0";

describe("what Better Auth may write in the server's log", () => {
  it("keeps which statement failed and why, never the password's hash or the address it was sent", () => {
    const underneath = new Error(
      'duplicate key value violates unique constraint "account_pkey"'
    );
    const failed = new Error(
      `Failed query: insert into "account" ("id", "account_id", "password") values ($1, $2, $3)\nparams: acc-1,owner@farm.example,${HASH}`,
      { cause: underneath }
    );
    const written = JSON.stringify(asLoggedByAuth(failed));
    expect(written).toContain('insert into \\"account\\"');
    expect(written).toContain("account_pkey");
    expect(written).not.toContain(HASH);
    expect(written).not.toContain("owner@farm.example");
  });

  it("writes nothing it cannot read as words: an object by its kind alone", () => {
    expect(asLoggedByAuth({ password: HASH })).toEqual({ logged: "object" });
  });
});
