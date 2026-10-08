import type { Language } from "@OpenFarm/i18n";
import { currencySign, currencyWords, formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { countSaid, moneySaid } from "./joining-letter";
import { daySaid } from "./nominees";
import type { PaperDocument, PaperSection } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { DocumentRow, Said, Worded } from "./papers";
import { NO_GUARANTEE } from "./papers";

// The অগ্রগতি and the হিসাব নিকাশ as papers read in Bangla or in English (ADR 0021): every figure arrives as a number or
// a farm day and is said here in each language with its own numerals and its own words for taka, kilogrammes and days,
// so a paper read in English never carries a Bangla numeral, nor a Bangla one a Latin figure beside টাকা.

/** Kilogrammes as a paper in each language writes them. */
export const kgSaid = (kg: number): Said => ({
  bn: `${formatNumber(kg, "bn")} কেজি`,
  en: `${formatNumber(kg, "en")} kg`,
});

/** A count of days as a paper in each language writes it. */
export const daysSaid = (days: number): Said => ({
  bn: `${formatNumber(days, "bn")} দিন`,
  en: `${formatNumber(days, "en")} ${days === 1 ? "day" : "days"}`,
});

/** A whole-number percentage, in each language's numerals. */
const percentSaid = (percent: number): Said => ({
  bn: `${formatNumber(percent, "bn")}%`,
  en: `${formatNumber(percent, "en")}%`,
});

/** The same words in both languages, each half built by one function of the language. */
const both = (said: (language: Language) => string): Said => ({
  bn: said("bn"),
  en: said("en"),
});

const line = (label: Said, value: Worded): DocumentRow => ({ label, value });

/** Who the paper is for, and what it is about. */
const INVESTOR: Said = { bn: "বিনিয়োগকারী", en: "Investor" };
const VENTURE: Said = { bn: "ভেঞ্চার", en: "Venture" };

/** What a paper was made on and by whom, in each language. */
const producedSaid = (producedAt: Said, producedBy: string): Said => ({
  bn: `${producedAt.bn} · ${producedBy}`,
  en: `${producedAt.en} · ${producedBy}`,
});

/** One line of where the money has gone: what it is called, in both languages, and what it came to. */
export interface ChargeLine {
  label: Said;
  amountMoney: number;
}

/**
 * Where the money went, a line to each charge and the total set apart beneath it. With no line to show, the total
 * alone, as a fact: a column heading standing over nothing is a heading the reader has to work out the meaning of.
 */
const chargesSection = (
  heading: Said,
  lines: readonly ChargeLine[],
  total: { label: Said; amountMoney: number }
): PaperSection =>
  lines.length === 0
    ? {
        kind: "facts",
        heading,
        rows: [line(total.label, moneySaid(total.amountMoney))],
        note: null,
      }
    : {
        kind: "table",
        heading,
        columns: [
          { label: { bn: "খাত", en: "Spent on" } },
          { label: { bn: "টাকা", en: "Amount" }, figures: true },
        ],
        rows: lines.map((one) => [one.label, moneySaid(one.amountMoney)]),
        foot: [total.label, moneySaid(total.amountMoney)],
        note: null,
      };

/** One standing Animal on the progress statement: her tag, what she weighed, and her own daily gain already worded. */
export interface ProgressAnimal {
  tagNumber: string;
  /** Kilogrammes off the lorry, and at her latest reading; nothing where the scale has said nothing. */
  intakeKg: number | null;
  latestKg: number | null;
  /** Her own daily gain, or the words for a beast nobody has weighed since she came. */
  gain: Said;
}

/** অগ্রগতি — how one Investor's animals are doing, and where their money has gone. */
export interface ProgressStatementFacts {
  farm: FarmIdentity;
  investorName: string;
  ventureName: string;
  /** Their Units, and what share of the Venture they are — their own, never anybody else's. */
  units: number;
  sharePercent: number;
  /** The Units the Farm holds with its own money, of all the Venture's — as their Agreement told them; nothing where
   *  it holds none. */
  farmUnits: { units: number; ventureUnits: number } | null;
  /** Paid by the month: where they stand against their Monthly Sums; nothing for a Venture paid before buying, or one
   *  still gathering its capital. */
  monthlySums: {
    sums: number;
    sumsPaid: number;
    missedMoney: number;
    /** The next Monthly Sum still to pay — its farm day and what of it their Units pay — or nothing once none is left. */
    next: { dueOn: string; amountMoney: number } | null;
  } | null;
  /** Standing, sold, died, and lost and made good by the Farm. */
  standing: number;
  sold: number;
  died: number;
  lost: number;
  /** How many have been weighed, and what those weighed average. */
  weighed: number;
  averageIntakeKg: number | null;
  averageLatestKg: number | null;
  /** The herd's daily gain over every animal it has had, or nothing where nobody has been weighed yet. */
  herdGainKgPerDay: number | null;
  daysToWindow: number;
  /** The animals standing. */
  animals: ProgressAnimal[];
  spend: ChargeLine[];
  spendTotalMoney: number;
  budgets: {
    /** What the plan set aside for buying animals, and what of it is not yet drawn against. */
    cattle: { plannedMoney: number; leftMoney: number };
    /** What the plan set aside for keeping them, and what keeping them has cost so far. */
    running: { plannedMoney: number; spentMoney: number };
  };
  producedBy: string;
  producedAt: Said;
}

/**
 * Where they stand against their Monthly Sums, in the words the advisers approved: "৪ মাসের ২টি দেওয়া · বাকি পড়েছে
 * ৫,০০০ টাকা · পরেরটি ১০ এপ্রিল, ২০৭৬, ২,৫০০ টাকা", the last two only where they apply — and the same in English.
 */
const sumsSaid = (
  sums: NonNullable<ProgressStatementFacts["monthlySums"]>
): Said => {
  const missed = sums.missedMoney > 0 ? moneySaid(sums.missedMoney) : null;
  const next = sums.next
    ? {
        day: daySaid(sums.next.dueOn),
        amount: moneySaid(sums.next.amountMoney),
      }
    : null;
  return {
    bn: [
      `${formatNumber(sums.sums, "bn")} মাসের ${formatNumber(sums.sumsPaid, "bn")}টি দেওয়া`,
      missed ? `বাকি পড়েছে ${missed.bn}` : null,
      next ? `পরেরটি ${next.day.bn}, ${next.amount.bn}` : null,
    ]
      .filter((part) => part !== null)
      .join(" · "),
    en: [
      `${formatNumber(sums.sumsPaid, "en")} of ${formatNumber(sums.sums, "en")} paid`,
      missed ? `${missed.en} missed` : null,
      next ? `next due ${next.day.en}, ${next.amount.en}` : null,
    ]
      .filter((part) => part !== null)
      .join(" · "),
  };
};

/** The Farm's own Units of all the Venture's, where it holds any. */
const farmUnitsRows = (
  farmUnits: ProgressStatementFacts["farmUnits"]
): DocumentRow[] =>
  farmUnits
    ? [
        line(
          { bn: "খামারের নিজের ইউনিট", en: "The Farm's own Units" },
          both(
            (language) =>
              `${formatNumber(farmUnits.units, language)} / ${formatNumber(farmUnits.ventureUnits, language)}`
          )
        ),
      ]
    : [];

/** Who the progress statement is for, and the part of the Venture that is theirs. */
const progressHolding = (facts: ProgressStatementFacts): PaperSection => ({
  kind: "facts",
  heading: { bn: "বিনিয়োগকারী ও ভেঞ্চার", en: "Investor and Venture" },
  rows: [
    line(INVESTOR, facts.investorName),
    line(VENTURE, facts.ventureName),
    // Their Units and their share of the Venture — not a list of who holds the rest, which is nobody's business but
    // theirs.
    line(
      { bn: "ইউনিট", en: "Units held" },
      both(
        (language) =>
          `${formatNumber(facts.units, language)} (${percentSaid(facts.sharePercent)[language]})`
      )
    ),
    // The Farm's own Units are no other Investor's business kept from them: their Agreement named them before they
    // signed.
    ...farmUnitsRows(facts.farmUnits),
    ...(facts.monthlySums
      ? [
          line(
            { bn: "মাসের টাকা", en: "Monthly Sums" },
            sumsSaid(facts.monthlySums)
          ),
        ]
      : []),
  ],
  note: null,
});

/** How the cattle stand: counts, the weighed animals' averages, the herd's gain, and the days to the window. */
const theCattle = (facts: ProgressStatementFacts): PaperSection => ({
  kind: "facts",
  heading: { bn: "পশুর অবস্থা", en: "The cattle" },
  rows: [
    line({ bn: "দাঁড়িয়ে আছে", en: "Standing" }, countSaid(facts.standing)),
    line({ bn: "বিক্রি হয়েছে", en: "Sold" }, countSaid(facts.sold)),
    line({ bn: "মারা গেছে", en: "Died" }, countSaid(facts.died)),
    ...(facts.lost > 0
      ? [
          line(
            {
              bn: "হারিয়ে গেছে, খামার ক্ষতিপূরণ দিয়েছে",
              en: "Lost, made good by the Farm",
            },
            countSaid(facts.lost)
          ),
        ]
      : []),
    line({ bn: "ওজন নেওয়া হয়েছে", en: "Weighed" }, countSaid(facts.weighed)),
    ...(facts.averageIntakeKg === null
      ? []
      : [
          line(
            { bn: "গড় ওজন (শুরুতে)", en: "Average weight at intake" },
            kgSaid(facts.averageIntakeKg)
          ),
        ]),
    ...(facts.averageLatestKg === null
      ? []
      : [
          line(
            { bn: "গড় ওজন (এখন)", en: "Average weight now" },
            kgSaid(facts.averageLatestKg)
          ),
        ]),
    // Over every animal the Venture has had, not the weighed ones the averages above are over: said, so nobody reads
    // it against them.
    ...(facts.herdGainKgPerDay === null
      ? []
      : [
          line(
            {
              bn: "দৈনিক বৃদ্ধি (বিক্রি ও মৃতসহ সব পশুর)",
              en: "Daily gain (every animal so far, sold and dead included)",
            },
            kgSaid(facts.herdGainKgPerDay)
          ),
        ]),
    // A count of days and nothing more: no weight they will reach and no price they will get.
    line(
      { bn: "লক্ষ্য সময় বাকি", en: "Days to the window" },
      daysSaid(facts.daysToWindow)
    ),
  ],
  note: null,
});

const ANIMALS_STANDING: Said = {
  bn: "যে পশুগুলো আছে",
  en: "The animals standing",
};

/**
 * The animals standing, one line each. None yet is said in words — a Venture can be read before it has bought
 * anything, because the joining letter is wanted while it is still Open and the sheet that makes it makes this one too.
 */
const theAnimals = (animals: readonly ProgressAnimal[]): PaperSection =>
  animals.length === 0
    ? {
        kind: "facts",
        heading: ANIMALS_STANDING,
        rows: [],
        note: { bn: "এখনো কোনো পশু নেই", en: "None yet" },
      }
    : {
        kind: "table",
        heading: ANIMALS_STANDING,
        columns: [
          { label: { bn: "ট্যাগ", en: "Tag" } },
          { label: { bn: "শুরুর ওজন", en: "At intake" }, figures: true },
          { label: { bn: "এখনকার ওজন", en: "Now" }, figures: true },
          { label: { bn: "দৈনিক বৃদ্ধি", en: "Daily gain" }, figures: true },
        ],
        rows: animals.map((one) => [
          one.tagNumber,
          one.intakeKg === null ? "—" : kgSaid(one.intakeKg),
          one.latestKg === null ? "—" : kgSaid(one.latestKg),
          one.gain,
        ]),
        foot: null,
        note: null,
      };

/** Both budgets: what the plan set aside, and how far each has gone. */
const theBudgets = (
  budgets: ProgressStatementFacts["budgets"]
): PaperSection => ({
  kind: "facts",
  heading: { bn: "বাজেট", en: "The budgets" },
  rows: [
    line(
      { bn: "পশু কেনার বাজেট", en: "Cattle budget" },
      moneySaid(budgets.cattle.plannedMoney)
    ),
    line(
      { bn: "পশু কেনার বাজেটের বাকি", en: "Cattle budget left" },
      moneySaid(budgets.cattle.leftMoney)
    ),
    line(
      { bn: "পরিচালনার বাজেট", en: "Running budget" },
      moneySaid(budgets.running.plannedMoney)
    ),
    line(
      { bn: "পরিচালনায় খরচ হয়েছে", en: "Running budget spent" },
      moneySaid(budgets.running.spentMoney)
    ),
  ],
  note: null,
});

/**
 * The paper an Investor is sent while the run goes on: what their animals weigh, and what their money has gone on.
 *
 * The spend is at Category level and no finer. They are owed a true account of where the money went — "trust us" is
 * what every scheme that went wrong said — but a unit price per kilogramme or a supplier's name is the Farm's buying,
 * not their business.
 *
 * No projection. The days to the window are a count of days; there is no weight they will reach and no price they will
 * get, because they keep this paper and would read either as a promise.
 */
export const progressStatementPaper = (
  facts: ProgressStatementFacts
): PaperDocument => ({
  letterhead: letterheadOf(facts.farm),
  title: { bn: "অগ্রগতি", en: "Progress statement" },
  preamble: { bn: "", en: "" },
  sections: [
    progressHolding(facts),
    theCattle(facts),
    theAnimals(facts.animals),
    chargesSection(
      { bn: "খরচ", en: "What the money has gone on" },
      facts.spend,
      {
        label: { bn: "মোট", en: "Total" },
        amountMoney: facts.spendTotalMoney,
      }
    ),
    theBudgets(facts.budgets),
  ],
  closing: [NO_GUARANTEE],
  produced: producedSaid(facts.producedAt, facts.producedBy),
});

/** One Settlement Adjustment as their closing paper says it. */
export interface StatementAdjustment {
  reason: string;
  /** The farm day it was raised. */
  raisedOn: string;
  /** What became of it, in words rather than as the word the database keeps. */
  outcome: Said;
  /** What their Units are worth of it, signed: up or down. */
  differenceMoney: number;
  /** What of it has actually reached them. */
  paidMoney: number;
}

/** হিসাব নিকাশ — the paper an Investor checks the whole run against. */
export interface SettlementStatementFacts {
  farm: FarmIdentity;
  investorName: string;
  ventureName: string;
  /** The farm day the Settlement was approved. */
  approvedOn: string;
  proceedsMoney: number;
  charges: ChargeLine[];
  chargedMoney: number;
  /**
   * The run's profit, signed. Printed unsigned under a label that says which it was: a minus sign tucked in after the
   * taka mark is how a loss gets read as a small profit.
   */
  profitMoney: number;
  /** How it divides: the Investors' percentage, the Units, what a Unit took (signed), the rounding to the Farm, and
   *  the Farm's own management share (signed — on a losing run the Farm bears its part too). */
  investorsPercent: number;
  units: number;
  perUnitMoney: number;
  /** What one Unit put in: capital returned, over the Units it returns to. */
  perUnitInMoney: number;
  roundingMoney: number;
  farmMoney: number;
  /** The Owner's own money back at cost, which was never a charge against the run; nothing where there was none. */
  advance: { amountMoney: number; repaid: boolean } | null;
  /** Theirs: Units, capital in, what their Units took, and what went out to them. */
  his: {
    units: number;
    /** Paid by the month, where what they held differs from what they signed for: the Units they signed for. */
    signedUnits: number | null;
    /** Paid by the month: what of their Monthly Sums was never paid, where any was. */
    sumsUnpaidMoney: number | null;
    capitalMoney: number;
    /** What their Units took, signed. */
    shareMoney: number;
    payoutMoney: number;
    /** The reference the money went out on and its farm day, or nothing while it has not. */
    reference: string | null;
    paidOn: string | null;
  };
  /**
   * What their own capital made, once the Owner shows it (ADR 0012): a share on every hundred, signed, over the
   * Venture's own days. Never a rate a year. Nothing while the Owner's switch is off.
   */
  onCapital: { per100: number; days: number } | null;
  /** What became of the cattle, already worded, a line to each fact. */
  herd: DocumentRow[];
  adjustments: StatementAdjustment[];
  producedBy: string;
  producedAt: Said;
}

/** A signed sum as a paper prints it: unsigned, the label it stands under saying which way it went. */
const unsignedSaid = (amount: number): Said => moneySaid(Math.abs(amount));

/**
 * What their capital made, in the portal's own words (ADR 0012): a share on every hundred over its days, a loss said
 * as a loss.
 */
const onCapitalSaid = (onCapital: { per100: number; days: number }): Said => {
  const gained = onCapital.per100 >= 0;
  const per100 = Math.abs(onCapital.per100);
  const { sum } = currencyWords("bn");
  return {
    bn: `প্রতি ১০০ ${sum} মূলধনে ${formatNumber(per100, "bn")} ${sum} ${gained ? "লাভ" : "ক্ষতি"}, ${formatNumber(onCapital.days, "bn")} দিনে`,
    en: `${formatNumber(per100, "en")} ${gained ? "made" : "lost"} on every ${currencySign()}100 of your capital, over ${daysSaid(onCapital.days).en}`,
  };
};

/** How the result divides, from the Investors' percentage to the Farm's share and the Owner's Advance. */
const howItDivides = (facts: SettlementStatementFacts): PaperSection => {
  const perUnitBack = facts.perUnitInMoney + facts.perUnitMoney;
  return {
    kind: "facts",
    heading: { bn: "ভাগ", en: "How it divides" },
    rows: [
      line(
        { bn: "বিনিয়োগকারীদের অংশ", en: "Investors' share" },
        percentSaid(facts.investorsPercent)
      ),
      line({ bn: "মোট ইউনিট", en: "Units" }, countSaid(facts.units)),
      facts.perUnitMoney >= 0
        ? line(
            { bn: "প্রতি ইউনিট মুনাফা", en: "Profit per Unit" },
            unsignedSaid(facts.perUnitMoney)
          )
        : line(
            { bn: "প্রতি ইউনিট ক্ষতি", en: "Loss per Unit" },
            unsignedSaid(facts.perUnitMoney)
          ),
      // The line they read before any other: one Unit in, one Unit back.
      line(
        { bn: "প্রতি ইউনিট", en: "Per Unit" },
        {
          bn: `${moneySaid(facts.perUnitInMoney).bn} দিয়ে ${moneySaid(perUnitBack).bn}`,
          en: `${moneySaid(facts.perUnitInMoney).en} in, ${moneySaid(perUnitBack).en} back`,
        }
      ),
      line(
        { bn: "ভগ্নাংশ খামারে", en: "Rounding to the Farm" },
        moneySaid(facts.roundingMoney)
      ),
      // A figure labeled "the Farm's share" beside a loss would read as the Farm taking money.
      facts.farmMoney >= 0
        ? line(
            { bn: "খামারের অংশ", en: "The Farm's share" },
            unsignedSaid(facts.farmMoney)
          )
        : line(
            { bn: "খামারের ভাগের ক্ষতি", en: "The Farm's share of the loss" },
            unsignedSaid(facts.farmMoney)
          ),
      ...(facts.advance
        ? [
            line(
              { bn: "মালিকের অগ্রিম ফেরত", en: "Owner's Advance repaid" },
              facts.advance.repaid
                ? moneySaid(facts.advance.amountMoney)
                : {
                    bn: `${moneySaid(facts.advance.amountMoney).bn} · এখনো যায়নি`,
                    en: `${moneySaid(facts.advance.amountMoney).en} · not yet sent`,
                  }
            ),
          ]
        : []),
    ],
    note: null,
  };
};

/** Their own line, followed through to their payout and the reference it went on. */
const yours = (facts: SettlementStatementFacts): PaperSection => {
  const { his } = facts;
  const sent = his.paidOn ? daySaid(his.paidOn) : null;
  return {
    kind: "facts",
    heading: { bn: "আপনার হিসাব", en: "Yours" },
    rows: [
      his.signedUnits === null
        ? line({ bn: "ইউনিট", en: "Units held" }, countSaid(his.units))
        : line(
            {
              bn: "দেওয়া মূলধন অনুযায়ী ইউনিট",
              en: "Units held, by capital paid",
            },
            {
              bn: `${countSaid(his.units).bn} (সই করা ${countSaid(his.signedUnits).bn})`,
              en: `${countSaid(his.units).en} (${countSaid(his.signedUnits).en} signed for)`,
            }
          ),
      ...(his.sumsUnpaidMoney === null
        ? []
        : [
            line(
              { bn: "বাকি পড়া মাসের টাকা", en: "Monthly Sums not paid" },
              moneySaid(his.sumsUnpaidMoney)
            ),
          ]),
      line(
        { bn: "মূলধন ফেরত", en: "Capital returned" },
        moneySaid(his.capitalMoney)
      ),
      his.shareMoney >= 0
        ? line(
            { bn: "মুনাফার অংশ", en: "Your share of the profit" },
            unsignedSaid(his.shareMoney)
          )
        : line(
            {
              bn: "ক্ষতির অংশ (মূলধন থেকে)",
              en: "Your share of the loss, off capital",
            },
            unsignedSaid(his.shareMoney)
          ),
      line({ bn: "মোট প্রাপ্য", en: "Your payout" }, moneySaid(his.payoutMoney)),
      line(
        { bn: "পাঠানো হয়েছে", en: "Sent" },
        his.reference
          ? both((language) =>
              sent ? `${sent[language]} · ${his.reference}` : `${his.reference}`
            )
          : { bn: "এখনো যায়নি", en: "Not yet sent" }
      ),
      // Under the payout, and only a share over its days: a rate a year is the Owner's, never theirs (ADR 0012).
      ...(facts.onCapital
        ? [
            line(
              { bn: "মূলধনে", en: "On your capital" },
              onCapitalSaid(facts.onCapital)
            ),
          ]
        : []),
    ],
    note: null,
  };
};

/** Each Adjustment raised since approval, beside the frozen figures and never instead of them. */
const theAdjustments = (
  adjustments: readonly StatementAdjustment[]
): PaperSection[] =>
  adjustments.length === 0
    ? []
    : [
        {
          kind: "table",
          heading: { bn: "বণ্টন সমন্বয়", en: "Settlement Adjustments" },
          columns: [
            { label: { bn: "তারিখ", en: "Raised on" } },
            { label: { bn: "কারণ", en: "Reason" } },
            { label: { bn: "পরিবর্তন", en: "Change" }, figures: true },
            { label: { bn: "অবস্থা", en: "Outcome" } },
            { label: { bn: "পাঠানো", en: "Sent" }, figures: true },
          ],
          rows: adjustments.map((one) => {
            const amount = unsignedSaid(one.differenceMoney);
            const rose = one.differenceMoney >= 0;
            return [
              daySaid(one.raisedOn),
              one.reason,
              {
                bn: `${rose ? "বেড়েছে" : "কমেছে"} ${amount.bn}`,
                en: `${rose ? "up" : "down"} ${amount.en}`,
              },
              one.outcome,
              moneySaid(one.paidMoney),
            ];
          }),
          foot: null,
          note: null,
        },
      ];

/** What the paper ends on besides the footer every statement carries: that its figures are frozen. */
const FROZEN: Said = {
  bn: "এই হিসাব অনুমোদনের দিনেই স্থির করা হয়েছে। পরে কিছু এলে তা বণ্টন সমন্বয় হিসেবে আসবে, এই কাগজ বদলে নয়।",
  en: "These figures were frozen on the day this settlement was approved. Anything arriving later comes as a Settlement Adjustment, not by this sheet being rewritten.",
};

/**
 * The closing paper. If they cannot follow it line by line to their own payout, the Farm has not accounted to them —
 * so every figure the payout was worked out from is on it, in the order it was worked out.
 *
 * A loss reads as a loss. The label changes, the figure carries no sign, and a share that went the wrong way is shown as
 * coming off their capital rather than being added to it. `৳-১২,৩৪৫` under a heading that says Profit is how a loss is
 * read as a small gain.
 */
export const settlementStatementPaper = (
  facts: SettlementStatementFacts
): PaperDocument => ({
  letterhead: letterheadOf(facts.farm),
  title: { bn: "হিসাব নিকাশ", en: "Settlement statement" },
  preamble: { bn: "", en: "" },
  sections: [
    {
      kind: "facts",
      heading: { bn: "বিনিয়োগকারী ও ভেঞ্চার", en: "Investor and Venture" },
      rows: [
        line(INVESTOR, facts.investorName),
        line(VENTURE, facts.ventureName),
        line(
          { bn: "হিসাব অনুমোদিত", en: "Approved on" },
          daySaid(facts.approvedOn)
        ),
      ],
      note: null,
    },
    {
      kind: "facts",
      heading: { bn: "যা পাওয়া গেল", en: "What the animals fetched" },
      rows: [
        line(
          { bn: "মোট বিক্রি", en: "Proceeds" },
          moneySaid(facts.proceedsMoney)
        ),
      ],
      note: null,
    },
    chargesSection(
      { bn: "যা খরচ হলো", en: "What the run was charged" },
      facts.charges,
      {
        label: { bn: "মোট খরচ", en: "Total charged" },
        amountMoney: facts.chargedMoney,
      }
    ),
    {
      kind: "facts",
      heading: { bn: "ফলাফল", en: "The result" },
      rows: [
        facts.profitMoney >= 0
          ? line({ bn: "লাভ", en: "Profit" }, unsignedSaid(facts.profitMoney))
          : line({ bn: "ক্ষতি", en: "Loss" }, unsignedSaid(facts.profitMoney)),
      ],
      note: null,
    },
    howItDivides(facts),
    yours(facts),
    // Read from the records rather than frozen with the account: a **Sale** is the one Correction a settled Venture
    // still allows, being the late news itself, and putting a price right would move the average below without moving
    // a taka of the account above. The heading says which it is.
    {
      kind: "facts",
      heading: {
        bn: "পালের হিসাব (নথি অনুযায়ী)",
        en: "What became of the cattle, as the records stand",
      },
      rows: facts.herd,
      note: null,
    },
    ...theAdjustments(facts.adjustments),
  ],
  closing: [FROZEN, NO_GUARANTEE],
  produced: producedSaid(facts.producedAt, facts.producedBy),
});
