import { farmDayOf } from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

import { doseOnPaper, leftOf } from "./paper-words";

// A dose on a paper says what it held her for as the gate reads it — the days kept on the dose — and says where it came
// from: a Vet's course, a campaign, or the advice it was given on.

const givenAt = new Date("2032-03-01T04:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("a dose on a paper", () => {
  it("is clear for meat on the days kept on the dose, not the product's days now", () => {
    const said = doseOnPaper({
      givenAt,
      meatWithdrawalDays: 21,
      advice: null,
      instanceId: "work",
      product: { nameBn: "ওষুধ", nameEn: null, meatWithdrawalDays: 3 },
      giver: null,
      prescription: { vet: { name: "ডা. রহিম" } },
    });
    expect(said.meatClearOn).toBe(
      farmDayOf(new Date(givenAt.getTime() + 21 * DAY))
    );
    // A product given no English name is read in its Bangla.
    expect(said.product).toEqual({ bn: "ওষুধ", en: "ওষুধ" });
  });

  it("given without a Prescription, says so and why — never a campaign", () => {
    const said = doseOnPaper({
      givenAt,
      meatWithdrawalDays: 28,
      advice: "জ্বর, ফার্মেসির পরামর্শে",
      instanceId: null,
      product: { nameBn: "ওষুধ", nameEn: "Medicine", meatWithdrawalDays: null },
      giver: null,
      prescription: null,
    });
    expect(said).toMatchObject({
      prescribedBy: null,
      advice: "জ্বর, ফার্মেসির পরামর্শে",
      product: { en: "Medicine" },
    });
    expect(said.meatClearOn).not.toBeNull();
  });
});

describe("an animal on a paper", () => {
  it("says how she left when she did not leave by a Sale", () => {
    const at = new Date("2032-03-05T04:00:00.000Z");
    expect(leftOf({ how: "died", at })).toEqual({
      how: "died",
      on: farmDayOf(at),
    });
    expect(leftOf({ how: "culled", at })?.how).toBe("culled");
    expect(leftOf({ how: "lost", at })?.how).toBe("lost");
    expect(leftOf({ how: "sold", at })).toBeNull();
    expect(leftOf(null)).toBeNull();
  });
});
