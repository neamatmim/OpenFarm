import type { Said, Worded } from "./papers";

/**
 * What each of OpenFarm's standard fact lines says in English, by what it says in Bangla. Until 2026-10-08 a fact said
 * only its Bangla, and a paper read in English printed "টাকা" and Bangla numerals in the middle of its English (ADR
 * 0021). Every Version worded before then — the papers already signed on it included — holds these same lines, so an
 * English reading of any of them is said in English too.
 */
const ENGLISH_FACTS: Readonly<Record<string, string>> = {
  "{unitPrice} টাকা": "{unitPrice} taka",
  "{capital} টাকা": "{capital} taka",
  "{windUpDays} দিন": "{windUpDays} days",
  "{cattlePart} টাকা, কেনা শুরুর আগে": "{cattlePart} taka, before buying starts",
  "{monthlySum} টাকা, {firstSumDue} থেকে {lastSumDue} পর্যন্ত প্রতি মাসের ১০ তারিখে ({sums})":
    "{monthlySum} taka on the 10th of every month, {firstSumDue} to {lastSumDue} ({sums})",
  "বিনিয়োগকারী {investorsPercent}% · খামার {farmPercent}%":
    "Investor {investorsPercent}% · Farm {farmPercent}%",
};

/** A line of nothing but fields: "{ventureName}", "{windowStart} – {windowEnd}". */
const ONLY_FIELDS = /^(?:\{\w+\}|[\s–·-])+$/u;

/**
 * A fact line's wording in both languages: as it is, where it says both; a standard line said in Bangla alone, with its
 * English; a line of nothing but fields, the same in both; and any other line the Owner wrote in Bangla alone, with its
 * English left empty for the paper to read in Bangla.
 */
export const factSaid = (value: Worded): Said => {
  if (typeof value !== "string") {
    return value;
  }
  const english =
    ENGLISH_FACTS[value] ?? (ONLY_FIELDS.test(value) ? value : "");
  return { bn: value, en: english };
};
