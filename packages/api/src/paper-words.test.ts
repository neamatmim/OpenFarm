import { formatDate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { doseWords, leftWords, sexWords } from "./paper-words";

// A dose on a paper says what it held her for as the gate reads it — the days kept on the dose — and says where it came
// from: a Vet's course, a campaign, or the advice it was given on.

const givenAt = new Date("2032-03-01T04:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("a dose on a paper", () => {
  it("is clear for meat on the days kept on the dose, not the product's days now", () => {
    const said = doseWords(
      {
        givenAt,
        meatWithdrawalDays: 21,
        advice: null,
        instanceId: "work",
        product: { nameBn: "ওষুধ", meatWithdrawalDays: 3 },
        giver: null,
        prescription: { vet: { name: "ডা. রহিম" } },
      },
      "en"
    );
    expect(said.meatClearOn).toBe(
      formatDate(new Date(givenAt.getTime() + 21 * DAY), "en", "date")
    );
  });

  it("given without a Prescription, says so and why — never a campaign", () => {
    const said = doseWords(
      {
        givenAt,
        meatWithdrawalDays: 28,
        advice: "জ্বর, ফার্মেসির পরামর্শে",
        instanceId: null,
        product: { nameBn: "ওষুধ", meatWithdrawalDays: null },
        giver: null,
        prescription: null,
      },
      "en"
    );
    expect(said).toMatchObject({
      prescribedBy: null,
      advice: "জ্বর, ফার্মেসির পরামর্শে",
    });
    expect(said.meatClearOn).not.toBeNull();
  });
});

describe("an animal on a paper", () => {
  it("is said female or male in Bangla, as the farm's paper is written", () => {
    expect(sexWords("female")).toBe("স্ত্রী / female");
    expect(sexWords("male")).toBe("পুরুষ / male");
  });

  it("says how she left when she did not leave by a Sale", () => {
    const at = new Date("2032-03-05T04:00:00.000Z");
    expect(leftWords({ how: "died", at }, "bn")).toContain("মারা গেছে / died");
    expect(leftWords({ how: "culled", at }, "bn")).toContain(
      "বাদ দেওয়া / culled"
    );
    expect(leftWords({ how: "lost", at }, "bn")).toContain("হারিয়ে গেছে / lost");
    expect(leftWords({ how: "sold", at }, "bn")).toBeNull();
    expect(leftWords(null, "bn")).toBeNull();
  });
});
