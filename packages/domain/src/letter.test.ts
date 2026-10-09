import { describe, expect, it } from "vitest";

import type { NotifiableLetter } from "./letter";
import { notifiableLetterPaper } from "./letter";
import { paperText } from "./paper-text";

const LETTER: NotifiableLetter = {
  farm: {
    name: "সবুজ ছায়া ডেইরি",
    address: "সাভার, ঢাকা",
    phone: "+8801711000098",
    registrationNumber: "DLS/SAV/2026/1",
    registrationOffice: null,
    registrationIssuedOn: null,
    registrationExpiresOn: null,
  },
  tagNumber: "D-0007",
  disease: "তড়কা",
  diagnosedOn: "2026-10-08",
  vetName: "ডা. করিম",
  treatedWith: [{ bn: "পেনিসিলিন", en: "Penicillin" }],
  reportedByName: "ম্যানেজার",
  reportedOn: "2026-10-09",
};

describe("the letter to the Upazila Livestock Officer, on paper", () => {
  it("is addressed to the officer under the Act, says the animal, the day, the vet and what was done, and is signed", () => {
    const bn = paperText(notifiableLetterPaper(LETTER), "bn");
    expect(bn).toContain("উপজেলা প্রাণিসম্পদ কর্মকর্তা");
    expect(bn).toContain("তড়কা রোগ সম্পর্কে অবহিতকরণ");
    expect(bn).toContain("প্রাণিরোগ আইন, ২০০৫");
    expect(bn).toContain("পশুর ট্যাগ নম্বর: D-0007");
    expect(bn).toContain("রোগ শনাক্তের তারিখ: ৮ অক্টোবর, ২০২৬");
    expect(bn).toContain("শনাক্তকারী ভেটেরিনারিয়ান: ডা. করিম");
    expect(bn).toContain("গৃহীত ব্যবস্থা: পেনিসিলিন প্রয়োগ করা হয়েছে");
    expect(bn).toContain("বিনীত: ম্যানেজার");
    // Dated by its day, under the farm's name.
    expect(bn).toContain("৯ অক্টোবর, ২০২৬ · সবুজ ছায়া ডেইরি");
  });

  it("reads in English too, the disease in the vet's own words", () => {
    const en = paperText(notifiableLetterPaper(LETTER), "en");
    expect(en).toContain("Upazila Livestock Officer");
    expect(en).toContain("Notice of a notifiable disease: তড়কা");
    expect(en).toContain("Animal Disease Act 2005");
    expect(en).toContain("Measures taken: Penicillin given");
  });

  it("says when nothing has been given yet, and refuses a letter with a hole in it", () => {
    expect(
      paperText(notifiableLetterPaper({ ...LETTER, treatedWith: [] }), "en")
    ).toContain("Measures taken: No medicine given yet");
    expect(() => notifiableLetterPaper({ ...LETTER, vetName: " " })).toThrow();
  });
});
