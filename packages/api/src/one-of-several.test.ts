import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { refusedOne } from "./one-of-several";

// One animal of several the farm could not do it for is named by her own tag and a word the screen can say — whatever
// went wrong with her, so the answer always says who was done and who was not.

describe("why one of several was not done", () => {
  it("names her by her tag as the farm writes it", () => {
    expect(
      refusedOne(
        "f-12",
        new ORPCError("BAD_REQUEST", { data: { refusal: "not_fattening" } })
      )
    ).toEqual({ tagNumber: "F-0012", refusal: "not_fattening" });
  });

  it("says a refusal with no word of its own in a word the screen can say, never the server's code", () => {
    expect(
      refusedOne("F-0012", new ORPCError("INTERNAL_SERVER_ERROR")).refusal
    ).toBe("could_not_be_done");
  });

  it("names her as not done whatever went wrong, not only a refusal", () => {
    expect(refusedOne("F-0012", new Error("the connection dropped"))).toEqual({
      tagNumber: "F-0012",
      refusal: "could_not_be_done",
    });
  });
});
