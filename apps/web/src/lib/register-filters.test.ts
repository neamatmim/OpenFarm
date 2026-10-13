import { describe, expect, it } from "vitest";

import type { PaidThrough } from "./register-filters";
import {
  NO_FILTERS,
  paidThroughOf,
  paidThroughValue,
  passes,
} from "./register-filters";

const bkashFee = {
  direction: "out" as const,
  approval: "not_needed" as const,
  counterpartyName: "বিকাশ",
  note: null,
  paymentMethod: "mobile_money" as const,
  farmAccountId: "acc-bkash",
};
const cashRent = {
  ...bkashFee,
  counterpartyName: "বাড়িওয়ালা",
  paymentMethod: "cash" as const,
  farmAccountId: null,
};
const bankRent = {
  ...bkashFee,
  paymentMethod: "bank" as const,
  farmAccountId: "acc-sonali",
};

const through = (paidThrough: PaidThrough) => ({ ...NO_FILTERS, paidThrough });

describe("the money book read against one statement", () => {
  it("lets through only what went through the account chosen", () => {
    const filters = through({ kind: "account", accountId: "acc-bkash" });
    expect(passes(filters, bkashFee, "Fees")).toBe(true);
    expect(passes(filters, bankRent, "Rent")).toBe(false);
    expect(passes(filters, cashRent, "Rent")).toBe(false);
  });

  it("lets through every entry paid one way, whichever account", () => {
    const filters = through({ kind: "method", method: "cash" });
    expect(passes(filters, cashRent, "Rent")).toBe(true);
    expect(passes(filters, bkashFee, "Fees")).toBe(false);
  });

  it("lets everything through when nothing is chosen", () => {
    expect(passes(NO_FILTERS, bankRent, "Rent")).toBe(true);
  });

  it("keeps a way and an account apart, whatever an account's id looks like", () => {
    const account: PaidThrough = { kind: "account", accountId: "cash" };
    expect(paidThroughOf(paidThroughValue(account))).toEqual(account);
    const method: PaidThrough = { kind: "method", method: "bank" };
    expect(paidThroughOf(paidThroughValue(method))).toEqual(method);
    expect(paidThroughOf("")).toEqual({ kind: "any" });
    expect(paidThroughOf("method:cheque")).toEqual({ kind: "any" });
  });
});
