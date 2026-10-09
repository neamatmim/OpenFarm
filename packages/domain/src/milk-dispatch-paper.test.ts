import { describe, expect, it } from "vitest";

import type { MilkDispatchFacts } from "./milk-dispatch-paper";
import { milkDispatchPaper } from "./milk-dispatch-paper";
import { paperText } from "./paper-text";

const FACTS: MilkDispatchFacts = {
  farm: {
    name: "সবুজ ছায়া ডেইরি",
    address: "সাভার, ঢাকা",
    phone: "+8801711000098",
    registrationNumber: "DLS/SAV/2036/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  from: "2036-02-01",
  to: "2036-02-02",
  dispatches: [
    {
      at: new Date("2036-02-01T02:30:00.000Z"),
      liters: 11.8,
      buyerName: "মিল্ক ভিটা সংগ্রহ কেন্দ্র",
      buyerAddress: "বিরুলিয়া, সাভার",
      deliveryNote: "CH-0412",
      fatPercent: 4.1,
      snfPercent: 8.4,
    },
    {
      at: new Date("2036-02-02T11:00:00.000Z"),
      liters: 20,
      buyerName: "মা মিষ্টান্ন",
      buyerAddress: null,
      deliveryNote: null,
      fatPercent: null,
      snfPercent: null,
    },
  ],
  producedAt: { bn: "২ ফেব্রুয়ারি ২০৩৬", en: "2 February 2036" },
  producedBy: "মোঃ আব্দুল করিম",
};

const PAPERS = () => [milkDispatchPaper(FACTS)];

describe("the milk dispatch record, on paper", () => {
  it("gives every row and every total one cell to each column", () => {
    for (const section of PAPERS().flatMap((one) => one.sections)) {
      if (section.kind === "table") {
        for (const line of [
          ...section.rows,
          ...(section.foot ? [section.foot] : []),
        ]) {
          expect(line).toHaveLength(section.columns.length);
        }
      }
    }
  });

  it("tables every dispatch with its buyer, address and delivery note, and adds the liters up", () => {
    const text = paperText(milkDispatchPaper(FACTS), "en");

    expect(text).toContain("Milk dispatch record");
    expect(text).toContain("1 February 2036");
    expect(text).toContain(
      "মিল্ক ভিটা সংগ্রহ কেন্দ্র\nবিরুলিয়া, সাভার · CH-0412 · 11.8 · 4.1 / 8.4"
    );
    // A dispatch with no note or test leaves a dash, never a blank.
    expect(text).toContain("মা মিষ্টান্ন · — · 20 · —");
    expect(text).toContain("Total · 31.8 liters");
  });

  it("reads wholly in Bangla, its liters in Bangla numerals", () => {
    const text = paperText(milkDispatchPaper(FACTS), "bn");

    expect(text).toContain("দুধ হস্তান্তরের রেকর্ড");
    expect(text).toContain("৩১.৮ লিটার");
    expect(text).not.toContain("Milk dispatch record");
  });

  it("says so when no milk left the farm", () => {
    const text = paperText(
      milkDispatchPaper({ ...FACTS, dispatches: [] }),
      "en"
    );

    expect(text).toContain("No milk was dispatched in this period.");
  });
});
