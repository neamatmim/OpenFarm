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
const NONE: Said = { bn: "—", en: "—" };

/** A month by its name and year, in each language. */
const monthSaid = (month: string): Said => {
  const said = (language: Language) =>
    formatDate(startOfFarmDay(`${month}-01`), language, "monthYear");
  return { bn: said("bn"), en: said("en") };
};

/** A sum in whole taka, as the monthly report's screen says it; or the dash where nothing was made. */
const sumSaid = (amount: number | null): Said =>
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

/** One line of a part: what it is, and how to say it of a month's figures. */
type Line = [label: Said, say: (figures: MonthFigures) => Said];

/** A part of the month as a table: each line, the month beside the month before. */
const partOf = (
  heading: Said,
  lines: readonly Line[],
  { month, before, figures, figuresBefore }: MonthlyReportFacts
): PaperSection => ({
  kind: "table",
  heading,
  columns: [
    { label: { bn: "হিসাব", en: "Figure" } },
    { label: monthSaid(month), figures: true },
    { label: monthSaid(before), figures: true },
  ],
  rows: lines.map(([label, say]) => [label, say(figures), say(figuresBefore)]),
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

/** What the month's figures leave out, and the money still waiting: said, never shown as nothing. */
const leftOut = (figures: MonthFigures): Said[] => {
  const kg = figures.dairy.unpricedKg + figures.fattening.unpricedKg;
  const doses = figures.dairy.uncostedDoses + figures.fattening.uncostedDoses;
  const waiting = figures.money.awaitingCount;
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
      partOf(
        { bn: "খামারের টাকা", en: "The farm's money" },
        [
          [{ bn: "আয়", en: "Money in" }, (one) => sumSaid(one.money.inMoney)],
          [
            { bn: "ব্যয়", en: "Money out" },
            (one) => sumSaid(one.money.outMoney),
          ],
          [{ bn: "নিট", en: "Net" }, (one) => sumSaid(one.money.netMoney)],
        ],
        facts
      ),
      moneyByPart(
        { bn: "খাত অনুযায়ী, এই মাসে", en: "By category, this month" },
        { bn: "খাত", en: "Category" },
        facts.moneyBy.category.map((row) => ({
          name: { bn: row.nameBn, en: row.nameEn ?? row.nameBn },
          inMoney: row.inMoney,
          outMoney: row.outMoney,
        }))
      ),
      moneyByPart(
        { bn: "বিভাগ অনুযায়ী, এই মাসে", en: "By side, this month" },
        { bn: "বিভাগ", en: "Side" },
        facts.moneyBy.side.map((row) => ({
          name: sideSaid(row.side),
          inMoney: row.inMoney,
          outMoney: row.outMoney,
        }))
      ),
      partOf(
        { bn: "দুগ্ধ", en: "Dairy" },
        [
          [
            { bn: "দুধ বিক্রি", en: "Milk sold" },
            (one) => sumSaid(one.dairy.milkSoldMoney),
          ],
          [
            { bn: "বিক্রি হওয়া দুধ", en: "Liters sold" },
            (one) => litersSaid(one.dairy.litersSold),
          ],
          [
            { bn: "লিটারে পাওয়া", en: "Fetched a liter" },
            (one) => rateSaid(one.dairy.fetchedPerLiterMoney),
          ],
          [
            { bn: "দুগ্ধ গাভীর খরচ", en: "Dairy cows cost" },
            (one) => sumSaid(one.dairy.chargedMoney),
          ],
          [
            { bn: "সংগ্রহে যাওয়া দুধ", en: "Milk to bulk" },
            (one) => litersSaid(one.dairy.litersToBulk),
          ],
          [
            { bn: "গাভীপ্রতি দিনে", en: "Per cow, a day" },
            (one) => litersSaid(one.dairy.litersPerCowMilked),
          ],
          [
            { bn: "লিটারে খরচ", en: "Cost a liter" },
            (one) => rateSaid(one.dairy.costPerLiterMoney),
          ],
        ],
        facts
      ),
      partOf(
        { bn: "মোটাতাজাকরণ", en: "Fattening" },
        [
          [
            { bn: "মোটাতাজাকরণের খরচ", en: "Fattening cost" },
            (one) => sumSaid(one.fattening.chargedMoney),
          ],
          [
            { bn: "বিক্রি হওয়া পশু", en: "Animals sold" },
            (one) => ({
              bn: formatNumber(one.fattening.sold, "bn"),
              en: formatNumber(one.fattening.sold, "en"),
            }),
          ],
          [
            { bn: "তাদের মার্জিন", en: "Their margins" },
            (one) => sumSaid(one.fattening.marginMoney),
          ],
        ],
        facts
      ),
      partOf(
        { bn: "পরিচালন খরচ", en: "Overheads" },
        [
          [
            { bn: "মাসে মোট", en: "In the month" },
            (one) => sumSaid(one.overheads.amount),
          ],
          [
            { bn: "মাথাপিছু দিনে", en: "A head a day" },
            (one) => rateSaid(one.overheads.perHeadPerDayMoney),
          ],
        ],
        facts
      ),
    ],
    closing: [...leftOut(facts.figures), VENTURES_KEEP_THEIR_OWN],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};
