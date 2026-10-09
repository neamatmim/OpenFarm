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

/** The heading of a Venture month's animals. */
const HERD: Said = { bn: "পশু", en: "Animals" };

/** The month's start, as the animals' and the account's lines both say it. */
const AT_START: Said = { bn: "মাসের শুরুতে", en: "At the month's start" };
/** The month's end, as the animals' and the account's lines both say it. */
const AT_END: Said = { bn: "মাসের শেষে", en: "At the month's end" };

/** The animals' heads in a month, line by line: at its start, what came and went in it, and at its end. */
const HEAD_LINES: readonly {
  label: Said;
  of: (herd: HerdBetween) => number;
}[] = [
  { label: AT_START, of: (herd) => herd.atStart },
  { label: { bn: "কেনা", en: "Bought" }, of: (herd) => herd.came.bought },
  {
    label: { bn: "অন্য মালিকের কাছ থেকে কেনা", en: "Bought from another owner" },
    of: (herd) => herd.came.boughtAcross,
  },
  { label: { bn: "বিক্রি", en: "Sold" }, of: (herd) => herd.went.sold },
  {
    label: { bn: "অন্য মালিকের কাছে বিক্রি", en: "Sold to another owner" },
    of: (herd) => herd.went.soldAcross,
  },
  {
    label: { bn: "মারা গেছে বা বাদ দেওয়া", en: "Died or culled" },
    of: (herd) => herd.went.died,
  },
  { label: { bn: "হারিয়েছে", en: "Lost" }, of: (herd) => herd.went.lost },
  { label: AT_END, of: (herd) => herd.atEnd },
];

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
    HEAD_LINES.map((one) => [one.label, countSaid(one.of(herd))]),
    {
      bn: said.map((one) => one.bn).join(" "),
      en: said.map((one) => one.en).join(" "),
    }
  );
};

/** The heading of a Venture month's charges. */
const CHARGES: Said = { bn: "খরচ", en: "Charges" };
/** The line that adds a Venture month's charges. */
const TOTAL: Said = { bn: "মোট", en: "Total" };

/** Its charges by the Settlement's own lines added up, in the one column `of` reads: the month's, or the run's to its
 *  end. */
const chargesTotal = (
  facts: VentureMonthFacts,
  of: (one: VentureMonthFacts["charges"][number]) => number
) => facts.charges.reduce((sum, one) => sum + of(one), 0);

/** Its charges by the Settlement's own lines: the month's, beside the run's to its end. */
const chargesPart = (facts: VentureMonthFacts): PaperSection => {
  if (
    facts.charges.every((one) => one.monthMoney === 0 && one.toEndMoney === 0)
  ) {
    return nothingIn(CHARGES, {
      bn: "এখনো কোনো খরচ নেই।",
      en: "Nothing has been charged yet.",
    });
  }
  const total = (of: (one: VentureMonthFacts["charges"][number]) => number) =>
    sumSaid(chargesTotal(facts, of));
  return tableOf(
    CHARGES,
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
      [TOTAL, total((one) => one.monthMoney), total((one) => one.toEndMoney)],
    ]
  );
};

/** Where the month's Bank Check stands, one word for the paper and the spreadsheet alike: not read yet, moved since it
 *  was read, matched, or differing. */
const bankCheckStanding = (
  check: VentureMonthFacts["account"]["bankCheck"]
): "not_checked" | "stale" | "matched" | "differs" => {
  if (!check) {
    return "not_checked";
  }
  if (check.stale) {
    return "stale";
  }
  return check.matched ? "matched" : "differs";
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
  const standing = bankCheckStanding(check);
  const read = sumSaid(check.readMoney);
  if (standing === "stale") {
    return {
      bn: `ব্যাংক বিবরণী (${read.bn}) মেলানোর পরে এই মাসের হিসাব বদলেছে।`,
      en: `The month has moved since the bank statement (${read.en}) was checked.`,
    };
  }
  if (standing === "matched") {
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

/** The heading of a Venture month's account. */
const ACCOUNT: Said = { bn: "ভেঞ্চার হিসাব", en: "Venture account" };

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
    ACCOUNT,
    [{ bn: "টাকা", en: "Money" }],
    [
      [AT_START, sumSaid(account.openingMoney)],
      ...account.moved.map((one) => {
        const sign = one.direction === "in" ? "+" : "−";
        return [
          { bn: `${sign} ${one.label.bn}`, en: `${sign} ${one.label.en}` },
          sumSaid(one.amountMoney),
        ];
      }),
      [AT_END, sumSaid(account.closingMoney)],
    ],
    note
  );
};

/** The heading of what the month owes the Farm. */
const REIMBURSEMENT: Said = { bn: "খামারকে ফেরত", en: "Reimbursement" };
/** What the month owes the Farm, line by line: what it comes to, what was paid, and what is still owed. */
const REIMBURSEMENT_LINES: readonly {
  label: Said;
  of: (owed: NonNullable<VentureMonthFacts["reimbursement"]>) => number;
}[] = [
  { label: { bn: "যা হয়", en: "Comes to" }, of: (owed) => owed.comesToMoney },
  { label: { bn: "দেওয়া হয়েছে", en: "Paid" }, of: (owed) => owed.paidMoney },
  { label: { bn: "বাকি", en: "Still owed" }, of: (owed) => owed.stillOwedMoney },
];

/** What the month owes the Farm for what its animals ate and were given, as the books stand. */
const reimbursementPart = (
  owed: NonNullable<VentureMonthFacts["reimbursement"]>
): PaperSection =>
  tableOf(
    REIMBURSEMENT,
    [{ bn: "টাকা", en: "Money" }],
    REIMBURSEMENT_LINES.map((one) => [one.label, sumSaid(one.of(owed))])
  );

/** The heading of the animals sold in a month. */
const SOLD: Said = { bn: "এই মাসে বিক্রি", en: "Sold this month" };
/** What is said of each animal sold: her price, her cost to the Venture, and the one less the other. */
const SALE_LINES: readonly {
  label: Said;
  of: (one: VentureMonthFacts["sold"][number]) => number | null;
}[] = [
  { label: { bn: "দাম", en: "Price" }, of: (one) => one.priceMoney },
  {
    label: { bn: "ভেঞ্চারের খরচ", en: "Cost to the venture" },
    of: (one) => one.costMoney,
  },
  {
    label: { bn: "দাম থেকে খরচ বাদে", en: "Price less cost" },
    of: (one) => one.lessCostMoney,
  },
];

/** Each animal sold in it while the Venture's, against what she cost it: her price less her cost, never a Margin. */
const soldPart = ({ sold }: VentureMonthFacts): PaperSection => {
  if (sold.length === 0) {
    return nothingIn(SOLD, {
      bn: "এই মাসে কোনো পশু বিক্রি হয়নি।",
      en: "No animal was sold this month.",
    });
  }
  return {
    kind: "table",
    heading: SOLD,
    columns: [
      { label: { bn: "ট্যাগ", en: "Tag" } },
      { label: { bn: "দিন", en: "Day" } },
      ...SALE_LINES.map((one) => ({ label: one.label, figures: true })),
    ],
    rows: sold.map((one) => [
      one.tagNumber,
      daySaid(one.soldOn),
      ...SALE_LINES.map((figure) => sumSaid(figure.of(one))),
    ]),
    foot: null,
    note: null,
  };
};

/** The heading of a month against its plan. */
const AGAINST_PLAN: Said = { bn: "পরিকল্পনার সাথে", en: "Against the plan" };
/** The column of what the plan meant by the month's end. */
const PLANNED: Said = { bn: "পরিকল্পনা", en: "Planned" };
/** The column of what was done by the month's end. */
const ACTUAL: Said = { bn: "হয়েছে", en: "Actual" };
/** A month against its plan, as the Venture's month has it. */
type Plan = NonNullable<VentureMonthFacts["againstPlan"]>;
/** A month against its plan, line by line: each what was planned and what was done to the month's end, a count, a sum or
 *  a weight. */
const PLAN_LINES: readonly {
  label: Said;
  kind: "count" | "sum" | "kg";
  planned: (plan: Plan) => number;
  actual: (plan: Plan) => number | null;
}[] = [
  {
    label: { bn: "পশু", en: "Head" },
    kind: "count",
    planned: (plan) => plan.plannedHeads,
    actual: (plan) => plan.boughtHeads,
  },
  {
    label: { bn: "পশু কেনার টাকা", en: "Money on cattle" },
    kind: "sum",
    planned: (plan) => plan.plannedCattleMoney,
    actual: (plan) => plan.boughtMoney,
  },
  {
    label: { bn: "চালানোর খরচ", en: "Running spend" },
    kind: "sum",
    planned: (plan) => plan.plannedRunningMoney,
    actual: (plan) => plan.runningSpentMoney,
  },
  {
    label: { bn: "গড় ওজন", en: "Average weight" },
    kind: "kg",
    planned: (plan) => plan.plannedKg,
    actual: (plan) => plan.reachedKg,
  },
];

/** A plan's figure as the paper writes it. */
const planSaid = (
  kind: (typeof PLAN_LINES)[number]["kind"],
  amount: number | null
): Said => {
  if (kind === "kg") {
    return kgOrNone(amount);
  }
  if (amount === null) {
    return NONE;
  }
  return kind === "count" ? countSaid(amount) : sumSaid(amount);
};

/** Against its plan to the month's end: heads and money bought, running spend, and the weight meant and reached. */
const planPart = (plan: Plan): PaperSection =>
  tableOf(
    AGAINST_PLAN,
    [PLANNED, ACTUAL],
    PLAN_LINES.map((one) => [
      one.label,
      planSaid(one.kind, one.planned(plan)),
      planSaid(one.kind, one.actual(plan)),
    ])
  );

/** The heading of a Venture's Monthly Sums. */
const SUMS: Said = { bn: "মাসিক কিস্তি", en: "Monthly sums" };
/** Its Monthly Sums to the month's end, line by line: due, paid and missed. */
const SUMS_LINES: readonly {
  label: Said;
  of: (sums: NonNullable<VentureMonthFacts["sums"]>) => number;
}[] = [
  { label: { bn: "পাওনা ছিল", en: "Due" }, of: (sums) => sums.dueMoney },
  { label: { bn: "দেওয়া হয়েছে", en: "Paid" }, of: (sums) => sums.paidMoney },
  { label: { bn: "বাকি পড়েছে", en: "Missed" }, of: (sums) => sums.missedMoney },
];

/** Paid by the month: what its Agreements had due, had paid and had missed to the month's end. */
const sumsPart = (sums: NonNullable<VentureMonthFacts["sums"]>): PaperSection =>
  tableOf(
    SUMS,
    [{ bn: "টাকা", en: "Money" }],
    SUMS_LINES.map((one) => [one.label, sumSaid(one.of(sums))])
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

/** One row of a Venture's month for a spreadsheet: its part and line in Bangla and in English, which way the money went
 *  for a row of its account, its figure in the month and to the month's end as numbers — nothing where a figure is the
 *  one column's alone — and a note a figure cannot carry. */
export interface VentureMonthRow {
  part: Said;
  line: Said;
  way: "in" | "out" | null;
  thisMonth: number | null;
  toMonthEnd: number | null;
  note: string | null;
}

/** The unit a weight's line is named with, where a spreadsheet's figure cannot carry it. */
const KG: Said = { bn: "কেজি", en: "kg" };

/** A sum as a spreadsheet takes it, in whole taka as the paper says it: a number, never text, so a spreadsheet adds it. */
const sumPlain = (amount: number | null) =>
  amount === null ? null : Math.round(amount);

/** A row of a Venture's month: a part, a line and its two figures, and which way its money went or a note where it has
 *  one. */
const row = (
  part: Said,
  line: Said,
  thisMonth: number | null,
  toMonthEnd: number | null,
  besides: Partial<Pick<VentureMonthRow, "way" | "note">> = {}
): VentureMonthRow => ({
  part,
  line,
  way: besides.way ?? null,
  thisMonth,
  toMonthEnd,
  note: besides.note ?? null,
});

/** A line said a second way: a sale's figure by her tag, a plan's line by its column, a weight by its unit. */
const joined = (first: Said, second: Said, by = ", "): Said => ({
  bn: `${first.bn}${by}${second.bn}`,
  en: `${first.en}${by}${second.en}`,
});

/**
 * One month of one Venture as a spreadsheet takes it, for the Owner beside the paper (`ventureMonthPaper`): a row a
 * figure, under the paper's own parts and lines, so the two never say a month differently.
 */
export const ventureMonthRows = (
  facts: VentureMonthFacts
): VentureMonthRow[] => {
  const { herd, account, reimbursement, againstPlan, sums } = facts;
  return [
    ...HEAD_LINES.map((one) => row(HERD, one.label, one.of(herd), null)),
    row(
      HERD,
      joined(
        { bn: "মাসের শেষে গড় ওজন", en: "Average weight at the month's end" },
        KG
      ),
      herd.atEndKg?.averageKg ?? null,
      null
    ),
    row(
      HERD,
      {
        bn: "মাসের শেষে ওজন নেওয়া পশু",
        en: "Weighed by the month's end",
      },
      herd.atEndKg?.animals ?? 0,
      null
    ),
    row(
      HERD,
      joined({ bn: "দিনে বৃদ্ধি", en: "Gain a day" }, KG),
      herd.gainKgPerDay,
      null
    ),
    row(
      HERD,
      { bn: "এই মাসে ওজন নেওয়া", en: "Weighed in the month" },
      herd.weighed,
      null
    ),
    row(
      HERD,
      { bn: "এই মাসে ওজন নেওয়া হয়নি", en: "Not weighed in the month" },
      herd.notWeighed.length,
      null,
      { note: herd.notWeighed.length > 0 ? herd.notWeighed.join(" ") : null }
    ),
    ...facts.charges.map((one) =>
      row(
        CHARGES,
        one.label,
        sumPlain(one.monthMoney),
        sumPlain(one.toEndMoney)
      )
    ),
    row(
      CHARGES,
      TOTAL,
      sumPlain(chargesTotal(facts, (one) => one.monthMoney)),
      sumPlain(chargesTotal(facts, (one) => one.toEndMoney))
    ),
    row(ACCOUNT, AT_START, sumPlain(account.openingMoney), null),
    ...account.moved.map((one) =>
      row(ACCOUNT, one.label, sumPlain(one.amountMoney), null, {
        way: one.direction,
      })
    ),
    row(ACCOUNT, AT_END, sumPlain(account.closingMoney), null),
    // The bank's figure is the line the Check's standing is noted on, even with no statement read.
    row(
      ACCOUNT,
      { bn: "ব্যাংক বিবরণীতে", en: "Read off the bank statement" },
      sumPlain(account.bankCheck?.readMoney ?? null),
      null,
      { note: bankCheckStanding(account.bankCheck) }
    ),
    // The farm's figure only where the paper says it: beside a statement that differs.
    ...(account.bankCheck && bankCheckStanding(account.bankCheck) === "differs"
      ? [
          row(
            ACCOUNT,
            { bn: "খামার যা ভেবেছিল", en: "The farm expected" },
            sumPlain(account.bankCheck.expectedMoney),
            null
          ),
        ]
      : []),
    ...(reimbursement
      ? REIMBURSEMENT_LINES.map((one) =>
          row(REIMBURSEMENT, one.label, sumPlain(one.of(reimbursement)), null)
        )
      : []),
    ...facts.sold.flatMap((one) =>
      SALE_LINES.map((figure) =>
        row(
          SOLD,
          joined({ bn: one.tagNumber, en: one.tagNumber }, figure.label, " — "),
          sumPlain(figure.of(one)),
          null,
          { note: one.soldOn }
        )
      )
    ),
    ...(againstPlan
      ? PLAN_LINES.flatMap((one) => {
          const label = one.kind === "kg" ? joined(one.label, KG) : one.label;
          const plain = (amount: number | null) =>
            one.kind === "sum" ? sumPlain(amount) : amount;
          return [
            row(
              AGAINST_PLAN,
              joined(label, { bn: PLANNED.bn, en: "planned" }),
              null,
              plain(one.planned(againstPlan))
            ),
            row(
              AGAINST_PLAN,
              joined(label, { bn: ACTUAL.bn, en: "actual" }),
              null,
              plain(one.actual(againstPlan))
            ),
          ];
        })
      : []),
    ...(sums
      ? SUMS_LINES.map((one) =>
          row(SUMS, one.label, null, sumPlain(one.of(sums)))
        )
      : []),
  ];
};
