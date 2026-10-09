import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { startOfFarmDay } from "./farm-clock";
import { producedSaid } from "./investor-statements";
import { moneySaid } from "./joining-letter";
import type { Side } from "./lifecycle";
import { roundMoney } from "./money";
import { daySaid } from "./nominees";
import { letterheadOf } from "./paper-template";
import type { PaperDocument, PaperSection } from "./paper-template";
import type { Said, Worded } from "./papers";
import { SIDE_LABEL } from "./papers";
import type { ReceivableAge, ReceivablesByAge } from "./receivable-ages";
import { RECEIVABLE_AGES } from "./receivable-ages";
import type { SideResult, SideResults } from "./side-results";
import type { StoreValue } from "./store-value";

/** One stretch's figures as the monthly report works them (`figuresOver`): the Farm's own money, milk, fattening and
 *  overheads. */
export interface MonthFigures {
  money: {
    inMoney: number;
    outMoney: number;
    netMoney: number;
    awaitingCount: number;
  };
  dairy: {
    milkSoldMoney: number;
    litersSold: number;
    fetchedPerLiterMoney: number | null;
    chargedMoney: number;
    litersToBulk: number;
    litersPerCowMilked: number | null;
    costPerLiterMoney: number | null;
    unpricedKg: number;
    uncostedDoses: number;
  };
  fattening: {
    chargedMoney: number;
    sold: number;
    marginMoney: number | null;
    unpricedKg: number;
    uncostedDoses: number;
  };
  /** A head a day is nothing where no animal stood. */
  overheads: { amount: number; perHeadPerDayMoney: number | null };
  /** What each Side came to, before and after its share of the Overheads, and the Farm with them (ADR 0023). */
  results: SideResults;
  /** Where the Farm stood at the stretch's end — or now, for one still going. */
  atEnd: { receivables: ReceivablesByAge; store: StoreValue };
}

/** The money moved in a month, one way of adding it, as the accountant's summary does. */
interface InAndOut {
  inMoney: number;
  outMoney: number;
}

/** What one month of the **Monthly Report** prints from. */
export interface MonthlyReportFacts {
  farm: FarmIdentity;
  /** The month, "YYYY-MM", and the one before it, which it is set beside. */
  month: string;
  before: string;
  /** The farm day it was read to, while the month is still going; nothing for a month gone by. */
  soFarTo: string | null;
  figures: MonthFigures;
  figuresBefore: MonthFigures;
  /** The month's money by Category and by Side; the month alone, as the accountant adds it. */
  moneyBy: {
    category: readonly ({ nameBn: string; nameEn: string | null } & InAndOut)[];
    side: readonly ({ side: Side | null } & InAndOut)[];
  };

  producedAt: Said;
  producedBy: string;
}

/** A dash, for a figure nobody made: never a price of nought. */
export const NONE: Said = { bn: "—", en: "—" };

/** A month by its name and year, in each language. */
export const monthSaid = (month: string): Said => {
  const said = (language: Language) =>
    formatDate(startOfFarmDay(`${month}-01`), language, "monthYear");
  return { bn: said("bn"), en: said("en") };
};

/** A sum in whole taka, as the monthly report's screen says it; or the dash where nothing was made. */
export const sumSaid = (amount: number | null): Said =>
  amount === null ? NONE : moneySaid(Math.round(amount));

/** A price or a cost a unit, to the paisa — its line already says a unit of what — or the dash where there was none. */
const rateSaid = (amount: number | null): Said =>
  amount === null ? NONE : moneySaid(roundMoney(amount));

/** Liters in each language's numerals — one liter, never "1 liters" — or the dash where there were none. */
const litersSaid = (amount: number | null): Said =>
  amount === null
    ? NONE
    : {
        bn: `${formatNumber(amount, "bn")} লিটার`,
        en: `${formatNumber(amount, "en")} ${amount === 1 ? "liter" : "liters"}`,
      };

/** A percentage, to the one decimal it was worked to, or the dash where there was none. */
const percentSaid = (amount: number | null): Said =>
  amount === null
    ? NONE
    : {
        bn: `${formatNumber(amount, "bn")}%`,
        en: `${formatNumber(amount, "en")}%`,
      };

/** What kind of figure a line holds, which says how it is written: a sum in whole taka, a rate to the paisa, liters,
 *  kilogrammes, a count, or a percentage. */
type Kind = "sum" | "rate" | "liters" | "kg" | "count" | "percent";

/** One line of a part: its name, what kind of figure it is, and where a month's figures keep it — nothing where the
 *  month made none. */
interface Figure {
  label: Said;
  kind: Kind;
  of: (figures: MonthFigures) => number | null;
}

/** One part of the month: its heading and its lines, said the same on the paper and in the CSV. */
interface Part {
  heading: Said;
  lines: readonly Figure[];
}

/** A figure as the paper writes it, in each language. */
const figureSaid = (kind: Kind, amount: number | null): Said => {
  switch (kind) {
    case "sum": {
      return sumSaid(amount);
    }
    case "rate": {
      return rateSaid(amount);
    }
    case "liters": {
      return litersSaid(amount);
    }
    case "kg": {
      return amount === null
        ? NONE
        : {
            bn: `${formatNumber(amount, "bn")} কেজি`,
            en: `${formatNumber(amount, "en")} kg`,
          };
    }
    case "count": {
      return amount === null
        ? NONE
        : { bn: formatNumber(amount, "bn"), en: formatNumber(amount, "en") };
    }
    case "percent": {
      return percentSaid(amount);
    }
    default: {
      return kind satisfies never;
    }
  }
};

/** A figure as a spreadsheet takes it: a number — whole taka for a sum, a rate to the paisa — or nothing for none.
 *  A number, never text: a spreadsheet adds a number, and text beginning with a minus is kept from it as a formula. */
const figurePlain = (kind: Kind, amount: number | null): number | null => {
  if (amount === null) {
    return null;
  }
  if (kind === "sum") {
    return Math.round(amount);
  }
  return kind === "rate" ? roundMoney(amount) : amount;
};

/** The farm's own money in the month: in, out, and what was left. */
const MONEY: Part = {
  heading: { bn: "খামারের টাকা", en: "The farm's money" },
  lines: [
    {
      label: { bn: "আয়", en: "Money in" },
      kind: "sum",
      of: (one) => one.money.inMoney,
    },
    {
      label: { bn: "ব্যয়", en: "Money out" },
      kind: "sum",
      of: (one) => one.money.outMoney,
    },
    {
      label: { bn: "নিট", en: "Net" },
      kind: "sum",
      of: (one) => one.money.netMoney,
    },
  ],
};

/** The dairy: milk sold and what a liter fetched, against what the Farm's own cows cost. */
const DAIRY: Part = {
  heading: { bn: "দুগ্ধ", en: "Dairy" },
  lines: [
    {
      label: { bn: "দুধ বিক্রি", en: "Milk sold" },
      kind: "sum",
      of: (one) => one.dairy.milkSoldMoney,
    },
    {
      label: { bn: "বিক্রি হওয়া দুধ", en: "Liters sold" },
      kind: "liters",
      of: (one) => one.dairy.litersSold,
    },
    {
      label: { bn: "লিটারে পাওয়া", en: "Fetched a liter" },
      kind: "rate",
      of: (one) => one.dairy.fetchedPerLiterMoney,
    },
    {
      label: { bn: "দুগ্ধ গাভীর খরচ", en: "Dairy cows cost" },
      kind: "sum",
      of: (one) => one.dairy.chargedMoney,
    },
    {
      label: { bn: "সংগ্রহে যাওয়া দুধ", en: "Milk to bulk" },
      kind: "liters",
      of: (one) => one.dairy.litersToBulk,
    },
    {
      label: { bn: "গাভীপ্রতি দিনে", en: "Per cow, a day" },
      kind: "liters",
      of: (one) => one.dairy.litersPerCowMilked,
    },
    {
      label: { bn: "লিটারে খরচ", en: "Cost a liter" },
      kind: "rate",
      of: (one) => one.dairy.costPerLiterMoney,
    },
  ],
};

/** The Farm's own fattening animals: what they cost, and the Margins of those sold. */
const FATTENING: Part = {
  heading: { bn: "মোটাতাজাকরণ", en: "Fattening" },
  lines: [
    {
      label: { bn: "মোটাতাজাকরণের খরচ", en: "Fattening cost" },
      kind: "sum",
      of: (one) => one.fattening.chargedMoney,
    },
    {
      label: { bn: "বিক্রি হওয়া পশু", en: "Animals sold" },
      kind: "count",
      of: (one) => one.fattening.sold,
    },
    {
      label: { bn: "তাদের মার্জিন", en: "Their margins" },
      kind: "sum",
      of: (one) => one.fattening.marginMoney,
    },
  ],
};

/** An age of what buyers owe, in days, in each language's numerals. */
const AGE_SAID: Record<ReceivableAge, Said> = {
  "0-7": { bn: "০–৭ দিন", en: "0–7 days" },
  "8-15": { bn: "৮–১৫ দিন", en: "8–15 days" },
  "16-30": { bn: "১৬–৩০ দিন", en: "16–30 days" },
  "31-60": { bn: "৩১–৬০ দিন", en: "31–60 days" },
  "over-60": { bn: "৬০ দিনের বেশি", en: "Over 60 days" },
};

/** What buyers owed at the month's end, by the days since it left, the whole, and what of it was overdue. */
const RECEIVABLES: Part = {
  heading: {
    bn: "মাস শেষে বাকি, কত দিনের",
    en: "Owed at the month's end, by age",
  },
  lines: [
    ...RECEIVABLE_AGES.map(({ age }) => ({
      label: AGE_SAID[age],
      kind: "sum" as const,
      of: (one: MonthFigures) =>
        one.atEnd.receivables.ages.find((each) => each.age === age)
          ?.owingMoney ?? 0,
    })),
    {
      label: { bn: "মোট বাকি", en: "Owed in all" },
      kind: "sum",
      of: (one) => one.atEnd.receivables.owingMoney,
    },
    {
      label: { bn: "এর মধ্যে মেয়াদ পেরোনো", en: "Of it overdue" },
      kind: "sum",
      of: (one) => one.atEnd.receivables.overdueMoney,
    },
  ],
};

/** What the store held at the month's end, in taka: the feed at its average price, the medicine at a dose's. */
const STORE: Part = {
  heading: { bn: "মাস শেষে ভান্ডার", en: "The store at the month's end" },
  lines: [
    {
      label: { bn: "খাদ্য", en: "Feed" },
      kind: "sum",
      of: (one) => one.atEnd.store.feedMoney,
    },
    {
      label: { bn: "ওষুধ", en: "Medicine" },
      kind: "sum",
      of: (one) => one.atEnd.store.medicineMoney,
    },
    {
      label: { bn: "মোট ভান্ডার", en: "The store in all" },
      kind: "sum",
      of: (one) => one.atEnd.store.totalMoney,
    },
  ],
};

/** What running the place cost, charged to no Side, and a head a day. */
const OVERHEADS: Part = {
  heading: { bn: "পরিচালন খরচ", en: "Overheads" },
  lines: [
    {
      label: { bn: "মাসে মোট", en: "In the month" },
      kind: "sum",
      of: (one) => one.overheads.amount,
    },
    {
      label: { bn: "মাথাপিছু দিনে", en: "A head a day" },
      kind: "rate",
      of: (one) => one.overheads.perHeadPerDayMoney,
    },
  ],
};

/** The heading of the month's money by Category, which holds this month alone. */
const BY_CATEGORY: Said = {
  bn: "খাত অনুযায়ী, এই মাসে",
  en: "By category, this month",
};
/** The heading of the month's money by Side, which holds this month alone. */
const BY_SIDE: Said = { bn: "বিভাগ অনুযায়ী, এই মাসে", en: "By side, this month" };

/** A part of the month as a table: each line, the month beside the month before. */
const partOf = (
  { heading, lines }: Part,
  { month, before, figures, figuresBefore }: MonthlyReportFacts
): PaperSection => ({
  kind: "table",
  heading,
  columns: [
    { label: { bn: "হিসাব", en: "Figure" } },
    { label: monthSaid(month), figures: true },
    { label: monthSaid(before), figures: true },
  ],
  rows: lines.map((line) => [
    line.label,
    figureSaid(line.kind, line.of(figures)),
    figureSaid(line.kind, line.of(figuresBefore)),
  ]),
  foot: null,
  note: null,
});

/** The month's money by one way of adding it — by Category, or by Side — in and out, the month alone. */
const moneyByPart = (
  heading: Said,
  first: Said,
  rows: readonly { name: Worded; inMoney: number; outMoney: number }[]
): PaperSection =>
  rows.length === 0
    ? {
        kind: "facts",
        heading,
        rows: [],
        note: {
          bn: "এই মাসে খামারের টাকা নড়েনি।",
          en: "The farm's money did not move this month.",
        },
      }
    : {
        kind: "table",
        heading,
        columns: [
          { label: first },
          { label: { bn: "আয়", en: "Money in" }, figures: true },
          { label: { bn: "ব্যয়", en: "Money out" }, figures: true },
        ],
        rows: rows.map((row) => [
          row.name,
          row.inMoney === 0 ? NONE : sumSaid(row.inMoney),
          row.outMoney === 0 ? NONE : sumSaid(row.outMoney),
        ]),
        foot: null,
        note: null,
      };

/** A Side by the name the farm's papers give it; the whole farm for money that belongs to no one Side. */
const sideSaid = (side: Side | null): Said => {
  if (side === null) {
    return { bn: "পুরো খামার", en: "Whole farm" };
  }
  const [bn, en] = SIDE_LABEL[side];
  return { bn, en };
};

/** What each Side came to: its heading, and each of its figures, said the same on the paper and in the CSV. */
const RESULTS: Said = { bn: "প্রতিটি বিভাগের ফল", en: "What each side came to" };
const RESULT_FIGURES: readonly {
  label: Said;
  kind: Kind;
  of: (result: SideResult) => number | null;
}[] = [
  {
    label: { bn: "আয়", en: "Brought in" },
    kind: "sum",
    of: (one) => one.broughtInMoney,
  },
  {
    label: { bn: "পরিচালন খরচের আগে", en: "Before overheads" },
    kind: "sum",
    of: (one) => one.beforeOverheadsMoney,
  },
  {
    label: { bn: "মার্জিন", en: "Margin" },
    kind: "percent",
    of: (one) => one.marginBeforePercent,
  },
  {
    label: { bn: "পরিচালন খরচের ভাগ", en: "Share of overheads" },
    kind: "sum",
    of: (one) => one.overheadsMoney,
  },
  {
    label: { bn: "পরিচালন খরচের পরে", en: "After overheads" },
    kind: "sum",
    of: (one) => one.afterOverheadsMoney,
  },
  {
    label: { bn: "পরিচালন খরচের পরে মার্জিন", en: "Margin after overheads" },
    kind: "percent",
    of: (one) => one.marginAfterPercent,
  },
];
/** The Overheads the Ventures' animals' days come to, which the Farm bears: a share and nothing else. */
const VENTURES_DAYS: Said = {
  bn: "ভেঞ্চারের পশুর দিন",
  en: "The Ventures' animals' days",
};
/** The rows of what each Side came to, a Side's figures to a row; the Ventures' days hold their share alone. */
const resultRows = (results: SideResults) => {
  const sides = [
    { name: sideSaid("dairy"), result: results.dairy },
    { name: sideSaid("fattening"), result: results.fattening },
  ];
  return {
    sides,
    rest: results.restOfOverheadsMoney,
    farm: { name: sideSaid(null), result: results.farm },
  };
};

/** What each Side came to this month, before and after its share of the overheads, with the farm's as the total. */
const resultsPart = ({ figures }: MonthlyReportFacts): PaperSection => {
  const { sides, rest, farm } = resultRows(figures.results);
  const row = (name: Said, result: SideResult) => [
    name,
    ...RESULT_FIGURES.map((one) => figureSaid(one.kind, one.of(result))),
  ];
  return {
    kind: "table",
    heading: { bn: `${RESULTS.bn}, এই মাসে`, en: `${RESULTS.en}, this month` },
    columns: [
      { label: { bn: "বিভাগ", en: "Side" } },
      ...RESULT_FIGURES.map((one) => ({
        label:
          one.kind === "percent" ? { bn: "মার্জিন", en: "Margin" } : one.label,
        figures: true,
      })),
    ],
    rows: [
      ...sides.map((one) => row(one.name, one.result)),
      [
        VENTURES_DAYS,
        ...RESULT_FIGURES.map((one) =>
          one.label.en === "Share of overheads" ? sumSaid(rest) : NONE
        ),
      ],
    ],
    foot: row(farm.name, farm.result),
    note: {
      bn: "দুগ্ধের আয় বিক্রি করা দুধ, মোটাতাজাকরণের আয় বিক্রি হওয়া পশুর দাম; পরিচালন খরচ ভাগ হয়েছে প্রতিটি বিভাগে খামারের নিজের পশু যত দিন ছিল সেই হিসাবে। এটি খামারের মুনাফা নয়: তা হিসাবরক্ষকের পূর্ণ হিসাব বলবে।",
      en: "The dairy brought in the milk it sold, the fattening side the prices of the animals it sold; the overheads are shared by the days the farm's own animals stood on each side. Not the farm's profit, which its accountant's full books say.",
    },
  };
};

/** The fodder fed at no price, both Sides together, in kilogrammes: left out of every cost above. */
const unpricedKgOf = (figures: MonthFigures) =>
  figures.dairy.unpricedKg + figures.fattening.unpricedKg;

/** The doses of medicine the farm had not bought, both Sides together: not costed. */
const uncostedDosesOf = (figures: MonthFigures) =>
  figures.dairy.uncostedDoses + figures.fattening.uncostedDoses;

/** What the month's figures leave out, and the money still waiting: said, never shown as nothing. */
const leftOut = (figures: MonthFigures): Said[] => {
  const kg = unpricedKgOf(figures);
  const doses = uncostedDosesOf(figures);
  const waiting = figures.money.awaitingCount;
  const { unpriced } = figures.atEnd.store;
  return [
    kg > 0
      ? {
          bn: `${formatNumber(kg, "bn")} কেজি নিজের জমির ঘাস এই মাসে দাম ছাড়া খাওয়ানো হয়েছে; এর খরচ ওপরে নেই।`,
          en: `${formatNumber(kg, "en")} kg of home-grown fodder was fed at no price this month, and costs nothing above.`,
        }
      : null,
    doses > 0
      ? {
          bn: `${formatNumber(doses, "bn")}টি ডোজ এই মাসে খামারে না-কেনা ওষুধের; খরচ ধরা হয়নি।`,
          en: `${formatNumber(doses, "en")} ${doses === 1 ? "dose was" : "doses were"} of medicine the farm had not bought this month, and ${doses === 1 ? "is" : "are"} not costed.`,
        }
      : null,
    unpriced > 0
      ? {
          bn: `${formatNumber(unpriced, "bn")}টি খাদ্য বা ওষুধ মাস শেষে ভান্ডারে ছিল যার কোনো দাম নেই; ভান্ডারের হিসাবে তা ধরা হয়নি।`,
          en: `${formatNumber(unpriced, "en")} ${unpriced === 1 ? "feed or medicine was" : "feeds or medicines were"} in the store at the month's end with no price, and ${unpriced === 1 ? "is" : "are"} not in its worth.`,
        }
      : null,
    waiting > 0
      ? {
          bn: `${formatNumber(waiting, "bn")}টি টাকার হিসাব এই মাসে এখনো অনুমোদনের অপেক্ষায়; যোগফলে ধরা আছে, হিসাবরক্ষকের সারাংশে যেমন।`,
          en: `${formatNumber(waiting, "en")} ${waiting === 1 ? "entry of money is" : "entries of money are"} still waiting for approval this month, and counted, as the accountant's summary counts them.`,
        }
      : null,
  ].filter((line) => line !== null);
};

/** That each Venture keeps its own accounts and has its own monthly report: never named here, as their money is not
 *  the Farm's. */
const VENTURES_KEEP_THEIR_OWN: Said = {
  bn: "প্রতিটি ভেঞ্চার নিজের হিসাব নিজে রাখে, তাই এই প্রতিবেদনে নেই; প্রতিটির নিজের মাসিক প্রতিবেদন আছে।",
  en: "Each venture keeps its own accounts, so none are in this report; each has its own monthly report.",
};

/**
 * One month of the **Monthly Report** on paper, for the Owner and the farm's accountant: on the **Farm Identity**
 * letterhead, read in Bangla or English (ADR 0021), each figure of the month beside the month before's — the Farm's own
 * money, and by Category and by Side for the month alone, the dairy, the fattening side and the overheads — then what
 * the figures leave out, and the Ventures, which keep their own accounts. A month still going says to which day. No
 * Projection and no rate a year (ADR 0010, 0012): every figure is one the month made.
 */
export const monthlyReportPaper = (
  facts: MonthlyReportFacts
): PaperDocument => {
  const named = monthSaid(facts.month);
  const soFar = facts.soFarTo === null ? null : daySaid(facts.soFarTo);
  return {
    letterhead: letterheadOf(facts.farm),
    title: {
      bn: `মাসিক প্রতিবেদন — ${named.bn}`,
      en: `Monthly report — ${named.en}`,
    },
    preamble: soFar
      ? {
          bn: `মাস এখনো চলছে: ${soFar.bn} পর্যন্ত যা হয়েছে, আগের মাসের পাশে।`,
          en: `The month is still going: what it came to so far, to ${soFar.en}, beside the month before.`,
        }
      : {
          bn: "মাসের হিসাব, আগের মাসের পাশে।",
          en: "The month's figures, beside the month before.",
        },
    sections: [
      partOf(MONEY, facts),
      moneyByPart(
        BY_CATEGORY,
        { bn: "খাত", en: "Category" },
        facts.moneyBy.category.map((row) => ({
          name: { bn: row.nameBn, en: row.nameEn ?? row.nameBn },
          inMoney: row.inMoney,
          outMoney: row.outMoney,
        }))
      ),
      moneyByPart(
        BY_SIDE,
        { bn: "বিভাগ", en: "Side" },
        facts.moneyBy.side.map((row) => ({
          name: sideSaid(row.side),
          inMoney: row.inMoney,
          outMoney: row.outMoney,
        }))
      ),
      partOf(DAIRY, facts),
      partOf(FATTENING, facts),
      partOf(OVERHEADS, facts),
      resultsPart(facts),
      partOf(RECEIVABLES, facts),
      partOf(STORE, facts),
    ],
    closing: [...leftOut(facts.figures), VENTURES_KEEP_THEIR_OWN],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};

/** One row of the month for a spreadsheet: its part and line in Bangla and in English — no English where a Category
 *  was given none, as the accountant's own file leaves it — which way the money went for a row of the month's money
 *  by Category or by Side, and its figure this month and the month before as numbers: nothing where there was none,
 *  or where a figure is the month's alone. */
export interface MonthlyReportRow {
  part: Said;
  line: { bn: string; en: string | null };
  way: "in" | "out" | null;
  thisMonth: number | null;
  monthBefore: number | null;
}

/** The month's money in and out by one way of adding it, a row each way: the month alone. */
const moneyByRows = (
  part: Said,
  rows: readonly {
    name: { bn: string; en: string | null };
    inMoney: number;
    outMoney: number;
  }[]
): MonthlyReportRow[] =>
  rows.flatMap((row) =>
    (["in", "out"] as const).map((way) => ({
      part,
      line: row.name,
      way,
      thisMonth: figurePlain("sum", way === "in" ? row.inMoney : row.outMoney),
      monthBefore: null,
    }))
  );

/** A row of a Side's figure: whose, then which. */
const named = (who: Said, what: Said): Said => ({
  bn: `${who.bn} — ${what.bn}`,
  // Sentence case runs on past the dash: "Dairy — margin after overheads".
  en: `${who.en} — ${what.en.charAt(0).toLowerCase()}${what.en.slice(1)}`,
});

/** What each Side came to, a row a figure — this month and the month before — and the Ventures' days' share. */
const resultsRows = ({
  figures,
  figuresBefore,
}: MonthlyReportFacts): MonthlyReportRow[] => {
  const now = resultRows(figures.results);
  const before = resultRows(figuresBefore.results);
  const whose = [
    ...now.sides.map((one, index) => ({
      name: one.name,
      now: one.result,
      before: before.sides[index]?.result ?? null,
    })),
    { name: now.farm.name, now: now.farm.result, before: before.farm.result },
  ];
  return [
    ...whose.flatMap(({ name, now: result, before: earlier }) =>
      RESULT_FIGURES.map((one) => ({
        part: RESULTS,
        line: named(name, one.label),
        way: null,
        thisMonth: figurePlain(one.kind, one.of(result)),
        monthBefore:
          earlier === null ? null : figurePlain(one.kind, one.of(earlier)),
      }))
    ),
    {
      part: RESULTS,
      line: named(VENTURES_DAYS, {
        bn: "পরিচালন খরচের ভাগ",
        en: "share of overheads",
      }),
      way: null,
      thisMonth: figurePlain("sum", now.rest),
      monthBefore: figurePlain("sum", before.rest),
    },
  ];
};

/** What a month's figures leave out, each a figure of its own: the fodder fed at no price, and the doses not costed. */
const LEFT_OUT: Part = {
  heading: { bn: "বাদ পড়েছে", en: "Left out" },
  lines: [
    {
      label: { bn: "দাম ছাড়া খাওয়ানো ঘাস", en: "Fodder fed at no price" },
      kind: "kg",
      of: unpricedKgOf,
    },
    {
      label: {
        bn: "না-কেনা ওষুধের ডোজ, খরচ ধরা হয়নি",
        en: "Doses of medicine not bought, not costed",
      },
      kind: "count",
      of: uncostedDosesOf,
    },
  ],
};

/** The money still waiting for the Owner's approval: counted in every total above, as the accountant's summary counts
 *  it, and said apart so it is never mistaken for money left out. */
const AWAITING: Part = {
  heading: {
    bn: "অনুমোদনের অপেক্ষায়, যোগফলে ধরা আছে",
    en: "Awaiting approval, counted in",
  },
  lines: [
    {
      label: { bn: "টাকার হিসাব", en: "Entries of money" },
      kind: "count",
      of: (one) => one.money.awaitingCount,
    },
  ],
};

/**
 * One month of the **Monthly Report** as a spreadsheet takes it, for the farm's accountant beside the accountant's own
 * file: a row a figure, from the same parts and lines the paper prints (`monthlyReportPaper`), so the two never say a
 * month differently — then its money by Category and by Side, a row each way, what its figures leave out, and the
 * money still waiting, which is counted in.
 */
export const monthlyReportRows = (
  facts: MonthlyReportFacts
): MonthlyReportRow[] => {
  const rowsOf = ({ heading, lines }: Part): MonthlyReportRow[] =>
    lines.map((line) => ({
      part: heading,
      line: line.label,
      way: null,
      thisMonth: figurePlain(line.kind, line.of(facts.figures)),
      monthBefore: figurePlain(line.kind, line.of(facts.figuresBefore)),
    }));
  return [
    ...rowsOf(MONEY),
    ...moneyByRows(
      BY_CATEGORY,
      facts.moneyBy.category.map((row) => ({
        name: { bn: row.nameBn, en: row.nameEn },
        inMoney: row.inMoney,
        outMoney: row.outMoney,
      }))
    ),
    ...moneyByRows(
      BY_SIDE,
      facts.moneyBy.side.map((row) => ({
        name: sideSaid(row.side),
        inMoney: row.inMoney,
        outMoney: row.outMoney,
      }))
    ),
    ...rowsOf(DAIRY),
    ...rowsOf(FATTENING),
    ...rowsOf(OVERHEADS),
    ...resultsRows(facts),
    ...rowsOf(RECEIVABLES),
    ...rowsOf(STORE),
    ...rowsOf(LEFT_OUT),
    ...rowsOf(AWAITING),
  ];
};
