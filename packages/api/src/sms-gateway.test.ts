import { describe, expect, it } from "vitest";

import { tookIt } from "./sms-gateway";

describe("a text the gateway answered", () => {
  it("counts as sent only when the answer says so, where the farm said what it says", () => {
    // 200 with an error inside, as many local gateways answer.
    expect(
      tookIt(true, '{"response_code":1007,"error":"Balance low"}', "202")
    ).toBe(false);
    expect(
      tookIt(true, '{"response_code":202,"success_message":"SMS sent"}', "202")
    ).toBe(true);
    expect(tookIt(false, "202", "202")).toBe(false);
  });

  it("takes a 2xx at its word where the farm said nothing", () => {
    expect(tookIt(true, "")).toBe(true);
    expect(tookIt(false, "")).toBe(false);
  });
});
