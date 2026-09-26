import { describe, expect, it } from "vitest";

import type { Investor } from "./investor-types";
import { matching } from "./investor-types";

// What the search over the Investors answers. The Owner is standing with somebody in front of her or a phone in her
// hand, so a name and a phone number are what she has to search by — and what she must not be able to search by is
// anybody's bank account.

const aPerson = (some: Partial<Investor> = {}): Investor =>
  ({
    id: "one",
    name: "আবুল হাশেম মিয়া",
    phone: "01711-223344",
    address: "বিরুলিয়া বাজার, সাভার, ঢাকা",
    nid: "1994 7712 334455",
    bankAccount: "ডাচ্-বাংলা ব্যাংক · 1051 0023 44781",
    nomination: null,
    unitsHeld: 16,
    ...some,
  }) as Investor;

describe("searching the Investors", () => {
  it("shows everybody before anything is typed", () => {
    expect(matching(aPerson(), "")).toBe(true);
    expect(matching(aPerson(), "   ")).toBe(true);
  });

  it("finds a person by part of their name", () => {
    expect(matching(aPerson(), "হাশেম")).toBe(true);
  });

  it("finds a person by part of their phone", () => {
    expect(matching(aPerson(), "01711")).toBe(true);
  });

  it("does not answer for somebody else", () => {
    expect(matching(aPerson(), "সালমা")).toBe(false);
  });

  it("ignores the case of a name written in English", () => {
    expect(matching(aPerson({ name: "Abul Hashem Mia" }), "hashem")).toBe(true);
  });

  it("does not search the NID or the bank account", () => {
    expect(matching(aPerson(), "334455")).toBe(false);
    expect(matching(aPerson(), "1051")).toBe(false);
  });
});
