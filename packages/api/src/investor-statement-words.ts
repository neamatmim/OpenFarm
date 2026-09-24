import type { AdjustmentOutcome } from "@OpenFarm/db/schema/venture";
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

/** What an Agreement settles that its seven lines say: the split, the window and the Arbitrator. */
export interface AgreementTerms {
  investorsPercent: number;
  targetWindowStart: string;
  targetWindowEnd: string;
  arbitrator: string;
}

/**
 * The seven plain lines of what an Investor agrees to — on the paper he signs, and again on the letter he is handed
 * when his money lands. One wording, so the two can never tell him different things.
 */
export const agreementClauses = (
  terms: AgreementTerms,
  /** How long the Wind-up Period runs, as the Farm has it set. */
  windUpDays: number
): string[] => [
  "এটি একটি মুদারাবা চুক্তি: আপনার মূলধন, খামারের পরিচালনা।",
  `মুনাফা ভাগ হবে বিনিয়োগকারী ${digits(terms.investorsPercent)}% এবং খামার ${digits(theFarmsShare(terms.investorsPercent))}%, মূলধন সম্পূর্ণ ফেরতের পর।`,
  "ক্ষতি হলে তা মূলধন থেকে যাবে; খামার কোনো মুনাফার নিশ্চয়তা দেয় না।",
  "কোনো পশু মারা গেলে তা এই ভেঞ্চারের ক্ষতি, কোনো একজন বিনিয়োগকারীর নয়।",
  `বিক্রয়ের লক্ষ্য সময়: ${onDay(terms.targetWindowStart)} থেকে ${onDay(terms.targetWindowEnd)}।`,
  `এরপর ${digits(windUpDays)} দিনের গুটিয়ে আনার সময়; সে সময়ের পরেও যে পশু থাকবে খামার তা কিনে নেবে। ভেঞ্চার শেষ হওয়ার আগে মূলধন তুলে নেওয়ার সুযোগ নেই।`,
  `মতভেদ হলে সালিস: ${terms.arbitrator}।`,
];

/** The seven clauses as a letter prints them, each with its number in Bangla numerals. */
export const agreementTerms = (
  terms: AgreementTerms,
  windUpDays: number
): string[] =>
  agreementClauses(terms, windUpDays).map(
    (clause, index) => `${digits(index + 1)}. ${clause}`
  );

/**
 * The seven plain lines a যোগদানপত্র sets out: what he actually agreed to, in the farm's own words rather
 * than the deed's.
 *
 * A man who has just handed over five lakh taka against a stamped instrument written by a lawyer is owed a
 * sheet that tells him what it means. The deed governs; this says it plainly. Worded from **his own**
 * Agreement, because another man on the same Venture may have signed a different split — and as amended,
 * where it has been.
 */
export const joiningTerms = (standing: HisStanding, windUpDays: number) =>
  agreementTerms(standing.agreement, windUpDays);

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

/** What became of the cattle, in lines a man reads rather than a table he decodes. */
export const herdStoryWords = (
  story: {
    boughtCount: number;
    averageBoughtBdt: number | null;
    soldCount: number;
    averageSoldBdt: number | null;
    boughtBackCount: number;
    diedCount: number;
  },
  said: (value: number) => string
): string[] =>
  [
    `কেনা হয়েছে / Bought: ${said(story.boughtCount)}${
      story.averageBoughtBdt === null
        ? ""
        : ` · গড়ে ${said(story.averageBoughtBdt)} টাকা`
    }`,
    `বিক্রি হয়েছে / Sold: ${said(story.soldCount)}${
      story.averageSoldBdt === null
        ? ""
        : ` · গড়ে ${said(story.averageSoldBdt)} টাকা`
    }`,
    story.boughtBackCount > 0
      ? `খামার কিনে নিয়েছে / Bought back by the Farm: ${said(story.boughtBackCount)}`
      : null,
    `মারা গেছে / Lost: ${said(story.diedCount)}`,
  ].filter((line) => line !== null);

/**
 * What became of one Settlement Adjustment, said rather than spelled out as the word the database keeps.
 *
 * Exhaustive against the stored outcomes, so a fifth one fails to compile here rather than printing an
 * English enum into the middle of a Bangla sheet.
 */
const ADJUSTMENT_OUTCOMES = {
  noted: "লেখা আছে / noted",
  outstanding: "বাকি আছে / outstanding",
  paid: "পাঠানো হয়েছে / paid",
  waived: "মওকুফ / waived",
} as const satisfies Record<AdjustmentOutcome, string>;

export const adjustmentWords = (outcome: AdjustmentOutcome): string =>
  ADJUSTMENT_OUTCOMES[outcome];
