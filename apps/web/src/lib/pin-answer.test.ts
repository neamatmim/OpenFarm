import { describe, expect, it } from "vitest";

import { pinAnswerOf } from "./pin-answer";

// A PIN Switch the farm answered is said as the farm said it; only a phone the farm never heard from falls back to
// checking the PIN against the roster it holds.

describe("what the farm made of a PIN", () => {
  it("is no answer at all with no signal, or a farm that fell over", () => {
    expect(pinAnswerOf(new TypeError("Failed to fetch"))).toBe("no_signal");
    expect(pinAnswerOf({ status: 503 })).toBe("no_signal");
    expect(pinAnswerOf({ status: 408 })).toBe("no_signal");
  });

  it("is the phone taken off the farm's list, said apart so the phone can be enrolled again", () => {
    expect(
      pinAnswerOf({ status: 403, data: { refusal: "phone_revoked" } })
    ).toBe("revoked");
  });

  it("is a refusal for a wrong PIN, a lockout, a person who may not work here", () => {
    expect(pinAnswerOf({ status: 401 })).toBe("refused");
    expect(pinAnswerOf({ status: 429 })).toBe("refused");
    expect(pinAnswerOf({ status: 403 })).toBe("refused");
  });
});
