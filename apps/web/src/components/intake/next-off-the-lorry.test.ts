import { describe, expect, it } from "vitest";

import type { IntakeFields } from "./intake-fields";
import {
  EMPTY,
  missingFrom,
  nextOffTheLorry,
  typedSince,
} from "./intake-fields";

/** The third bull off a Gabtoli lorry, as the Manager left the form once he was taken in. */
const thirdBull: IntakeFields = {
  ...EMPTY,
  penId: "quarantine-1",
  sex: "male",
  sellerName: "Karim Bepari",
  sellerPlace: "Gabtoli",
  sellerPhone: "01711000000",
  purchasePriceMoney: "92000",
  marketTollMoney: "1500",
  buyingTripId: "trip-1",
  ventureId: "venture-1",
  weightKg: "212",
  estimatedAgeMonths: "22",
  breedId: "pabna",
  targetWeightKg: "320",
  targetWindowStart: "2027-05-14",
  targetWindowEnd: "2027-05-17",
  paymentMethod: "cash",
  reference: "TRX-1",
  paidOn: "2026-10-13",
  farmAccountId: "account-1",
  arrivedAt: "2026-10-13T16:30",
  heldBy: "manager-1",
};

describe("the next beast off the same lorry", () => {
  it("keeps where she came from, who sold her, how she was paid for and what she is fed for", () => {
    expect(nextOffTheLorry(thirdBull)).toMatchObject({
      penId: "quarantine-1",
      sex: "male",
      sellerName: "Karim Bepari",
      sellerPlace: "Gabtoli",
      sellerPhone: "01711000000",
      buyingTripId: "trip-1",
      ventureId: "venture-1",
      targetWindowStart: "2027-05-14",
      targetWindowEnd: "2027-05-17",
      paymentMethod: "cash",
      paidOn: "2026-10-13",
      farmAccountId: "account-1",
      arrivedAt: "2026-10-13T16:30",
      heldBy: "manager-1",
    });
  });

  it("asks again for what only this beast can say: her price, toll, weight, age, breed and target, and the transfer that paid for her", () => {
    const next = nextOffTheLorry(thirdBull);

    expect(next).toMatchObject({
      purchasePriceMoney: "",
      marketTollMoney: "",
      weightKg: "",
      estimatedAgeMonths: "",
      breedId: "",
      targetWeightKg: "",
      reference: "",
    });
    expect(missingFrom(next)).toEqual([
      "intake.price",
      "intake.weight",
      "intake.age",
    ]);
  });
});

describe("what the form holds for the next beast", () => {
  it("is nothing typed, until somebody types her own figures", () => {
    const held = nextOffTheLorry(thirdBull);

    expect(typedSince(held, held)).toBe(false);
    expect(typedSince({ ...held, weightKg: "198" }, held)).toBe(true);
    expect(typedSince(thirdBull, EMPTY)).toBe(true);
  });
});
