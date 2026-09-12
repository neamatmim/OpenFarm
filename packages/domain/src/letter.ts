/** What the letter to the Upazila Livestock Officer has to say, from what the farm knows. */
export interface NotifiableLetter {
  farmName: string;
  tagNumber: string;
  /** The Vet's own words for the disease — what the Diagnosis says, not a translation. */
  disease: string;
  /** The dates as the reader reads them — Bangla digits, formatted by the caller, because how
   *  a date looks is the i18n package's business and this package depends on nothing. */
  diagnosedOn: string;
  vetName: string;
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
 * The Act requires the report in writing and without delay (Animal Disease Act 2005, s.3); the
 * farm's own registration number joins the heading when registration arrives (increment 7).
 */
export const notifiableLetter = (letter: NotifiableLetter): string =>
  [
    "বরাবর,",
    "উপজেলা প্রাণিসম্পদ কর্মকর্তা",
    "",
    `বিষয়: ${letter.disease} রোগ সম্পর্কে অবহিতকরণ`,
    "",
    "জনাব,",
    "",
    `আমাদের খামার "${letter.farmName}"-এ একটি পশুর মধ্যে ${letter.disease} রোগ শনাক্ত হয়েছে। প্রাণিরোগ আইন, ২০০৫ অনুসারে বিষয়টি বিলম্ব না করে আপনাকে লিখিতভাবে জানানো হলো।`,
    "",
    `পশুর ট্যাগ নম্বর: ${letter.tagNumber}`,
    `রোগ শনাক্তের তারিখ: ${letter.diagnosedOn}`,
    `শনাক্তকারী ভেটেরিনারিয়ান: ${letter.vetName}`,
    "",
    "প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য অনুরোধ করছি।",
    "",
    "বিনীত,",
    letter.reportedByName,
    letter.farmName,
    letter.reportedOn,
  ].join("\n");
