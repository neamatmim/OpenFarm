import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatDigits, translate } from "@OpenFarm/i18n";

import type { Said } from "./papers";

/**
 * An Investor's Nominees (the glossary's **Nominee** and **Nomination**): who collects their capital and share from the
 * Farm if they die before a Venture settles, and hands it on to the lawful heirs. None, or up to three; each collects a
 * whole-percent share of what is paid, the shares adding to a hundred. A Nominee under eighteen on the day the paper is
 * signed collects through their **Receiver**. One set of rules, read by the server that refuses and the form that warns.
 */

/** The most Nominees one Nomination names — the most generous of the market's own forms. */
export const MOST_NOMINEES = 3;

/** The age a Nominee collects for themselves, and no longer through a Receiver. */
export const COMING_OF_AGE = 18;

const WHOLE = 100;

const filledIn = (text: string | null | undefined) => text?.trim() || null;

/** Somebody who collects a minor Nominee's share until they come of age. */
export interface Receiver {
  name: string;
  /** Their relation to the Nominee, in words. */
  relation: string | null;
  phone: string | null;
  /** Their NID number: they are who collects. Unknown only for one written down before Receivers gave it. */
  nid: string | null;
}

/** One Nominee, as a Nomination names them. */
export interface Nominee {
  name: string;
  /** Their relation to the Investor, in words. */
  relation: string | null;
  phone: string | null;
  /** A farm day; unknown only for a nominee carried over from before dates of birth were kept. */
  bornOn: string | null;
  /** Their NID number, for one eighteen or over on the paper's day; unknown only for one written down before Nominees
   *  gave it. */
  nid: string | null;
  /** Their birth registration number, for one under eighteen, who has no NID yet; unknown only for one written down
   *  before Nominees gave it. */
  birthRegistration: string | null;
  sharePercent: number;
  receiver: Receiver | null;
}

/**
 * Whether somebody born on `bornOn` is under eighteen on `day`, both farm days: a minor until the eighteenth birthday
 * itself. One born on the 29th of February comes of age on the 1st of March in a year without one.
 */
export const isMinorOn = (bornOn: string, day: string): boolean => {
  const [year, rest] = [bornOn.slice(0, 4), bornOn.slice(4)];
  const eighteenth = `${String(Number(year) + COMING_OF_AGE).padStart(4, "0")}${rest}`;
  return day < eighteenth;
};

/** The first thing wrong with a list of Nominees a paper would name, and which of them it is (from 1). */
export interface NomineesProblem {
  code:
    | "too_many"
    | "name_missing"
    | "born_missing"
    | "born_in_future"
    | "shares_not_whole"
    | "shares_not_hundred"
    | "receiver_missing"
    | "receiver_not_needed"
    | "nid_missing"
    | "birth_registration_missing"
    | "receiver_nid_missing";
  /** The Nominee it is about, by their place on the paper; none for a problem of the whole list. */
  at?: number;
}

const problemWith = (
  one: Nominee,
  onDay: string
): NomineesProblem["code"] | null => {
  if (!one.name.trim()) {
    return "name_missing";
  }
  if (!one.bornOn) {
    return "born_missing";
  }
  if (one.bornOn > onDay) {
    return "born_in_future";
  }
  if (!Number.isInteger(one.sharePercent) || one.sharePercent < 1) {
    return "shares_not_whole";
  }
  const minor = isMinorOn(one.bornOn, onDay);
  const hasReceiver = Boolean(one.receiver?.name.trim());
  if (minor && !hasReceiver) {
    return "receiver_missing";
  }
  if (!minor && one.receiver) {
    return "receiver_not_needed";
  }
  // Nobody has an NID before eighteen: a minor is known by their birth registration, and an adult by their NID.
  if (!(minor || filledIn(one.nid))) {
    return "nid_missing";
  }
  if (minor && !filledIn(one.birthRegistration)) {
    return "birth_registration_missing";
  }
  if (minor && !filledIn(one.receiver?.nid)) {
    return "receiver_nid_missing";
  }
  return null;
};

/**
 * What stops a paper signed on `onDay` naming these Nominees, or null when nothing does. None is allowed: the money
 * then goes to the heirs, and the Owner is reminded, never refused.
 */
export const nomineesProblem = (
  nominees: readonly Nominee[],
  onDay: string
): NomineesProblem | null => {
  if (nominees.length > MOST_NOMINEES) {
    return { code: "too_many" };
  }
  for (const [index, one] of nominees.entries()) {
    const code = problemWith(one, onDay);
    if (code) {
      return { code, at: index + 1 };
    }
  }
  const total = nominees.reduce((sum, one) => sum + one.sharePercent, 0);
  const someNamed = nominees.length > 0;
  if (someNamed && total !== WHOLE) {
    return { code: "shares_not_hundred" };
  }
  return null;
};

/**
 * A Nominee as a paper signed on `onDay` keeps them: known by their NID if eighteen or over that day, and by their birth
 * registration if not — never both, so a number written in before their date of birth was put right is not kept.
 */
export const knownBy = (one: Nominee, onDay: string): Nominee => {
  const minor = one.bornOn !== null && isMinorOn(one.bornOn, onDay);
  return {
    ...one,
    nid: minor ? null : filledIn(one.nid),
    birthRegistration: minor ? filledIn(one.birthRegistration) : null,
    receiver: one.receiver
      ? { ...one.receiver, nid: filledIn(one.receiver.nid) }
      : null,
  };
};

/** A Nominee as a paper prints them: whether they are a minor is judged on the paper's own day, by whoever lays it
 *  out. */
export interface PaperNominee extends Nominee {
  minor: boolean;
}

/** One Nominee's row of a paper's table, said in both languages: names, relations and numbers as they were typed. */
export interface NomineeRow {
  name: string;
  relation: Said | null;
  /** Their date of birth, or nothing for one carried over without it. */
  born: Said | null;
  /** Their NID number, or a minor's birth registration number; nothing for one written down before either was
   *  asked. */
  idNumber: string | null;
  minor: boolean;
  phone: string | null;
  /** "৫০%" / "50%". */
  share: Said;
  /** Who collects for a minor: "রহিমা বেগম (মা), 01712-345678, এনআইডি 1987…". */
  receiver: Said | null;
}

/** The headings of a paper's Nominee table, in the order of a row. */
export const NOMINEE_HEADINGS = {
  name: { bn: "নমিনি", en: "Nominee" },
  relation: { bn: "সম্পর্ক", en: "Relation" },
  born: { bn: "জন্মতারিখ", en: "Born" },
  idNumber: { bn: "এনআইডি / জন্ম নিবন্ধন", en: "NID / birth registration" },
  phone: { bn: "ফোন", en: "Phone" },
  share: { bn: "অংশ", en: "Share" },
  minor: { bn: "নাবালক", en: "Minor" },
  receiver: { bn: "গ্রহণকারী", en: "Receiver" },
} as const;

/** A share as a Bangla paper writes it. */
export const shareInBangla = (percent: number) =>
  `${formatDigits(percent, "bn")}%`;

/** A farm day as a paper in `language` writes it. */
export const dayIn = (farmDay: string, language: Language) =>
  formatDate(new Date(`${farmDay}T00:00:00Z`), language, "date");

/** A farm day as a Bangla paper writes it. */
export const dayInBangla = (farmDay: string) => dayIn(farmDay, "bn");

/** A farm day said in both languages, each with its own numerals. */
export const daySaid = (farmDay: string): Said => ({
  bn: dayIn(farmDay, "bn"),
  en: dayIn(farmDay, "en"),
});

/** The relations a form offers, kept as their Bangla words: the ones a paper read in English can say in English. */
const USUAL_RELATIONS = [
  "wife",
  "husband",
  "son",
  "daughter",
  "father",
  "mother",
  "brother",
  "sister",
] as const;

/** A relation as a paper says it: one of the usual ones in each language, and any other in the words it was written in,
 *  which both readings print as they are. */
export const relationSaid = (word: string | null): Said | null => {
  const kept = filledIn(word);
  if (!kept) {
    return null;
  }
  const usual = USUAL_RELATIONS.find(
    (relation) => translate("bn", `investors.relation.${relation}`) === kept
  );
  return {
    bn: kept,
    en: usual ? translate("en", `investors.relation.${usual}`) : kept,
  };
};

/** The Receiver as one line, in both languages: their name, their relation to the Nominee in brackets, then a phone
 *  and their NID where there are. */
export const receiverLine = (receiver: Receiver): Said => {
  const relation = relationSaid(receiver.relation);
  const phone = filledIn(receiver.phone);
  const nid = filledIn(receiver.nid);
  const line = (language: Language, nidWord: string) =>
    [
      relation ? `${receiver.name} (${relation[language]})` : receiver.name,
      phone,
      nid ? `${nidWord} ${nid}` : null,
    ]
      .filter(Boolean)
      .join(", ");
  return { bn: line("bn", "এনআইডি"), en: line("en", "NID") };
};

/** One Nominee as a paper's table prints them. */
export const nomineeRowOf = (nominee: PaperNominee): NomineeRow => ({
  name: nominee.name,
  relation: relationSaid(nominee.relation),
  born: nominee.bornOn ? daySaid(nominee.bornOn) : null,
  idNumber: filledIn(nominee.minor ? nominee.birthRegistration : nominee.nid),
  minor: nominee.minor,
  phone: filledIn(nominee.phone),
  share: {
    bn: shareInBangla(nominee.sharePercent),
    en: `${nominee.sharePercent}%`,
  },
  receiver: nominee.receiver ? receiverLine(nominee.receiver) : null,
});
