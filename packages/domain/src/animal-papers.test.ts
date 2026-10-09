import { describe, expect, it } from "vitest";

import type { PassportFacts, WithdrawalSummaryFacts } from "./animal-papers";
import { animalPassportPaper, withdrawalSummaryPaper } from "./animal-papers";
import { paperText } from "./paper-text";

const FARM = {
  name: "সবুজ ছায়া ডেইরি",
  address: "সাভার, ঢাকা",
  phone: "+8801711000098",
  registrationNumber: "DLS/SAV/2026/1",
  registrationOffice: null,
  registrationIssuedOn: null,
  registrationExpiresOn: null,
};
const PRODUCED = {
  producedAt: { bn: "১০ জুন ২০২৬", en: "10 June 2026" },
  producedBy: "মোঃ আব্দুল করিম",
};
const DOSE = {
  product: { bn: "আইভারমেকটিন", en: "Ivermectin" },
  givenOn: "2026-06-01",
  meatClearOn: "2026-06-29",
  prescribedBy: "ডা. হাসান",
  advice: null,
  givenBy: "শফিকুল ইসলাম",
};
const HELD = {
  clear: false,
  clearOn: "2026-06-29",
  shortened: {
    on: "2026-06-05",
    reason: "দ্বিতীয় ডোজ দেওয়া হয়নি",
    wouldHaveRunTo: "2026-07-10",
  },
};

const PASSPORT: PassportFacts = {
  farm: FARM,
  tagNumber: "F-0049",
  sex: "male",
  breed: { bn: "শাহীওয়াল", en: "Sahiwal" },
  born: null,
  estimatedAgeMonths: 18,
  boughtFrom: { seller: "আলমগীর হোসেন" },
  arrivedOn: "2026-03-01",
  pens: [
    { penName: "পেন ক", from: "2026-04-01", until: null },
    { penName: "কোয়ারেন্টাইন", from: "2026-03-01", until: "2026-04-01" },
  ],
  doses: [DOSE],
  weighIns: [{ kg: 320.5, on: "2026-06-01" }],
  withdrawal: HELD,
  moreThanShown: true,
  leftFor: null,
  left: null,
  ...PRODUCED,
};

describe("the animal passport, on paper", () => {
  it("says who she is and where she came from in one language", () => {
    const en = paperText(animalPassportPaper(PASSPORT), "en");
    expect(en).toContain("Animal passport");
    expect(en).toContain("Tag number: F-0049");
    expect(en).toContain("Sex: Male");
    expect(en).toContain("Breed: Sahiwal");
    expect(en).toContain("Age: About 18 months, estimated at intake");
    expect(en).toContain("Source: Bought from আলমগীর হোসেন");
    expect(en).toContain("Arrived: 1 March 2026");
    const bn = paperText(animalPassportPaper(PASSPORT), "bn");
    expect(bn).toContain("লিঙ্গ: পুরুষ");
    expect(bn).not.toContain("Male");
  });

  it("says whether her meat may be sold, and that a vet shortened the hold", () => {
    const en = paperText(animalPassportPaper(PASSPORT), "en");
    expect(en).toContain("For meat: Not clear — clear from 29 June 2026");
    expect(en).toContain("Shortened by a vet: 5 June 2026");
    expect(en).toContain("Doses alone would have run to: 10 July 2026");
    expect(en).toContain("Reason: দ্বিতীয় ডোজ দেওয়া হয়নি");
  });

  it("tables her pens, her doses with where each came from, and her weigh-ins, saying when there are earlier ones", () => {
    const en = paperText(animalPassportPaper(PASSPORT), "en");
    expect(en).toContain("পেন ক · 1 April 2026 · Still there");
    expect(en).toContain(
      "1 June 2026 · Ivermectin · 29 June 2026 · Prescribed by ডা. হাসান · শফিকুল ইসলাম"
    );
    expect(en).toContain("1 June 2026 · 320.5");
    expect(en).toContain("Some earlier records are not on this page.");
  });

  it("says a dose from a campaign, and one advised without a prescription", () => {
    const en = paperText(
      animalPassportPaper({
        ...PASSPORT,
        doses: [
          { ...DOSE, prescribedBy: null, advice: null, meatClearOn: null },
          { ...DOSE, prescribedBy: null, advice: "জ্বর ছিল" },
        ],
      }),
      "en"
    );
    expect(en).toContain("Ivermectin · No meat withdrawal · Campaign");
    expect(en).toContain("Not prescribed: জ্বর ছিল");
  });
});

const SUMMARY: WithdrawalSummaryFacts = {
  farm: FARM,
  tagNumber: "F-0049",
  asOf: "2026-06-10",
  withdrawal: { clear: true, clearOn: null, shortened: null },
  doses: [DOSE],
  lookBackDays: 30,
  ...PRODUCED,
};

const PAPERS = () => [
  animalPassportPaper(PASSPORT),
  withdrawalSummaryPaper(SUMMARY),
];

describe("the withdrawal summary, on paper", () => {
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

  it("answers first, then the doses of the last thirty days", () => {
    const en = paperText(withdrawalSummaryPaper(SUMMARY), "en");
    expect(en).toContain("Treatment and withdrawal summary");
    expect(en).toContain("F-0049 is clear for meat on 10 June 2026.");
    expect(en).toContain("Treatments in the last 30 days");
    expect(en).toContain("Ivermectin");
    const bn = paperText(withdrawalSummaryPaper(SUMMARY), "bn");
    expect(bn).toContain("গত ৩০ দিনের চিকিৎসা");
  });

  it("says when she is held, and until when", () => {
    const en = paperText(
      withdrawalSummaryPaper({ ...SUMMARY, withdrawal: HELD }),
      "en"
    );
    expect(en).toContain(
      "F-0049 is not clear for meat on 10 June 2026: clear from 29 June 2026."
    );
    expect(en).toContain("Shortened by a vet: 5 June 2026");
  });

  it("says so when nothing was given", () => {
    const en = paperText(
      withdrawalSummaryPaper({ ...SUMMARY, doses: [] }),
      "en"
    );
    expect(en).toContain("Nothing was given in this time.");
  });
});
