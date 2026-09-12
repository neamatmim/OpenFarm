import type { FarmIdentity } from "./farm";
import { farmOfOriginLines } from "./farm";

/** What the letter to the Upazila Livestock Officer has to say, from what the farm knows. */
export interface NotifiableLetter {
  /** The Farm Identity, as the office files it. Whatever the farm has not written down is left
   *  off: the letter still goes, because a notifiable disease does not wait for paperwork. */
  farm: FarmIdentity;
  tagNumber: string;
  /** The Vet's own words for the disease — what the Diagnosis says, not a translation. */
  disease: string;
  /** The dates as the reader reads them — Bangla digits, formatted by the caller, because how
   *  a date looks is the i18n package's business and this package depends on nothing. */
  diagnosedOn: string;
  vetName: string;
  /** What the farm has already given the animal, by product. The office's next question. */
  treatedWith: string[];
  /** Who is sending it, and when. */
  reportedByName: string;
  reportedOn: string;
}

/**
 * The report of a notifiable disease to the Upazila Livestock Officer, in Bangla, on one page.
 *
 * Written out as one string rather than assembled on a screen, because it is a legal notice the
 * farm may have to produce again years later and it should read the same every time. What it
 * says is only what the farm already knows: nothing here asks the Manager to type anything a
 * record could have told it.
 *
 * The Act requires the report in writing and without delay (Animal Disease Act 2005, s.3). The
 * farm's address, phone and registration number head the letter when it has written them down,
 * and are simply left off when it has not — the notice must not wait for them.
 */
export const notifiableLetter = (letter: NotifiableLetter): string => {
  // A notice with a blank farm, animal, disease or signatory is not a notice. Better to refuse
  // to write it than to hand somebody a page with a hole in it and let them take it to the
  // office.
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
  return [
    // The farm of origin, as the office files it — the same heading the receipt and the
    // transport card carry.
    ...farmOfOriginLines(letter.farm),
    "",
    "বরাবর,",
    "উপজেলা প্রাণিসম্পদ কর্মকর্তা",
    "",
    `বিষয়: ${letter.disease} রোগ সম্পর্কে অবহিতকরণ`,
    "",
    "জনাব,",
    "",
    `আমাদের খামার "${name}"-এ একটি পশুর মধ্যে ${letter.disease} রোগ শনাক্ত হয়েছে। প্রাণিরোগ আইন, ২০০৫ অনুসারে বিষয়টি বিলম্ব না করে আপনাকে লিখিতভাবে জানানো হলো।`,
    "",
    `পশুর ট্যাগ নম্বর: ${letter.tagNumber}`,
    `রোগ শনাক্তের তারিখ: ${letter.diagnosedOn}`,
    `শনাক্তকারী ভেটেরিনারিয়ান: ${letter.vetName}`,
    letter.treatedWith.length > 0
      ? `গৃহীত ব্যবস্থা: ${letter.treatedWith.join(", ")} প্রয়োগ করা হয়েছে`
      : "গৃহীত ব্যবস্থা: এখনও কোনো ওষুধ প্রয়োগ করা হয়নি",
    "",
    "প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য অনুরোধ করছি।",
    "",
    "বিনীত,",
    letter.reportedByName,
    name,
    letter.reportedOn,
  ].join("\n");
};
