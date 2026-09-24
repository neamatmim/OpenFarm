import type { AdjustmentOutcome } from "@OpenFarm/db/schema/venture";

import type { ChargeWord } from "./settlement-store";

// The wording an Investor Statement puts around its figures, kept out of the procedures that assemble them — as
// `paper-words.ts` keeps an Animal's. The terms an Investor agreed to are not here: they are the Version of the
// Investment Agreement he signed (template-store), which the joining letter reads its terms from.

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
