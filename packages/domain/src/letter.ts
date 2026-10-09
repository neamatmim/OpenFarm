import type { FarmIdentity } from "./farm";
import { daySaid } from "./nominees";
import type { PaperDocument } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { Said } from "./papers";

/** What the letter to the Upazila Livestock Officer has to say, from what the farm knows. */
export interface NotifiableLetter {
  /** The Farm Identity, as the office files it. Whatever the farm has not written down is left off the letterhead: the
   *  letter still goes, because a notifiable disease does not wait for paperwork. */
  farm: FarmIdentity;
  tagNumber: string;
  /** The Vet's own words for the disease — what the Diagnosis says, not a translation. */
  disease: string;
  /** The farm day the disease was found. */
  diagnosedOn: string;
  vetName: string;
  /** What the farm has already given the animal, by product. The office's next question. */
  treatedWith: Said[];
  /** Who is sending it, and when. */
  reportedByName: string;
  reportedAt: Said;
}

/** Products in one language, run together as a sentence lists them. */
const listed = (products: readonly Said[], language: keyof Said) =>
  products.map((one) => one[language]).join(", ");

/**
 * The report of a notifiable disease to the Upazila Livestock Officer, on one page: on the Farm Identity letterhead,
 * read in Bangla or English, addressed to the officer under the Act, the animal, the day, the vet and what the farm has
 * done, the request, and a box to sign. What it says is only what the farm already knows: nothing here asks the Manager
 * to type anything a record could have told it.
 *
 * The Act requires the report in writing and without delay (Animal Disease Act 2005, s.3).
 */
export const notifiableLetterPaper = (
  letter: NotifiableLetter
): PaperDocument => {
  // A notice with a blank farm, animal, disease or signatory is not a notice. Better to refuse to write it than to hand
  // somebody a page with a hole in it and let them take it to the office.
  const missing = (
    [
      ["farmName", letter.farm.name],
      ["tagNumber", letter.tagNumber],
      ["disease", letter.disease],
      ["vetName", letter.vetName],
      ["reportedByName", letter.reportedByName],
    ] as const
  ).filter(([, value]) => value.trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `the letter cannot be written without ${missing.map(([field]) => field).join(", ")}`
    );
  }
  const { name } = letter.farm;
  const { disease } = letter;
  const treated: Said =
    letter.treatedWith.length > 0
      ? {
          bn: `${listed(letter.treatedWith, "bn")} প্রয়োগ করা হয়েছে`,
          en: `${listed(letter.treatedWith, "en")} given`,
        }
      : {
          bn: "এখনও কোনো ওষুধ প্রয়োগ করা হয়নি",
          en: "No medicine given yet",
        };
  return {
    letterhead: letterheadOf(letter.farm),
    title: {
      bn: `বিষয়: ${disease} রোগ সম্পর্কে অবহিতকরণ`,
      en: `Notice of a notifiable disease: ${disease}`,
    },
    preamble: {
      bn: `বরাবর, উপজেলা প্রাণিসম্পদ কর্মকর্তা।\n\nজনাব,\nআমাদের খামার "${name}"-এ একটি পশুর মধ্যে ${disease} রোগ শনাক্ত হয়েছে। প্রাণিরোগ আইন, ২০০৫ অনুসারে বিষয়টি বিলম্ব না করে আপনাকে লিখিতভাবে জানানো হলো।`,
      en: `To the Upazila Livestock Officer.\n\nSir or Madam,\n${disease} has been found in an animal on our farm, "${name}". Under the Animal Disease Act 2005 we inform you of it in writing, without delay.`,
    },
    sections: [
      {
        kind: "facts",
        heading: { bn: "বিবরণ", en: "Details" },
        rows: [
          {
            label: { bn: "পশুর ট্যাগ নম্বর", en: "Tag number" },
            value: letter.tagNumber,
          },
          {
            label: { bn: "রোগ শনাক্তের তারিখ", en: "Found on" },
            value: daySaid(letter.diagnosedOn),
          },
          {
            label: { bn: "শনাক্তকারী ভেটেরিনারিয়ান", en: "Diagnosing vet" },
            value: letter.vetName,
          },
          { label: { bn: "গৃহীত ব্যবস্থা", en: "Measures taken" }, value: treated },
        ],
        note: {
          bn: "প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য অনুরোধ করছি।",
          en: "We ask you to take the measures needed.",
        },
      },
      {
        kind: "signatures",
        heading: { bn: "স্বাক্ষর", en: "Signature" },
        signers: [
          {
            role: { bn: "বিনীত", en: "Yours faithfully" },
            name: letter.reportedByName,
          },
        ],
        dateBlank: null,
        witnesses: [],
        witnessBlanks: [],
      },
    ],
    closing: [],
    produced: {
      bn: `${letter.reportedAt.bn} · ${name}`,
      en: `${letter.reportedAt.en} · ${name}`,
    },
  };
};
