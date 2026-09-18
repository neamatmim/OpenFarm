import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { HisStanding } from "./investor-statement-store";
import { theFarmsShare } from "./investor-store";

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
