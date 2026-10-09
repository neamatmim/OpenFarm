import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity } from "./farm";
import { producedSaid } from "./investor-statements";
import { NONE } from "./monthly-report-paper";
import { daySaid } from "./nominees";
import type { PaperDocument, PaperSection } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { Said, Worded } from "./papers";

/** One Dispatch as the record prints it: when the milk left, how much, to whom and where, its delivery note, and what a
 *  test read of it. */
export interface DispatchOnPaper {
  at: Date;
  liters: number;
  buyerName: string;
  buyerAddress: string | null;
  deliveryNote: string | null;
  fatPercent: number | null;
  snfPercent: number | null;
}

/** What the milk dispatch record prints from: every Dispatch in a period. */
export interface MilkDispatchFacts {
  farm: FarmIdentity;
  /** The period's first and last farm days, "YYYY-MM-DD". */
  from: string;
  to: string;
  dispatches: readonly DispatchOnPaper[];
  producedAt: Said;
  producedBy: string;
}

/** A figure in each language's numerals. */
const numberSaid = (value: number): Said => ({
  bn: formatNumber(value, "bn"),
  en: formatNumber(value, "en"),
});

/** Liters in each language — one liter, never "1 liters". */
const litersSaid = (value: number): Said => ({
  bn: `${formatNumber(value, "bn")} লিটার`,
  en: `${formatNumber(value, "en")} ${value === 1 ? "liter" : "liters"}`,
});

/** The farm's day or its time a moment fell on, in each language. */
const momentSaid = (at: Date, style: "date" | "time"): Said => {
  const said = (language: Language) => formatDate(at, language, style);
  return { bn: said("bn"), en: said("en") };
};

/** What a test read of the milk — its fat and its solids not fat — or the dash where it was not tested. */
const testSaid = (fat: number | null, snf: number | null): Worded => {
  if (fat === null && snf === null) {
    return NONE;
  }
  const said = (language: Language) =>
    [fat, snf]
      .map((one) => (one === null ? "—" : formatNumber(one, language)))
      .join(" / ");
  return { bn: said("bn"), en: said("en") };
};

/** Words a person wrote, or the dash where they wrote none. */
const writtenOrNone = (words: string | null): Worded =>
  words?.trim() ? words : NONE;

/** Every Dispatch of the period, one to a line, and the liters added up beneath. */
const dispatchesPart = (
  dispatches: MilkDispatchFacts["dispatches"]
): PaperSection => {
  const heading: Said = { bn: "হস্তান্তর", en: "Dispatches" };
  if (dispatches.length === 0) {
    return {
      kind: "facts",
      heading,
      rows: [],
      note: {
        bn: "এই সময়ে কোনো দুধ হস্তান্তর হয়নি।",
        en: "No milk was dispatched in this period.",
      },
    };
  }
  const total = dispatches.reduce((sum, one) => sum + one.liters, 0);
  return {
    kind: "table",
    heading,
    columns: [
      { label: { bn: "সময়", en: "Dispatched" }, whole: true },
      { label: { bn: "ক্রেতা ও ঠিকানা", en: "Buyer and address" } },
      { label: { bn: "চালান", en: "Delivery note" }, whole: true },
      { label: { bn: "লিটার", en: "Liters" }, figures: true },
      { label: { bn: "ফ্যাট / এসএনএফ %", en: "Fat / SNF %" }, figures: true },
    ],
    rows: dispatches.map((one) => [
      // The time under the day, so the day never breaks and the buyer has the room.
      {
        bn: `${momentSaid(one.at, "date").bn}\n${momentSaid(one.at, "time").bn}`,
        en: `${momentSaid(one.at, "date").en}\n${momentSaid(one.at, "time").en}`,
      },
      // The address under the buyer's name, as an envelope has it.
      one.buyerAddress?.trim()
        ? `${one.buyerName}\n${one.buyerAddress.trim()}`
        : one.buyerName,
      writtenOrNone(one.deliveryNote),
      numberSaid(one.liters),
      testSaid(one.fatPercent, one.snfPercent),
    ]),
    // Rounded once, to the hundredth the farm measures milk in.
    foot: [
      { bn: "মোট", en: "Total" },
      "",
      "",
      "",
      litersSaid(Math.round(total * 100) / 100),
      "",
    ],
    note: null,
  };
};

/**
 * The milk dispatch record on paper: every Dispatch in a period with the buyer's name and address and the delivery
 * note — what the Safe Food Act (s.38) asks a producer to be able to show about who took its milk — on the **Farm
 * Identity** letterhead, read in Bangla or English, stamped with who produced it and when.
 */
export const milkDispatchPaper = (facts: MilkDispatchFacts): PaperDocument => {
  const from = daySaid(facts.from);
  const to = daySaid(facts.to);
  return {
    letterhead: letterheadOf(facts.farm),
    title: { bn: "দুধ হস্তান্তরের রেকর্ড", en: "Milk dispatch record" },
    preamble: {
      bn: `${from.bn} থেকে ${to.bn} পর্যন্ত খামার থেকে যাওয়া সব দুধ: কে নিয়েছে, কোথায়, কোন চালানে।`,
      en: `All milk that left the farm from ${from.en} to ${to.en}: who took it, where to, and on which delivery note.`,
    },
    sections: [dispatchesPart(facts.dispatches)],
    closing: [],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};
