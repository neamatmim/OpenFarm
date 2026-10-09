import type { Language } from "@OpenFarm/i18n";

import type { Side } from "./lifecycle";

/**
 * What the farm's papers share: the words a paper is written in — each said in Bangla and in English, and read in one
 * (ADR 0021) — a Side's name, the registers an inspector is handed, and the line every Investor paper ends on. Each
 * paper itself is laid out as a `PaperDocument` in a module of its own.
 */

/** Each Side by its name, in Bangla and English, as the farm's papers print it. */
export const SIDE_LABEL: Record<Side, [string, string]> = {
  dairy: ["দুগ্ধ", "Dairy"],
  fattening: ["মোটাতাজাকরণ", "Fattening"],
};

/** The registers the Inspector View prints, by the name the trail records each under. */
export const INSPECTOR_REGISTERS = [
  "registration",
  "herd_summary",
  "vaccination_register",
  "treatment_register",
  "disease_history",
  "mortality_register",
] as const;
export type InspectorRegister = (typeof INSPECTOR_REGISTERS)[number];

/** The health registers, which cover a period: a year of vaccinations, thirty days of treatments, six months of
 *  diagnoses, a year of deaths. */
export type HealthRegister = Extract<
  InspectorRegister,
  | "vaccination_register"
  | "treatment_register"
  | "disease_history"
  | "mortality_register"
>;

/**
 * The footer every **Investor Statement** carries, in both languages.
 *
 * On all three papers, every time, because a paper may be all an Investor ever reads — the portal is by
 * invitation, and only while the farm keeps it open (ADR 0007) — so the terms have to be in front of him
 * whenever the Farm tells him anything at all. Said here once so that the three cannot come to say it
 * three ways.
 */
export const NO_GUARANTEE_LINES = [
  "কোনো মুনাফার নিশ্চয়তা নেই। ক্ষতি হলে তা মূলধন থেকে যাবে।",
  "No return is guaranteed. A loss comes off capital.",
] as const;

/** The same footer as one piece of wording, for a paper read in either language. */
export const NO_GUARANTEE: Said = {
  bn: NO_GUARANTEE_LINES[0],
  en: NO_GUARANTEE_LINES[1],
};

/** What a paper writes of an Organization beyond its name, address and phone (ADR 0020): its own papers, the paper
 *  that names its Signatory, and the Signatory. */
export interface PaperOrganization {
  tradeLicense: string | null;
  rjscNumber: string | null;
  tin: string | null;
  authority: string;
  /** The authority's date, as the paper writes a day. */
  authorityOn: string | null;
  signatory: { name: string; role: string | null; nid: string | null };
}

/** Words in both of the farm's languages: a paper is read in either, whichever its reader chooses (ADR 0021). */
export interface Said {
  bn: string;
  en: string;
}

/**
 * What a paper writes: words in both languages, or one string that reads the same in either — a name, a phone, a
 * number as it was typed. A paper kept before its values were said in both holds a string, read the same way.
 */
export type Worded = string | Said;

/** Words as a paper in `language` writes them: its own, or — where the Owner left that language empty — the Bangla, so
 *  nothing on a paper goes blank. */
export const inLanguage = (words: Worded, language: Language): string => {
  if (typeof words === "string") {
    return words;
  }
  return words[language].trim() ? words[language] : words.bn;
};

/** One line of a document: what it is, and what it says. */
export interface DocumentRow {
  label: Said;
  value: Worded;
}
