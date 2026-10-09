import { describe, expect, it } from "vitest";

import {
  herdSummaryPaper,
  registerDocument,
  registrationPaper,
} from "./inspector-papers";
import { paperText } from "./paper-text";

const FARM = {
  name: "সবুজ ছায়া ডেইরি",
  address: "সাভার, ঢাকা",
  phone: "+8801711000098",
  registrationNumber: "DLS/SAV/2044/1",
  registrationOffice: null,
  registrationIssuedOn: null,
  registrationExpiresOn: null,
};
const PRODUCED = {
  producedAt: { bn: "৩১ মার্চ ২০৪৪", en: "31 March 2044" },
  producedBy: "মোঃ আব্দুল করিম",
};

describe("a register on paper", () => {
  const register = {
    farm: FARM,
    title: { bn: "চিকিৎসার রেজিস্টার", en: "Treatment register" },
    from: "2044-03-01",
    to: "2044-03-31",
    none: {
      bn: "এই সময়ে কোনো চিকিৎসা হয়নি",
      en: "No treatments in this period",
    },
    records: [
      {
        heading: { bn: "৩ মার্চ, ২০৪৪ · F-0001", en: "3 March 2044 · F-0001" },
        fields: [
          {
            label: { bn: "রোগ", en: "Disease" },
            value: { bn: "জ্বর", en: "Fever" },
          },
          {
            label: { bn: "পথ", en: "Route" },
            value: { bn: "মুখে", en: "By mouth" },
          },
        ],
      },
    ],
    ...PRODUCED,
  };

  it("numbers its entries and heads each by what identifies it, its fields beneath in one language", () => {
    const en = paperText(registerDocument(register), "en");
    expect(en).toContain("Treatment register");
    expect(en).toContain("From 1 March 2044 to 31 March 2044.");
    expect(en).toContain("1 entry");
    expect(en).toContain(
      "3 March 2044 · F-0001\nDisease: Fever\nRoute: By mouth"
    );
    const bn = paperText(registerDocument(register), "bn");
    expect(bn).toContain("রোগ: জ্বর");
    expect(bn).not.toContain("Disease");
  });

  it("says when the period holds nothing", () => {
    const text = paperText(
      registerDocument({ ...register, records: [] }),
      "en"
    );
    expect(text).toContain("No treatments in this period");
  });
});

describe("the registration on paper", () => {
  it("says the number, office, days and whether it still stands", () => {
    const text = paperText(
      registrationPaper({
        farm: FARM,
        office: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
        issuedOn: "2043-04-01",
        expiresOn: "2044-04-10",
        standing: "ending_soon",
        certificateTakenOn: null,
        ...PRODUCED,
      }),
      "en"
    );
    expect(text).toContain("Registration number: DLS/SAV/2044/1");
    expect(text).toContain("Expires: 10 April 2044");
    expect(text).toContain("Standing: Ending soon");
    expect(text).toContain("Certificate photographed: —");
  });
});

describe("the herd summary on paper", () => {
  it("tables the herd by side and by pen, each with its states, and adds them up", () => {
    const text = paperText(
      herdSummaryPaper({
        farm: FARM,
        asOf: "2044-03-31",
        total: 5,
        bySide: [
          {
            label: { bn: "দুগ্ধ", en: "Dairy" },
            animals: 5,
            states: [
              { label: { bn: "দুধেল", en: "Milking" }, count: 3 },
              { label: { bn: "শুকনো", en: "Dry" }, count: 2 },
            ],
          },
        ],
        byPen: [
          {
            label: "শেড ১ / পেন ক",
            animals: 5,
            states: [{ label: { bn: "দুধেল", en: "Milking" }, count: 5 }],
          },
        ],
        ...PRODUCED,
      }),
      "en"
    );
    expect(text).toContain("5 animals on the farm on 31 March 2044.");
    expect(text).toContain("Dairy · 5 · Milking 3 · Dry 2");
    expect(text).toContain("শেড ১ / পেন ক · 5 · Milking 5");
    expect(text).toContain("Total · 5");
  });
});
