import { describe, expect, it } from "vitest";

import { isTooEasyPin } from "./pin";

// A four-digit PIN is ten thousand guesses at most; one the whole shed would try first is not a PIN.

describe("a PIN too easy to guess", () => {
  it("is one digit four times, or a run up or down", () => {
    for (const easy of [
      "0000",
      "7777",
      "1234",
      "6789",
      "7890",
      "9876",
      "3210",
      "0987",
    ]) {
      expect(isTooEasyPin(easy)).toBe(true);
    }
  });

  it("is not any other four digits", () => {
    for (const fine of [
      "4821",
      "7314",
      "6041",
      "1235",
      "2468",
      "1122",
      "9055",
    ]) {
      expect(isTooEasyPin(fine)).toBe(false);
    }
  });
});
