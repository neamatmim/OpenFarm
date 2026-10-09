import { formatNumber } from "@OpenFarm/i18n";

import type { FarmIdentity, RegistrationStanding } from "./farm";
import { producedSaid } from "./investor-statements";
import { countSaid } from "./joining-letter";
import { NONE } from "./monthly-report-paper";
import { daySaid } from "./nominees";
import type { Produced } from "./paper-saying";
import { TOTAL, dayOrNone } from "./paper-saying";
import type { PaperDocument } from "./paper-template";
import { letterheadOf } from "./paper-template";
import type { DocumentRow, Said } from "./papers";

/** What one of the Inspector View's registers prints from: what it is, the period it covers, and its entries. */
export interface RegisterFacts extends Produced {
  farm: FarmIdentity;
  title: Said;
  /** The period's first and last farm days, "YYYY-MM-DD". */
  from: string;
  to: string;
  /** What it says where the period holds nothing: "no deaths in this period". */
  none: Said;
  records: { heading: Said; fields: DocumentRow[] }[];
}

/** How many entries a register holds, as its part is headed. */
const entriesSaid = (count: number): Said => ({
  bn: `${formatNumber(count, "bn")}টি এন্ট্রি`,
  en: `${formatNumber(count, "en")} ${count === 1 ? "entry" : "entries"}`,
});

/**
 * Any of the Inspector View's registers on paper: the Farm Identity letterhead, the register's name, the period, then
 * its entries numbered, each headed by what identifies it with its fields beneath. Every one reads the same way,
 * because an inspector reads four of them in a row and should not have to learn four layouts; read in Bangla or
 * English.
 */
export const registerDocument = (facts: RegisterFacts): PaperDocument => {
  const from = daySaid(facts.from);
  const to = daySaid(facts.to);
  return {
    letterhead: letterheadOf(facts.farm),
    title: facts.title,
    preamble: {
      bn: `${from.bn} থেকে ${to.bn} পর্যন্ত।`,
      en: `From ${from.en} to ${to.en}.`,
    },
    sections: [
      {
        kind: "records",
        heading: entriesSaid(facts.records.length),
        records: facts.records,
        note: facts.records.length === 0 ? facts.none : null,
      },
    ],
    closing: [],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};

/** Where a Registration stands, as an inspector reads it first. */
const STANDING: Record<RegistrationStanding, Said> = {
  valid: { bn: "বৈধ", en: "Valid" },
  ending_soon: { bn: "মেয়াদ শেষ হতে চলেছে", en: "Ending soon" },
  expired: { bn: "মেয়াদ শেষ", en: "Expired" },
  unknown: { bn: "মেয়াদ লেখা নেই", en: "No expiry recorded" },
};

/** What the Registration paper prints from: the farm's DLS registration, and its certificate's photograph. */
export interface RegistrationFacts extends Produced {
  farm: FarmIdentity;
  office: string | null;
  /** Farm days, "YYYY-MM-DD"; nothing where none was written down. */
  issuedOn: string | null;
  expiresOn: string | null;
  standing: RegistrationStanding;
  certificateTakenOn: string | null;
}

/**
 * R1, the Registration on paper: the farm's DLS registration as an inspector reads it first — number, office, when it
 * was issued and when it runs out, whether it still stands, and that the certificate has been photographed.
 */
export const registrationPaper = (facts: RegistrationFacts): PaperDocument => ({
  letterhead: letterheadOf(facts.farm),
  title: { bn: "নিবন্ধন", en: "Registration" },
  preamble: {
    bn: "প্রাণিসম্পদ অধিদপ্তরে খামারের নিবন্ধন, যেমন আজ আছে।",
    en: "The farm's registration with the Department of Livestock Services, as it stands today.",
  },
  sections: [
    {
      kind: "facts",
      heading: { bn: "ডিএলএস নিবন্ধন", en: "DLS registration" },
      rows: [
        {
          label: { bn: "নিবন্ধন নম্বর", en: "Registration number" },
          value: facts.farm.registrationNumber ?? NONE,
        },
        {
          label: { bn: "ইস্যুকারী দপ্তর", en: "Issuing office" },
          value: facts.office ?? NONE,
        },
        {
          label: { bn: "ইস্যুর তারিখ", en: "Issued" },
          value: dayOrNone(facts.issuedOn),
        },
        {
          label: { bn: "মেয়াদ শেষ", en: "Expires" },
          value: dayOrNone(facts.expiresOn),
        },
        {
          label: { bn: "অবস্থা", en: "Standing" },
          value: STANDING[facts.standing],
        },
        {
          label: { bn: "সনদের ছবি", en: "Certificate photographed" },
          value: dayOrNone(facts.certificateTakenOn),
        },
      ],
      note: null,
    },
  ],
  closing: [],
  produced: producedSaid(facts.producedAt, facts.producedBy),
});

/** One Side's herd, or one Pen's, as the summary tables it: how many, and how many in each State. */
export interface HerdLine {
  label: Said | string;
  animals: number;
  states: { label: Said; count: number }[];
}

/** What the herd summary prints from: every animal on the farm on the day, by Side and by Pen. */
export interface HerdSummaryFacts extends Produced {
  farm: FarmIdentity;
  /** The farm day it counts, "YYYY-MM-DD". */
  asOf: string;
  total: number;
  bySide: HerdLine[];
  byPen: HerdLine[];
}

/** Each State with its count, in one language at a time. */
const statesSaid = (states: HerdLine["states"]): Said => ({
  bn: states
    .map((one) => `${one.label.bn} ${formatNumber(one.count, "bn")}`)
    .join(" · "),
  en: states
    .map((one) => `${one.label.en} ${formatNumber(one.count, "en")}`)
    .join(" · "),
});

/** The herd one way of counting it: each line, how many, and how many in each State, added up beneath. */
const herdTable = (
  heading: Said,
  first: Said,
  lines: readonly HerdLine[],
  total: number
): PaperDocument["sections"][number] => ({
  kind: "table",
  heading,
  columns: [
    { label: first },
    { label: { bn: "পশু", en: "Animals" }, figures: true },
    { label: { bn: "অবস্থা অনুযায়ী", en: "By state" } },
  ],
  rows: lines.map((line) => [
    line.label,
    countSaid(line.animals),
    statesSaid(line.states),
  ]),
  foot: [TOTAL, countSaid(total), ""],
  note: null,
});

/**
 * R2, the herd summary on paper: every animal on the farm on the day, by Side and State and by Pen — the count an
 * inspector checks against the sheds.
 */
export const herdSummaryPaper = (facts: HerdSummaryFacts): PaperDocument => {
  const day = daySaid(facts.asOf);
  return {
    letterhead: letterheadOf(facts.farm),
    title: { bn: "পশুর সারসংক্ষেপ", en: "Herd summary" },
    preamble: {
      bn: `${day.bn} তারিখে খামারে ${formatNumber(facts.total, "bn")}টি পশু।`,
      en: `${formatNumber(facts.total, "en")} ${facts.total === 1 ? "animal" : "animals"} on the farm on ${day.en}.`,
    },
    sections: [
      herdTable(
        { bn: "বিভাগ ও অবস্থা অনুযায়ী", en: "By side and state" },
        { bn: "বিভাগ", en: "Side" },
        facts.bySide,
        facts.total
      ),
      herdTable(
        { bn: "পেন অনুযায়ী", en: "By pen" },
        { bn: "শেড / পেন", en: "Shed / pen" },
        facts.byPen,
        facts.total
      ),
    ],
    closing: [],
    produced: producedSaid(facts.producedAt, facts.producedBy),
  };
};
