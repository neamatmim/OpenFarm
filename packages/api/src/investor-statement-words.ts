import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { HisStanding } from "./investor-statement-store";
import { theFarmsShare } from "./investor-store";
import type { ChargeWord } from "./settlement-store";

/**
 * The wording an Investor Statement puts around its figures, kept out of the procedures that assemble
 * them — as `paper-words.ts` keeps an Animal's.
 *
 * Bangla throughout, and in Bangla digits whoever is printing it. The labels on these sheets are bilingual
 * like every other paper's, but these are whole sentences a man reads for his own terms: an English date
 * or an Arabic-numeral percentage dropped into the middle of one is the line his eye stops on, which is
 * why the transport card pins its own language too. The reader here is the Investor, not the Owner who
 * happens to be at the screen.
 */
const BANGLA = "bn" as const;

const digits = (value: number) => formatNumber(value, BANGLA);

const onDay = (farmDay: string) =>
  formatDate(new Date(`${farmDay}T00:00:00Z`), BANGLA, "date");

/**
 * The seven plain lines a যোগদানপত্র sets out: what he actually agreed to, in the farm's own words rather
 * than the deed's.
 *
 * A man who has just handed over five lakh taka against a stamped instrument written by a lawyer is owed a
 * sheet that tells him what it means. The deed governs; this says it plainly. Worded from **his own**
 * Agreement, because another man on the same Venture may have signed a different split.
 */
export const joiningTerms = (
  standing: HisStanding,
  /** How long the Wind-up Period runs, as the Farm has it set. */
  windUpDays: number
): string[] => [
  "১. এটি একটি মুদারাবা চুক্তি: আপনার মূলধন, খামারের পরিচালনা।",
  `২. মুনাফা ভাগ হবে বিনিয়োগকারী ${digits(standing.agreement.investorsPercent)}% এবং খামার ${digits(theFarmsShare(standing.agreement.investorsPercent))}%, মূলধন সম্পূর্ণ ফেরতের পর।`,
  "৩. ক্ষতি হলে তা মূলধন থেকে যাবে; খামার কোনো মুনাফার নিশ্চয়তা দেয় না।",
  "৪. কোনো পশু মারা গেলে তা এই ভেঞ্চারের ক্ষতি, কোনো একজন বিনিয়োগকারীর নয়।",
  `৫. বিক্রয়ের লক্ষ্য সময়: ${onDay(standing.agreement.targetWindowStart)} থেকে ${onDay(standing.agreement.targetWindowEnd)}।`,
  `৬. এরপর ${digits(windUpDays)} দিনের গুটিয়ে আনার সময়; সে সময়ের পরেও যে পশু থাকবে খামার তা কিনে নেবে। ভেঞ্চার শেষ হওয়ার আগে মূলধন তুলে নেওয়ার সুযোগ নেই।`,
  `৭. মতভেদ হলে সালিস: ${standing.agreement.arbitrator}।`,
];

/** What a beast nobody has weighed since she arrived says in the gain column: that the farm does not
 *  know, which is a different fact from her not growing. */
export const NOT_WEIGHED = "ওজন নেওয়া হয়নি / not weighed";

/** Her daily gain as the per-Animal table prints it, or the words for no reading at all. */
export const gainWords = (
  dailyGainKg: number | null,
  overDays: number | null,
  said: (value: number) => string
): string =>
  dailyGainKg === null || overDays === null
    ? NOT_WEIGHED
    : `${said(dailyGainKg)} কেজি (${said(overDays)} দিনে)`;

/**
 * What each of the Settlement's seven charge words is called on a paper, Bangla with the English
 * alongside.
 *
 * Named exhaustively against `ChargeWord`, so that adding an eighth charge fails to compile here rather
 * than printing an Investor a line with no label on it.
 */
const CHARGE_LABELS = {
  bought: "পশু কেনা / Cattle bought",
  hasil: "হাসিল / Haat toll",
  trips: "যাতায়াত / Trips",
  feed: "খাবার / Feed",
  medicine: "ওষুধ / Medicine",
  vet: "পশুচিকিৎসক / Vet",
  herd: "সাধারণ খরচ / Herd costs",
} as const satisfies Record<ChargeWord, string>;

export const chargeWords = (word: ChargeWord): string => CHARGE_LABELS[word];

/** What share of a Venture one Agreement's Units are, as a whole-number percentage. His own holding and
 *  nobody else's: the rest of the Units are other men's business. */
export const shareOfUnits = (his: number, all: number): number =>
  all > 0 ? Math.round((his * 100) / all) : 0;
