import type { AdjustmentOutcome } from "@OpenFarm/db/schema/venture-account";
import type { DocumentRow, Said } from "@OpenFarm/domain";
import { countSaid, daysSaid, kgSaid, moneySaid } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";

import type { ChargeWord } from "./settlement-store";

// The wording an Investor Statement puts around its figures, kept out of the procedures that assemble them — as
// `paper-words.ts` keeps an Animal's. Said in both languages, each with its own numerals, because a paper is read in
// Bangla or in English (ADR 0021). The terms an Investor agreed to are not here: they are the Version of the Investment
// Agreement they signed (template-store), which the joining letter reads its terms from.

/** What a beast nobody has weighed since she arrived says in the gain column: that the farm does not
 *  know, which is a different fact from her not growing. */
export const NOT_WEIGHED: Said = { bn: "ওজন নেওয়া হয়নি", en: "not weighed" };

/** Her daily gain as the per-Animal table prints it, or the words for no reading at all. */
export const gainWords = (
  dailyGainKg: number | null,
  overDays: number | null
): Said => {
  if (dailyGainKg === null || overDays === null) {
    return NOT_WEIGHED;
  }
  const gain = kgSaid(dailyGainKg);
  return {
    bn: `${gain.bn} (${formatNumber(overDays, "bn")} দিনে)`,
    en: `${gain.en} (over ${daysSaid(overDays).en})`,
  };
};

/**
 * What each of the Settlement's seven charge words is called on a paper, in both languages.
 *
 * Named exhaustively against `ChargeWord`, so that adding an eighth charge fails to compile here rather
 * than printing an Investor a line with no label on it.
 */
const CHARGE_LABELS = {
  bought: { bn: "পশু কেনা", en: "Cattle bought" },
  market_toll: { bn: "হাসিল", en: "Haat toll" },
  trips: { bn: "যাতায়াত", en: "Trips" },
  feed: { bn: "খাবার", en: "Feed" },
  medicine: { bn: "ওষুধ", en: "Medicine" },
  vet: { bn: "পশুচিকিৎসক", en: "Vet" },
  herd: { bn: "সাধারণ খরচ", en: "Herd costs" },
} as const satisfies Record<ChargeWord, Said>;

export const chargeWords = (word: ChargeWord): Said => CHARGE_LABELS[word];

/** What share of a Venture one Agreement's Units are, as a whole-number percentage. Their own holding and
 *  nobody else's: the rest of the Units are other people's business. */
export const shareOfUnits = (his: number, all: number): number =>
  all > 0 ? Math.round((his * 100) / all) : 0;

/** A count, and what each fetched on average where anything was paid. */
const countAndAverage = (count: number, averageMoney: number | null): Said => {
  const counted = countSaid(count);
  if (averageMoney === null) {
    return counted;
  }
  const average = moneySaid(averageMoney);
  return {
    bn: `${counted.bn} · গড়ে ${average.bn}`,
    en: `${counted.en} · ${average.en} on average`,
  };
};

/** What became of the cattle, a line to each fact a person reads rather than a table they decode. */
export const herdStoryWords = (story: {
  boughtCount: number;
  averageBoughtMoney: number | null;
  soldCount: number;
  averageSoldMoney: number | null;
  boughtBackCount: number;
  /** Missing from a story told before a bull sold on to another Venture was counted. */
  soldAcrossCount?: number;
  diedCount: number;
  /** Missing from a story told before a lost animal could be made good. */
  lostCount?: number;
}): DocumentRow[] => {
  const soldAcross = story.soldAcrossCount ?? 0;
  const lost = story.lostCount ?? 0;
  return [
    {
      label: { bn: "কেনা হয়েছে", en: "Bought" },
      value: countAndAverage(story.boughtCount, story.averageBoughtMoney),
    },
    {
      label: { bn: "বিক্রি হয়েছে", en: "Sold" },
      value: countAndAverage(story.soldCount, story.averageSoldMoney),
    },
    story.boughtBackCount > 0
      ? {
          label: { bn: "খামার কিনে নিয়েছে", en: "Bought back by the Farm" },
          value: countSaid(story.boughtBackCount),
        }
      : null,
    soldAcross > 0
      ? {
          label: { bn: "অন্য ভেঞ্চারে বিক্রি", en: "Sold to another Venture" },
          value: countSaid(soldAcross),
        }
      : null,
    { label: { bn: "মারা গেছে", en: "Died" }, value: countSaid(story.diedCount) },
    lost > 0
      ? {
          label: {
            bn: "হারিয়ে গেছে, খামার ক্ষতিপূরণ দিয়েছে",
            en: "Lost, made good by the Farm",
          },
          value: countSaid(lost),
        }
      : null,
  ].filter((row) => row !== null);
};

/**
 * What became of one Settlement Adjustment, said rather than spelled out as the word the database keeps.
 *
 * Exhaustive against the stored outcomes, so a fifth one fails to compile here rather than printing an
 * English enum into the middle of a Bangla paper.
 */
const ADJUSTMENT_OUTCOMES = {
  noted: { bn: "লেখা আছে", en: "noted" },
  outstanding: { bn: "বাকি আছে", en: "outstanding" },
  paid: { bn: "পাঠানো হয়েছে", en: "paid" },
  waived: { bn: "মওকুফ", en: "waived" },
} as const satisfies Record<AdjustmentOutcome, Said>;

export const adjustmentWords = (outcome: AdjustmentOutcome): Said =>
  ADJUSTMENT_OUTCOMES[outcome];
