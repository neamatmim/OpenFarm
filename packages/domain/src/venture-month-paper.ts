import { formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { kgSaid, producedSaid } from "./investor-statements";
import { countSaid } from "./joining-letter";
import { NONE, monthSaid, sumSaid } from "./monthly-report-paper";
import { daySaid } from "./nominees";
import type { PaperDocument, PaperSection } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { Said } from "./papers";
import type { HerdBetween } from "./venture-herd-as-of";

/** What one month of one Venture prints from: its figures as the farm works them, each label already worded. */
export interface VentureMonthFacts {
  farm: FarmIdentity;
  ventureName: string;
  /** The month, "YYYY-MM". */
  month: string;
  /** The farm day it was read to, while the month is still going; nothing for a month gone by. */
  soFarTo: string | null;
  herd: HerdBetween;
  /** The Settlement's own lines, each worded, with the month's money and the run's to the month's end. */
  charges: readonly { label: Said; monthMoney: number; toEndMoney: number }[];
  account: {
    openingMoney: number;
    /** Each kind of Venture Movement in the month, worded, which way it went, and what it came to. */
    moved: readonly {
      label: Said;
      direction: "in" | "out";
      amountMoney: number;
    }[];
    closingMoney: number;
    bankCheck: {
      readMoney: number;
      expectedMoney: number;
      matched: boolean;
      stale: boolean;
    } | null;
  };
  reimbursement: {
    comesToMoney: number;
    paidMoney: number;
    stillOwedMoney: number;
  } | null;
  sold: readonly {
    tagNumber: string;
    /** The farm day she was sold. */
    soldOn: string;
    priceMoney: number;
    costMoney: number | null;
    lessCostMoney: number | null;
  }[];
  againstPlan: {
    plannedHeads: number;
    boughtHeads: number;
    plannedCattleMoney: number;
    boughtMoney: number;
    plannedRunningMoney: number;
    runningSpentMoney: number;
    plannedKg: number;
    reachedKg: number | null;
  } | null;
  sums: { dueMoney: number; paidMoney: number; missedMoney: number } | null;
  producedAt: Said;
  producedBy: string;
}

/** Kilograms in each language, or the dash where there is no weight. */
const kgOrNone = (kg: number | null): Said => (kg === null ? NONE : kgSaid(kg));

/** A part that has nothing in it this month, said as a line rather than a table of noughts. */
const nothingIn = (heading: Said, said: Said): PaperSection => ({
  kind: "facts",
  heading,
  rows: [],
  note: said,
});

/** A table of lines, each beside its figures under the headings given. */
const tableOf = (
  heading: Said,
  headings: readonly Said[],
  rows: readonly (readonly Said[])[],
  note: Said | null = null
): PaperSection => ({
  kind: "table",
  heading,
  columns: [
    { label: { bn: "হিসাব", en: "Figure" } },
    ...headings.map((label) => ({ label, figures: true })),
  ],
  rows: rows.map((row) => [...row]),
  foot: null,
  note,
});

/** One line of the animals' part: what it counts, and how many. */
const line = (label: Said, count: number): Said[] => [label, countSaid(count)];

/** The heading of a Venture month's animals. */
const HERD: Said = { bn: "পশু", en: "Animals" };

/** Its animals as they stood: the heads at its start and end and what moved them, their weight and their gain. */
const herdPart = (herd: HerdBetween): PaperSection => {
  const moved =
    herd.came.bought +
    herd.came.boughtAcross +
    herd.went.sold +
    herd.went.soldAcross +
    herd.went.died +
    herd.went.lost;
  if (herd.atStart === 0 && herd.atEnd === 0 && moved === 0) {
    return nothingIn(HERD, {
      bn: "এই মাসে ভেঞ্চারের কোনো পশু ছিল না।",
      en: "The venture had no animals this month.",
    });
  }
  const said: Said[] = [];
  if (herd.atEnd > 0) {
    said.push(
      herd.atEndKg
        ? {
            bn: `মাসের শেষে গড় ওজন ${kgSaid(herd.atEndKg.averageKg).bn}, ওজন নেওয়া ${formatNumber(herd.atEndKg.animals, "bn")}টি পশুর।`,
            en: `Averaging ${kgSaid(herd.atEndKg.averageKg).en} at the month's end, over ${herd.atEndKg.animals} ${herd.atEndKg.animals === 1 ? "animal" : "animals"} weighed.`,
          }
        : {
            bn: "মাসের শেষে দাঁড়ানো কোনো পশুর ওজন নেওয়া হয়নি।",
            en: "None standing at the month's end had been weighed.",
          }
    );
  }
  said.push(
    herd.gainKgPerDay === null
      ? {
          bn: "এই মাসে কারও ওজন নেওয়া হয়নি, তাই বৃদ্ধি বলা যায় না।",
          en: "Nobody was weighed in the month, so it has no gain to say.",
        }
      : {
          bn: `এই মাসে দিনে গড়ে ${kgSaid(herd.gainKgPerDay).bn} বেড়েছে, ওজন নেওয়া ${formatNumber(herd.weighed, "bn")}টি পশুর।`,
          en: `Gained ${kgSaid(herd.gainKgPerDay).en} a day in the month, over ${herd.weighed} ${herd.weighed === 1 ? "animal" : "animals"} weighed.`,
        }
  );
  if (herd.notWeighed.length > 0) {
    said.push({
      bn: `এই মাসে ওজন নেওয়া হয়নি: ${herd.notWeighed.join(", ")}`,
      en: `Not weighed in the month: ${herd.notWeighed.join(", ")}`,
    });
  }
  return tableOf(
    HERD,
    [{ bn: "পশু", en: "Head" }],
    [
      line({ bn: "মাসের শুরুতে", en: "At the month's start" }, herd.atStart),
      line({ bn: "কেনা", en: "Bought" }, herd.came.bought),
      line(
        { bn: "অন্য মালিকের কাছ থেকে কেনা", en: "Bought from another owner" },
        herd.came.boughtAcross
      ),
      line({ bn: "বিক্রি", en: "Sold" }, herd.went.sold),
      line(
        { bn: "অন্য মালিকের কাছে বিক্রি", en: "Sold to another owner" },
        herd.went.soldAcross
      ),
      line({ bn: "মারা গেছে বা বাদ দেওয়া", en: "Died or culled" }, herd.went.died),
      line({ bn: "হারিয়েছে", en: "Lost" }, herd.went.lost),
      line({ bn: "মাসের শেষে", en: "At the month's end" }, herd.atEnd),
    ],
    {
      bn: said.map((one) => one.bn).join(" "),
      en: said.map((one) => one.en).join(" "),
    }
  );
};

/** Its charges by the Settlement's own lines: the month's, beside the run's to its end. */
const chargesPart = (facts: VentureMonthFacts): PaperSection => {
  const heading = { bn: "খরচ", en: "Charges" };
  if (
    facts.charges.every((one) => one.monthMoney === 0 && one.toEndMoney === 0)
  ) {
    return nothingIn(heading, {
      bn: "এখনো কোনো খরচ নেই।",
      en: "Nothing has been charged yet.",
    });
  }
  const total = (of: (one: VentureMonthFacts["charges"][number]) => number) =>
    sumSaid(facts.charges.reduce((sum, one) => sum + of(one), 0));
  return tableOf(
    heading,
    [
      monthSaid(facts.month),
      { bn: "মাসের শেষ পর্যন্ত", en: "To the month's end" },
    ],
    [
      ...facts.charges.map((one) => [
        one.label,
        sumSaid(one.monthMoney),
        sumSaid(one.toEndMoney),
      ]),
      [
        { bn: "মোট", en: "Total" },
        total((one) => one.monthMoney),
        total((one) => one.toEndMoney),
      ],
    ]
  );
};

/** The month's Bank Check, as a line: not read yet, matched, differing, or moved since it was read. */
const bankCheckSaid = (
  check: VentureMonthFacts["account"]["bankCheck"]
): Said => {
  if (!check) {
    return {
      bn: "এই মাসের ব্যাংক বিবরণী এখনো মেলানো হয়নি।",
      en: "No bank statement has been checked for this month.",
    };
  }
  const read = sumSaid(check.readMoney);
  if (check.stale) {
    return {
      bn: `ব্যাংক বিবরণী (${read.bn}) মেলানোর পরে এই মাসের হিসাব বদলেছে।`,
      en: `The month has moved since the bank statement (${read.en}) was checked.`,
    };
  }
  if (check.matched) {
    return {
      bn: `ব্যাংক বিবরণী মিলেছে: ${read.bn}।`,
      en: `The bank statement matched: ${read.en}.`,
    };
  }
  const expected = sumSaid(check.expectedMoney);
  return {
    bn: `ব্যাংক বিবরণী মেলেনি: ব্যাংক বলছে ${read.bn}, খামার ভেবেছিল ${expected.bn}।`,
    en: `The bank statement differs: the bank says ${read.en}, the farm expected ${expected.en}.`,
  };
};

/** Its account from the month before's end to its own, each kind of movement in it, beside the month's Bank Check. */
const accountPart = ({ account }: VentureMonthFacts): PaperSection => {
  const check = bankCheckSaid(account.bankCheck);
  const note =
    account.moved.length === 0
      ? {
          bn: `এই মাসে কোনো লেনদেন হয়নি। ${check.bn}`,
          en: `No money moved this month. ${check.en}`,
        }
      : check;
  return tableOf(
    { bn: "ভেঞ্চার হিসাব", en: "Venture account" },
    [{ bn: "টাকা", en: "Money" }],
    [
      [
        { bn: "মাসের শুরুতে", en: "At the month's start" },
        sumSaid(account.openingMoney),
      ],
      ...account.moved.map((one) => {
        const sign = one.direction === "in" ? "+" : "−";
        return [
          { bn: `${sign} ${one.label.bn}`, en: `${sign} ${one.label.en}` },
          sumSaid(one.amountMoney),
        ];
      }),
      [
        { bn: "মাসের শেষে", en: "At the month's end" },
        sumSaid(account.closingMoney),
      ],
    ],
    note
  );
};

/** What the month owes the Farm for what its animals ate and were given, as the books stand. */
const reimbursementPart = (
  owed: NonNullable<VentureMonthFacts["reimbursement"]>
): PaperSection =>
  tableOf(
    { bn: "খামারকে ফেরত", en: "Reimbursement" },
    [{ bn: "টাকা", en: "Money" }],
    [
      [{ bn: "যা হয়", en: "Comes to" }, sumSaid(owed.comesToMoney)],
      [{ bn: "দেওয়া হয়েছে", en: "Paid" }, sumSaid(owed.paidMoney)],
      [{ bn: "বাকি", en: "Still owed" }, sumSaid(owed.stillOwedMoney)],
    ]
  );

/** Each animal sold in it while the Venture's, against what she cost it: her price less her cost, never a Margin. */
const soldPart = ({ sold }: VentureMonthFacts): PaperSection => {
  const heading = { bn: "এই মাসে বিক্রি", en: "Sold this month" };
  if (sold.length === 0) {
    return nothingIn(heading, {
      bn: "এই মাসে কোনো পশু বিক্রি হয়নি।",
      en: "No animal was sold this month.",
    });
  }
  return {
    kind: "table",
    heading,
    columns: [
      { label: { bn: "ট্যাগ", en: "Tag" } },
      { label: { bn: "দিন", en: "Day" } },
      { label: { bn: "দাম", en: "Price" }, figures: true },
      {
        label: { bn: "ভেঞ্চারের খরচ", en: "Cost to the venture" },
        figures: true,
      },
      {
        label: { bn: "দাম থেকে খরচ বাদে", en: "Price less cost" },
        figures: true,
      },
    ],
    rows: sold.map((one) => [
      one.tagNumber,
      daySaid(one.soldOn),
      sumSaid(one.priceMoney),
      sumSaid(one.costMoney),
      sumSaid(one.lessCostMoney),
    ]),
    foot: null,
    note: null,
  };
};

/** Against its plan to the month's end: heads and money bought, running spend, and the weight meant and reached. */
const planPart = (
  plan: NonNullable<VentureMonthFacts["againstPlan"]>
): PaperSection =>
  tableOf(
    { bn: "পরিকল্পনার সাথে", en: "Against the plan" },
    [
      { bn: "পরিকল্পনা", en: "Planned" },
      { bn: "হয়েছে", en: "Actual" },
    ],
    [
      [
        { bn: "পশু", en: "Head" },
        countSaid(plan.plannedHeads),
        countSaid(plan.boughtHeads),
      ],
      [
        { bn: "পশু কেনার টাকা", en: "Money on cattle" },
        sumSaid(plan.plannedCattleMoney),
        sumSaid(plan.boughtMoney),
      ],
      [
        { bn: "চালানোর খরচ", en: "Running spend" },
        sumSaid(plan.plannedRunningMoney),
        sumSaid(plan.runningSpentMoney),
      ],
      [
        { bn: "গড় ওজন", en: "Average weight" },
        kgOrNone(plan.plannedKg),
        kgOrNone(plan.reachedKg),
      ],
    ]
  );

/** Paid by the month: what its Agreements had due, had paid and had missed to the month's end. */
const sumsPart = (sums: NonNullable<VentureMonthFacts["sums"]>): PaperSection =>
  tableOf(
    { bn: "মাসিক কিস্তি", en: "Monthly sums" },
    [{ bn: "টাকা", en: "Money" }],
    [
      [{ bn: "পাওনা ছিল", en: "Due" }, sumSaid(sums.dueMoney)],
      [{ bn: "দেওয়া হয়েছে", en: "Paid" }, sumSaid(sums.paidMoney)],
      [{ bn: "বাকি পড়েছে", en: "Missed" }, sumSaid(sums.missedMoney)],
    ]
  );

/** What a month cannot tell, said at its foot. */
const CANNOT_TELL: Said = {
  bn: "এক মাস থেকে লাভ, ভাগ, মার্জিন, পরিচালন খরচ, খরচে লাভ বা পূর্বাভাস বলা যায় না, তাই এখানে নেই। হিসাব যেমন ছাপার দিনে ছিল তেমন: পরে আসা খরচ বা সংশোধনে পুরোনো মাসও বদলাতে পারে।",
  en: "A month cannot tell profit, a share, a margin, overheads, a return on cost or a projection, so none are here. The books as they stood when it was printed: a late cost or a correction can still move a month gone by.",
};

/**
 * One month of one Venture on paper, for the Owner: on the **Farm Identity** letterhead, read in Bangla or English (ADR
 * 0021), the month beside the run to its end — its animals as they stood, its charges by the Settlement's own lines, its
 * account and Bank Check, the Reimbursement it owes the Farm, each animal sold against her cost, its plan and its Monthly
 * Sums where it has them — each part saying when it has nothing. No profit, share, Margin, Overheads, Return on Cost or
 * Projection (ADR 0010): a month cannot tell them, and the paper says so.
 */
export const ventureMonthPaper = (facts: VentureMonthFacts): PaperDocument => {
  const named = monthSaid(facts.month);
  const soFar = facts.soFarTo === null ? null : daySaid(facts.soFarTo);
  return {
    letterhead: letterheadOf(facts.farm),
    title: {
      bn: `মাসিক প্রতিবেদন — ${facts.ventureName} — ${named.bn}`,
      en: `Monthly report — ${facts.ventureName} — ${named.en}`,
    },
    preamble: soFar
      ? {
          bn: `মাস এখনো চলছে: ${soFar.bn} পর্যন্ত যা হয়েছে, শুরু থেকে মাসের শেষ পর্যন্ত পুরো সময়ের পাশে।`,
          en: `The month is still going: what it came to so far, to ${soFar.en}, beside the run to its end.`,
        }
      : {
          bn: "মাসের হিসাব, শুরু থেকে মাসের শেষ পর্যন্ত পুরো সময়ের পাশে।",
          en: "The month's figures, beside the run from its start to the month's end.",
        },
    sections: [
      herdPart(facts.herd),
      chargesPart(facts),
      accountPart(facts),
      ...(facts.reimbursement ? [reimbursementPart(facts.reimbursement)] : []),
      soldPart(facts),
      ...(facts.againstPlan ? [planPart(facts.againstPlan)] : []),
      ...(facts.sums ? [sumsPart(facts.sums)] : []),
    ],
    closing: [CANNOT_TELL],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};
