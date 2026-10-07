import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { pinAnswerOf } from "./pin-answer";

// A PIN Switch the farm answered is said as the farm said it; only a phone the farm never heard from falls back to
// checking the PIN against the roster it holds. The errors are the client's own: an oRPC error carries its code and
// data and no HTTP status, so a fake `{ status: 403 }` once passed here while every real refusal read as no signal.

const answered = (code: string, refusal?: string) =>
  new ORPCError(code, {
    message: "the farm's own words",
    data: refusal ? { refusal } : undefined,
  });

describe("what the farm made of a PIN", () => {
  it("is no answer at all with no signal, or a farm that fell over or timed out", () => {
    expect(pinAnswerOf(new TypeError("Failed to fetch"))).toBe("no_signal");
    expect(pinAnswerOf(answered("SERVICE_UNAVAILABLE"))).toBe("no_signal");
    expect(pinAnswerOf(answered("INTERNAL_SERVER_ERROR"))).toBe("no_signal");
    expect(pinAnswerOf(answered("BAD_GATEWAY"))).toBe("no_signal");
    expect(pinAnswerOf(answered("GATEWAY_TIMEOUT"))).toBe("no_signal");
    expect(pinAnswerOf(answered("TIMEOUT"))).toBe("no_signal");
  });

  it("is the phone taken off the farm's list, said apart so the phone can be enrolled again", () => {
    expect(pinAnswerOf(answered("FORBIDDEN", "phone_revoked"))).toBe("revoked");
  });

  it("is a refusal for a wrong PIN, a lockout, a person who may not work here", () => {
    expect(pinAnswerOf(answered("UNAUTHORIZED"))).toBe("refused");
    expect(pinAnswerOf(answered("TOO_MANY_REQUESTS"))).toBe("refused");
    expect(pinAnswerOf(answered("FORBIDDEN"))).toBe("refused");
    expect(pinAnswerOf(answered("BAD_REQUEST", "pin_wrong"))).toBe("refused");
  });
});
