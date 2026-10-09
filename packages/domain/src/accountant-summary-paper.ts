import { formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { producedSaid } from "./investor-statements";
import { moneySaid } from "./joining-letter";
import { roundMoney } from "./money";
import type { MoneySummary } from "./money-summary";
import { NONE } from "./monthly-report-paper";
import { daySaid } from "./nominees";
import type { PaperDocument, PaperSection } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { Said, Worded } from "./papers";
import { SIDE_LABEL } from "./papers";

/** What the accountant's summary prints from: the period's money added up (`summarizeMoney`), and who still owed the
 *  farm what on its last day. */
export interface AccountantSummaryFacts {
  farm: FarmIdentity;
  /** The period's first and last farm days, "YYYY-MM-DD". */
  from: string;
  to: string;
  summary: MoneySummary;
  /** Who still owed the farm what on the period's last day — its **Receivable** — biggest first. */
  receivableAtTheEnd: readonly { name: string; owingMoney: number }[];
  producedAt: Said;
  producedBy: string;
}

/** A sum to the paisa, as the accountant's books keep it. */
const sumSaid = (amount: number): Said => moneySaid(roundMoney(amount));

/** A sum in a column of money in or out: the dash where nothing moved that way, so a nought never reads as a figure. */
const movedSaid = (amount: number): Said =>
  roundMoney(amount) === 0 ? NONE : sumSaid(amount);

/** The heading of the column of what each line is. */
const FIGURE: Said = { bn: "হিসাব", en: "Figure" };
/** The heading of a column of money. */
const MONEY: Said = { bn: "টাকা", en: "Money" };
/** The heading of the column of money that came in. */
const MONEY_IN: Said = { bn: "আয়", en: "Money in" };
/** The heading of the column of money that went out. */
const MONEY_OUT: Said = { bn: "ব্যয়", en: "Money out" };
/** The line that adds a table up. */
const TOTAL: Said = { bn: "মোট", en: "Total" };

/** The period's income against its expense, what it left, and the money still waiting for approval said beneath. */
const totalsPart = ({ summary }: AccountantSummaryFacts): PaperSection => {
  const { awaiting } = summary;
  return {
    kind: "table",
    heading: { bn: "সারাংশ", en: "Summary" },
    columns: [{ label: FIGURE }, { label: MONEY, figures: true }],
    rows: [
      [{ bn: "আয়", en: "Income" }, sumSaid(summary.incomeMoney)],
      [{ bn: "ব্যয়", en: "Expense" }, sumSaid(summary.expenseMoney)],
    ],
    foot: [{ bn: "নিট", en: "Net" }, sumSaid(summary.netMoney)],
    note:
      awaiting.count > 0
        ? {
            bn: `${formatNumber(awaiting.count, "bn")}টি হিসাব এখনো অনুমোদনের অপেক্ষায়: আয় ${sumSaid(awaiting.inMoney).bn}, ব্যয় ${sumSaid(awaiting.outMoney).bn}। এখানকার প্রতিটি অঙ্কে এগুলো ধরা আছে।`,
            en: `${formatNumber(awaiting.count, "en")} ${awaiting.count === 1 ? "entry is" : "entries are"} still awaiting approval: ${sumSaid(awaiting.inMoney).en} in, ${sumSaid(awaiting.outMoney).en} out. ${awaiting.count === 1 ? "It is" : "They are"} counted in every figure here.`,
          }
        : null,
  };
};

/** The period's money by one way of adding it — by Category, Counterparty or Side — in and out, added up beneath. */
const inAndOutPart = (
  heading: Said,
  first: Said,
  lines: readonly { name: Worded; inMoney: number; outMoney: number }[]
): PaperSection =>
  lines.length === 0
    ? {
        kind: "facts",
        heading,
        rows: [],
        note: {
          bn: "এই সময়ে খামারের টাকা নড়েনি।",
          en: "The farm's money did not move in this period.",
        },
      }
    : {
        kind: "table",
        heading,
        columns: [
          { label: first },
          { label: MONEY_IN, figures: true },
          { label: MONEY_OUT, figures: true },
        ],
        rows: lines.map((line) => [
          line.name,
          movedSaid(line.inMoney),
          movedSaid(line.outMoney),
        ]),
        foot: null,
        note: null,
      };

/** A Side by the name the farm's papers give it; the whole farm for money that belongs to no one Side. */
const sideSaid = (side: keyof typeof SIDE_LABEL | null): Said => {
  if (side === null) {
    return { bn: "পুরো খামার", en: "Whole farm" };
  }
  const [bn, en] = SIDE_LABEL[side];
  return { bn, en };
};

/** Who still owed the farm what on the period's last day, and all of it together. */
const owedPart = (
  owed: AccountantSummaryFacts["receivableAtTheEnd"]
): PaperSection => ({
  kind: "table",
  heading: {
    bn: "সময়কালের শেষে খামারের পাওনা",
    en: "Owed to the farm at the period's end",
  },
  columns: [
    { label: { bn: "ক্রেতা", en: "Buyer" } },
    { label: { bn: "বাকি", en: "Owed" }, figures: true },
  ],
  rows: owed.map((one) => [one.name, sumSaid(one.owingMoney)]),
  foot: [TOTAL, sumSaid(owed.reduce((sum, one) => sum + one.owingMoney, 0))],
  note: null,
});

/**
 * The accountant's summary on paper, for the farm's accountant: on the **Farm Identity** letterhead, read in Bangla or
 * English (ADR 0021), a period's income against expense and what it left, then the same money by Category, by
 * Counterparty and by Side, in and out, and who still owed the farm what at its end. Money the Owner has not approved
 * is counted, as it has moved, and said beneath the totals. The farm does not keep books; its accountant keeps them
 * from this and the CSV that goes with it.
 */
export const accountantSummaryPaper = (
  facts: AccountantSummaryFacts
): PaperDocument => {
  const from = daySaid(facts.from);
  const to = daySaid(facts.to);
  const { summary } = facts;
  return {
    letterhead: letterheadOf(facts.farm),
    title: { bn: "আয় ও ব্যয়", en: "Income and expense" },
    preamble: {
      bn: `${from.bn} থেকে ${to.bn} পর্যন্ত খামারের টাকা, হিসাবরক্ষকের জন্য।`,
      en: `The farm's money from ${from.en} to ${to.en}, for the accountant.`,
    },
    sections: [
      totalsPart(facts),
      inAndOutPart(
        { bn: "খাত অনুযায়ী", en: "By category" },
        { bn: "খাত", en: "Category" },
        summary.byCategory.map((line) => ({
          name: { bn: line.nameBn, en: line.nameEn ?? line.nameBn },
          inMoney: line.inMoney,
          outMoney: line.outMoney,
        }))
      ),
      inAndOutPart(
        { bn: "যার সাথে লেনদেন", en: "By counterparty" },
        { bn: "নাম", en: "Name" },
        summary.byCounterparty.map((line) => ({
          name: line.name ?? { bn: "নাম নেই", en: "Not named" },
          inMoney: line.inMoney,
          outMoney: line.outMoney,
        }))
      ),
      inAndOutPart(
        { bn: "বিভাগ অনুযায়ী", en: "By side" },
        { bn: "বিভাগ", en: "Side" },
        summary.bySide.map((line) => ({
          name: sideSaid(line.side),
          inMoney: line.inMoney,
          outMoney: line.outMoney,
        }))
      ),
      ...(facts.receivableAtTheEnd.length > 0
        ? [owedPart(facts.receivableAtTheEnd)]
        : []),
    ],
    closing: [],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};
