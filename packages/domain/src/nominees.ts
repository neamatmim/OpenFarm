import { formatDate, formatDigits } from "@OpenFarm/i18n";

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

/** Somebody who collects a minor Nominee's share until they come of age. */
export interface Receiver {
  name: string;
  /** Their relation to the Nominee, in words. */
  relation: string | null;
  phone: string | null;
}

/** One Nominee, as a Nomination names them. */
export interface Nominee {
  name: string;
  /** Their relation to the Investor, in words. */
  relation: string | null;
  phone: string | null;
  /** A farm day; unknown only for a nominee carried over from before dates of birth were kept. */
  bornOn: string | null;
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
    | "receiver_not_needed";
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

/** A Nominee as a paper prints them: whether they are a minor is judged on the paper's own day, by whoever lays it
 *  out. */
export interface PaperNominee extends Nominee {
  minor: boolean;
}

/** One Nominee's row of a paper's table, in Bangla, the paper's language. */
export interface NomineeRow {
  name: string;
  relation: string | null;
  /** Their date of birth, or nothing for one carried over without it. */
  born: string | null;
  minor: boolean;
  phone: string | null;
  /** "৫০%". */
  share: string;
  /** Who collects for a minor: "রহিমা বেগম (মা), 01712-345678". */
  receiver: string | null;
}

/** The headings of a paper's Nominee table, in the order of a row. */
export const NOMINEE_HEADINGS = {
  name: { bn: "নমিনি", en: "Nominee" },
  relation: { bn: "সম্পর্ক", en: "Relation" },
  born: { bn: "জন্মতারিখ", en: "Born" },
  phone: { bn: "ফোন", en: "Phone" },
  share: { bn: "অংশ", en: "Share" },
  minor: { bn: "নাবালক", en: "Minor" },
  receiver: { bn: "গ্রহণকারী", en: "Receiver" },
} as const;

const filledIn = (text: string | null | undefined) => text?.trim() || null;

/** A share as a Bangla paper writes it. */
export const shareInBangla = (percent: number) =>
  `${formatDigits(percent, "bn")}%`;

/** A farm day as a Bangla paper writes it. */
export const dayInBangla = (farmDay: string) =>
  formatDate(new Date(`${farmDay}T00:00:00Z`), "bn", "date");

/** The Receiver as one line: their name, their relation to the Nominee in brackets, and a phone where there is one. */
export const receiverLine = (receiver: Receiver) => {
  const relation = filledIn(receiver.relation);
  const phone = filledIn(receiver.phone);
  const who = relation ? `${receiver.name} (${relation})` : receiver.name;
  return phone ? `${who}, ${phone}` : who;
};

/** One Nominee as a paper's table prints them. */
export const nomineeRowOf = (nominee: PaperNominee): NomineeRow => ({
  name: nominee.name,
  relation: filledIn(nominee.relation),
  born: nominee.bornOn ? dayInBangla(nominee.bornOn) : null,
  minor: nominee.minor,
  phone: filledIn(nominee.phone),
  share: shareInBangla(nominee.sharePercent),
  receiver: nominee.receiver ? receiverLine(nominee.receiver) : null,
});
