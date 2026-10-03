import type { PaymentMethod } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";

import type { BakiTyped } from "./baki";
import { somethingPaid } from "./baki";

// What a Sale still needs before the farm will take it, in the order the sheet asks for it — so a Save pressed too
// soon names the first thing missing and goes to its box, rather than standing grey with its reason out of sight.

/** What the sheet holds of a Sale, as far as whether it can be sent is concerned. */
export interface SaleTyped {
  tagNumber: string;
  buyerName: string;
  priceBdt: string;
  weightKg: string;
  destination: string;
  vehicle: string;
  driver: string;
  paymentMethod: PaymentMethod;
  account: { farmAccountId: string; reference: string };
  baki: BakiTyped;
}

/** The first thing a Sale still needs: what to tell the person, and the box to send them to. */
export interface SaleMissing {
  said: MessageKey;
  at: string;
}

const blank = (typed: string) => typed.trim() === "";

/** What was paid at the gate, as far as the farm would take it: a figure, not above the price, and a promised day
 *  when some of it is still owed. The farm's own words where it would refuse the same. */
const bakiMissing = (typed: SaleTyped): SaleMissing | null => {
  if (!typed.baki.owed) {
    return null;
  }
  const paid = Number(typed.baki.paidNow);
  if (blank(typed.baki.paidNow) || Number.isNaN(paid) || paid < 0) {
    return { said: "sale.missing.paidNow", at: "sale-baki-paid-now" };
  }
  if (paid > Number(typed.priceBdt)) {
    return { said: "refusal.paidMoreThanPrice", at: "sale-baki-paid-now" };
  }
  if (typed.baki.promisedBy === "") {
    return { said: "refusal.bakiNeedsAPromise", at: "sale-baki-promised-by" };
  }
  return null;
};

/** Which of the farm's accounts bKash or bank money went into, and its transaction ID — asked only where something
 *  was paid at the gate and the farm lists an open account of that kind, as the farm itself asks. */
const accountMissing = (
  typed: SaleTyped,
  accountKindsOpen: ReadonlySet<"bkash" | "bank">
): SaleMissing | null => {
  const method = typed.paymentMethod;
  const asked =
    method !== "cash" &&
    somethingPaid(typed.baki) &&
    accountKindsOpen.has(method);
  if (!asked) {
    return null;
  }
  if (typed.account.farmAccountId === "") {
    return { said: "refusal.namesNoFarmAccount", at: "sale-paid-by-account" };
  }
  if (blank(typed.account.reference)) {
    return { said: "refusal.needsItsReference", at: "sale-paid-by-reference" };
  }
  return null;
};

/**
 * The first thing the Sale still needs, or nothing once the farm could take it.
 *
 * Not whether anything is Ready: a cull off the dairy side goes to the butcher by her tag whether or not a fattening
 * bull is Ready that day, and the farm takes her — it asks only that she is here and out of her withdrawal. Asking the
 * list here held Save shut on exactly the day the typed tag was offered for.
 */
export const saleStillMissing = (
  typed: SaleTyped,
  accountKindsOpen: ReadonlySet<"bkash" | "bank">
): SaleMissing | null => {
  if (blank(typed.tagNumber)) {
    return { said: "sale.missing.animal", at: "sale-animal" };
  }
  if (blank(typed.buyerName)) {
    return { said: "sale.missing.buyer", at: "sale-buyer" };
  }
  if (!(Number(typed.priceBdt) > 0)) {
    return { said: "sale.missing.price", at: "sale-price" };
  }
  if (!(Number(typed.weightKg) > 0)) {
    return { said: "sale.missing.weight", at: "sale-weight" };
  }
  const money = bakiMissing(typed) ?? accountMissing(typed, accountKindsOpen);
  if (money) {
    return money;
  }
  if (blank(typed.destination)) {
    return { said: "sale.missing.destination", at: "sale-destination" };
  }
  if (blank(typed.vehicle)) {
    return { said: "sale.missing.vehicle", at: "sale-vehicle" };
  }
  if (blank(typed.driver)) {
    return { said: "sale.missing.driver", at: "sale-driver" };
  }
  return null;
};
