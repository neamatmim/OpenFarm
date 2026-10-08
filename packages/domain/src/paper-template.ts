import type { FarmIdentity } from "./farm";
import type { NomineeRow, PaperNominee } from "./nominees";
import { nomineeRowOf } from "./nominees";
import type { DocumentRow, PaperOrganisation, Said } from "./papers";
import { NO_GUARANTEE_LINES } from "./papers";

/**
 * The farm's wording for the papers an Investor signs or is handed, as data the Owner edits rather than words in the
 * code.
 *
 * A Template is one kind of paper — the Investment Agreement, the Master Agreement and its Venture Schedule, the
 * Amendment, the Portal Consent and the privacy notice «আপনার তথ্য» — and changing its wording publishes its next Version, never rewriting one: an Agreement records the
 * Version it was signed under, so the farm can print years later exactly what a man put his name to. A Version is
 * laid out in parts, each in Bangla with the English beside it where the Owner writes one, and says the facts of the
 * paper through fields in braces — `{investorName}`, `{capital}` — that are filled when it is printed. Which fields a
 * paper may use is fixed by its kind, so a Version cannot ask for a fact the farm does not have for it.
 *
 * What is not the Owner's to word: the letterhead, who the two parties are and what is written of each, the stamp's
 * blanks, and the closing lines that promise no return. Those are the farm's facts and its rule, the same on every
 * paper about an Investor's money.
 */

/** The kinds of paper a Template words. */
export const TEMPLATE_KINDS = [
  "investment_agreement",
  "master_agreement",
  "venture_schedule",
  "agreement_amendment",
  "portal_consent",
  "privacy_notice",
  "nomination",
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Every fact a paper can say, and what the Owner is shown it is called. */
export const TEMPLATE_FIELDS = {
  farmName: { bn: "খামারের নাম", en: "Farm name" },
  farmAddress: { bn: "খামারের ঠিকানা", en: "Farm address" },
  farmRegistration: { bn: "ডিএলএস নিবন্ধন", en: "DLS registration" },
  ownerName: { bn: "মালিকের নাম", en: "Owner's name" },
  investorName: { bn: "বিনিয়োগকারীর নাম", en: "Investor's name" },
  investorAddress: { bn: "বিনিয়োগকারীর ঠিকানা", en: "Investor's address" },
  investorPhone: { bn: "বিনিয়োগকারীর মোবাইল", en: "Investor's phone" },
  investorNid: { bn: "বিনিয়োগকারীর এনআইডি", en: "Investor's NID" },
  /** Who puts their name to the paper: a person themself, or an Organisation's Signatory for it (ADR 0020). */
  signerName: { bn: "যিনি সই করছেন", en: "Who signs" },
  ventureName: { bn: "ভেঞ্চারের নাম", en: "Venture name" },
  units: { bn: "ইউনিট", en: "Units" },
  unitPrice: { bn: "প্রতি ইউনিটের মূল্য", en: "Price per Unit" },
  capital: { bn: "মোট মূলধন", en: "Total capital" },
  investorsPercent: { bn: "বিনিয়োগকারীর ভাগ %", en: "Investor's share %" },
  farmPercent: { bn: "খামারের ভাগ %", en: "Farm's share %" },
  windowStart: { bn: "লক্ষ্য সময় শুরু", en: "Target window starts" },
  windowEnd: { bn: "লক্ষ্য সময় শেষ", en: "Target window ends" },
  windUpDays: { bn: "গুটিয়ে আনার দিন", en: "Wind-up days" },
  arbitrator: { bn: "সালিস", en: "Arbitrator" },
  amendedOn: { bn: "সংশোধনীর তারিখ", en: "Date of the Amendment" },
  reason: { bn: "সংশোধনের কারণ", en: "Reason for the Amendment" },
  farmPhone: { bn: "খামারের ফোন", en: "Farm phone" },
  dataHost: { bn: "সার্ভার চালায় যে প্রতিষ্ঠান", en: "Who runs the server" },
  backupStore: { bn: "ব্যাকআপ রাখে যে প্রতিষ্ঠান", en: "Who keeps the backup" },
  backupCountry: { bn: "ব্যাকআপ যে দেশে", en: "Where the backup is kept" },
  cattlePart: {
    bn: "গরু কেনার অংশ (প্রতি ইউনিট)",
    en: "Cattle Part (per Unit)",
  },
  monthlySum: { bn: "মাসের টাকা (প্রতি ইউনিট)", en: "Monthly Sum (per Unit)" },
  firstSumDue: { bn: "প্রথম মাসের টাকার দিন", en: "First Monthly Sum due" },
  lastSumDue: { bn: "শেষ মাসের টাকার দিন", en: "Last Monthly Sum due" },
  sums: { bn: "কত মাস", en: "How many months" },
  farmUnits: {
    bn: "খামারের নিজের ইউনিট",
    en: "The Farm's own Units",
  },
  ventureUnits: { bn: "ভেঞ্চারের মোট ইউনিট", en: "The Venture's Units" },
} as const satisfies Record<string, Said>;
export type TemplateField = keyof typeof TEMPLATE_FIELDS;

/**
 * The facts of the one line printed for a minor Nominee: whose line it is, and who collects for them. Fields of that
 * line alone — a paper has several minors or none, so no other wording may ask for them.
 */
export const RECEIVER_FIELDS = {
  nomineeName: { bn: "নাবালক নমিনির নাম", en: "The minor Nominee's name" },
  receiverName: { bn: "গ্রহণকারীর নাম", en: "The Receiver's name" },
  receiverRelation: {
    bn: "নমিনির সঙ্গে গ্রহণকারীর সম্পর্ক",
    en: "The Receiver's relation to the Nominee",
  },
} as const satisfies Record<string, Said>;
export type ReceiverField = keyof typeof RECEIVER_FIELDS;

/** Who the farm is, as a paper names it. */
const THE_FARM: readonly TemplateField[] = [
  "farmName",
  "farmAddress",
  "farmRegistration",
  "ownerName",
];
/** Who the Investor is, as a paper names him. */
const THE_INVESTOR: readonly TemplateField[] = [
  "investorName",
  "investorAddress",
  "investorPhone",
  "investorNid",
  "signerName",
];
/** Both parties to a paper. */
const WHO: readonly TemplateField[] = [...THE_FARM, ...THE_INVESTOR];
/** Who keeps the farm's records for it: the server's host, the backup's keeper and its country. */
const THE_KEEPERS: readonly TemplateField[] = [
  "dataHost",
  "backupStore",
  "backupCountry",
];
/** A Venture paid by the month: each Unit's Cattle Part and its Monthly Sums, filled only on such a Venture's papers. */
const PAID_BY_THE_MONTH: readonly TemplateField[] = [
  "cattlePart",
  "monthlySum",
  "firstSumDue",
  "lastSumDue",
  "sums",
];

/** A Venture in which the Farm holds Units with its own money: how many of how many, filled only on its papers. */
const FARM_CAPITAL: readonly TemplateField[] = ["farmUnits", "ventureUnits"];

/** An Investor's part in one Venture. */
const HIS_PART: readonly TemplateField[] = [
  "ventureName",
  "units",
  "unitPrice",
  "capital",
  "investorsPercent",
  "farmPercent",
  "windowStart",
  "windowEnd",
  "windUpDays",
];

/** The facts the farm fills in itself, whoever the paper is for; the rest are the Investor's or the Venture's own. */
export const FARM_FIELDS: readonly TemplateField[] = [
  ...THE_FARM,
  "farmPhone",
  ...THE_KEEPERS,
];

/** Who signs a paper that has no parties part of its own, by its kind's words, and whether the Investor signs first. */
interface Signers {
  farm: Said;
  investor: Said;
  investorFirst: boolean;
}

/** What each kind of paper is allowed, and owed, in one place. */
interface PaperRules {
  /** The facts it may say. */
  fields: readonly TemplateField[];
  /** The parts it must have. */
  required: readonly TemplateSectionKind[];
  /** The parts it may not have. */
  refused: readonly TemplateSectionKind[];
  /** Whether it is about an Investor's money, and so closes on the lines that promise no return. */
  aboutMoney: boolean;
  /** Whether the English beside the Bangla is printed; a paper an Investor is handed in Bangla prints only its
   *  title's. */
  englishPrinted: boolean;
  /** Whether each signature has a date to write beside it. */
  dated: boolean;
  /** Who signs, where the paper has no parties part to name them. */
  signers: Signers | null;
}

/** An Agreement: who signs and where they sign, the terms of the money, both languages on the paper. */
const AN_AGREEMENT = {
  required: ["parties", "signatures"],
  refused: [],
  aboutMoney: true,
  englishPrinted: true,
  dated: false,
  signers: null,
} as const satisfies Omit<PaperRules, "fields">;

/**
 * Each kind of paper's rules. A Master Agreement belongs to no one Venture, so it names none. A Portal Consent names
 * the Investor in its own words, is signed and dated by him first and countersigned by the Owner, and carries no stamp.
 * The notice is read, not signed. Neither of the two is about money, and each is handed to the Investor in Bangla. A
 * মনোনয়নপত্র is the Investor's own paper: signed and dated by him first in front of the Owner, in both languages, with
 * his Nominees in its parties part and no stamp.
 */
const RULES: Record<TemplateKind, PaperRules> = {
  investment_agreement: {
    ...AN_AGREEMENT,
    fields: [
      ...WHO,
      ...HIS_PART,
      ...PAID_BY_THE_MONTH,
      ...FARM_CAPITAL,
      "arbitrator",
    ],
  },
  master_agreement: {
    ...AN_AGREEMENT,
    fields: [...WHO, "windUpDays", "arbitrator"],
  },
  venture_schedule: { ...AN_AGREEMENT, fields: [...WHO, ...HIS_PART] },
  agreement_amendment: {
    ...AN_AGREEMENT,
    fields: [
      ...WHO,
      "ventureName",
      "investorsPercent",
      "farmPercent",
      "windowStart",
      "windowEnd",
      "amendedOn",
      "reason",
    ],
  },
  portal_consent: {
    fields: WHO,
    required: ["signatures"],
    refused: ["stamp"],
    aboutMoney: false,
    englishPrinted: false,
    dated: true,
    signers: {
      investor: { bn: "বিনিয়োগকারী", en: "Investor" },
      farm: {
        bn: "মালিক (সামনে সই হয়েছে)",
        en: "Owner (signed in my presence)",
      },
      investorFirst: true,
    },
  },
  privacy_notice: {
    fields: [
      "farmName",
      "farmAddress",
      "farmPhone",
      "ownerName",
      ...THE_KEEPERS,
    ],
    required: [],
    refused: ["parties", "stamp", "signatures"],
    aboutMoney: false,
    englishPrinted: false,
    dated: false,
    signers: null,
  },
  nomination: {
    fields: WHO,
    required: ["parties", "clauses", "signatures"],
    refused: ["stamp"],
    aboutMoney: false,
    englishPrinted: true,
    dated: true,
    signers: {
      investor: { bn: "বিনিয়োগকারী", en: "Investor" },
      farm: { bn: "সামনে — মালিক", en: "Before — the Owner" },
      investorFirst: true,
    },
  },
};

/** The facts each kind of paper may say. */
export const FIELDS_OF = Object.fromEntries(
  TEMPLATE_KINDS.map((kind) => [kind, RULES[kind].fields])
) as Record<TemplateKind, readonly TemplateField[]>;

/** The parts a kind of paper may have, in the order a part is offered. */
export const partsAllowed = (
  kind: TemplateKind,
  offered: readonly TemplateSectionKind[]
): TemplateSectionKind[] =>
  offered.filter((part) => !RULES[kind].refused.includes(part));

/** Whether a name in braces is a fact a paper can say at all. */
export const isTemplateField = (name: string): name is TemplateField =>
  Object.hasOwn(TEMPLATE_FIELDS, name);

/**
 * When a line of wording is printed at all: on the paper of a Venture paid by the month, and only there; on the paper
 * of a Venture in which the Farm holds Units with its own money, and only there; or on the paper of an Investor who is
 * a person, or of one who is an Organisation (ADR 0020), and only there. A line with no condition is printed on every
 * paper of its kind; a line with several is printed where every one of them holds.
 */
export const PAPER_CONDITIONS = [
  "by_the_month",
  "farm_capital",
  "a_person",
  "an_organisation",
] as const;
export type PaperCondition = (typeof PAPER_CONDITIONS)[number];

/** When a line is printed: one condition, or several that must all hold. */
export type PrintedOnly = PaperCondition | readonly PaperCondition[];

/** Each condition a line is printed on, however its wording keeps them. */
export const conditionsOf = (only: PrintedOnly | undefined) => {
  if (only === undefined) {
    return [];
  }
  return typeof only === "string" ? [only] : only;
};

/** One fact of the paper's own, as the Owner words its line: what it is called, and what it says. */
export interface FactLine {
  label: Said;
  /** In Bangla, the paper's language; fields in braces. */
  value: string;
  /** Printed only where its condition holds — a Venture paid by the month, say. */
  only?: PrintedOnly;
}

/** One clause of a clauses part: its words, and — for a clause printed only on some papers — when it is printed. */
export type Clause = Said & { only?: PrintedOnly };

/**
 * A part of the paper, in the order it is printed. The Owner words each; the farm fills in what is its own. The
 * parties part may carry lines printed under each Investor, beside the nominee the farm writes of him — what he
 * confirms of his nominee; a Version worded before there were any has none.
 */
export type TemplateSection =
  | {
      kind: "parties";
      heading: Said;
      first: Said;
      second: Said;
      nomineeLines?: Said[];
      /** Printed once under an Investor for each minor Nominee, and only for them; its own fields name them. */
      receiverLine?: Said;
      /** Printed under an Investor with no Nominee, in place of the table and the lines. */
      noNomineeLine?: Said;
    }
  | { kind: "facts"; heading: Said; rows: FactLine[]; note: Said | null }
  | { kind: "clauses"; heading: Said; clauses: Clause[] }
  | { kind: "stamp"; heading: Said }
  | { kind: "signatures"; heading: Said; witnesses: number };

export type TemplateSectionKind = TemplateSection["kind"];

/** What one paper is about that decides which of its wording's lines it prints. */
export interface PaperFor {
  paidByTheMonth: boolean;
  /** Whether the Farm holds Units of the Venture with its own money; left out, it does not. */
  farmCapital?: boolean;
  /** Whether the paper is an Organisation's (ADR 0020); left out, it is a person's. */
  organisation?: boolean;
}

/**
 * A Version's wording as one paper prints it: the lines meant only for a Venture paid by the month kept on that
 * Venture's paper and left off every other, so a paper never prints — nor asks for the facts of — terms that are not
 * its own. Everything that fills, checks or repeats a paper's wording reads it through here first.
 */
export const wordingFor = (
  content: TemplateContent,
  paper: PaperFor
): TemplateContent => {
  const holds = (condition: PaperCondition) => {
    switch (condition) {
      case "by_the_month": {
        return paper.paidByTheMonth;
      }
      case "farm_capital": {
        return paper.farmCapital === true;
      }
      case "a_person": {
        return paper.organisation !== true;
      }
      default: {
        return paper.organisation === true;
      }
    }
  };
  const prints = (line: { only?: PrintedOnly }) =>
    conditionsOf(line.only).every(holds);
  return {
    ...content,
    sections: content.sections.map((section) => {
      if (section.kind === "facts") {
        return { ...section, rows: section.rows.filter(prints) };
      }
      if (section.kind === "clauses") {
        return { ...section, clauses: section.clauses.filter(prints) };
      }
      return section;
    }),
  };
};

/** What one Version of a Template says. */
export interface TemplateContent {
  title: Said;
  preamble: Said;
  sections: TemplateSection[];
}

/** How many witnesses a paper may ask for. */
export const MOST_WITNESSES = 4;

/** A field in braces. */
const FIELD = /\{(?<name>[A-Za-z]+)\}/gu;

/** Each field a piece of wording asks for. */
export const fieldsIn = (text: string): string[] =>
  [...text.matchAll(FIELD)].map((found) => found.groups?.name ?? "");

/** Something the Owner has to put right before a Version is published, and where it is. */
export interface TemplateProblem {
  code:
    | "title_missing"
    | "text_missing"
    | "unknown_field"
    | "no_clauses"
    | "part_twice"
    | "part_missing"
    | "part_not_here"
    | "witnesses";
  /** Where: the title, the preamble, or the part by its place in the paper (from 1). */
  at: "title" | "preamble" | number;
  /** The field it asked for, or the kind of part. */
  about?: string;
}

/** Every piece of wording a part holds, Bangla and English. */
const wordingOf = (section: TemplateSection): Said[] => {
  switch (section.kind) {
    case "parties": {
      return [
        section.heading,
        section.first,
        section.second,
        ...(section.nomineeLines ?? []),
        ...(section.noNomineeLine ? [section.noNomineeLine] : []),
      ];
    }
    case "facts": {
      return [
        section.heading,
        ...section.rows.flatMap((row) => [
          row.label,
          { bn: row.value, en: "" },
        ]),
        ...(section.note ? [section.note] : []),
      ];
    }
    case "clauses": {
      return [section.heading, ...section.clauses];
    }
    default: {
      return [section.heading];
    }
  }
};

/** The parts a paper has at most one of. */
const ONCE: readonly TemplateSectionKind[] = ["parties", "stamp", "signatures"];

const fieldProblems = (
  kind: TemplateKind,
  said: Said,
  at: TemplateProblem["at"],
  alsoAllowed: readonly string[] = []
): TemplateProblem[] => {
  const allowed = new Set<string>([...FIELDS_OF[kind], ...alsoAllowed]);
  return [...fieldsIn(said.bn), ...fieldsIn(said.en)]
    .filter((name) => !allowed.has(name))
    .map((name) => ({ code: "unknown_field", at, about: name }));
};

const sectionProblems = (
  kind: TemplateKind,
  section: TemplateSection,
  at: number
): TemplateProblem[] => {
  const problems: TemplateProblem[] = wordingOf(section).flatMap((said) => [
    ...(said.bn.trim() === "" ? [{ code: "text_missing" as const, at }] : []),
    ...fieldProblems(kind, said, at),
  ]);
  if (section.kind === "parties" && section.receiverLine) {
    const line = section.receiverLine;
    if (line.bn.trim() === "") {
      problems.push({ code: "text_missing", at });
    }
    problems.push(
      ...fieldProblems(kind, line, at, Object.keys(RECEIVER_FIELDS))
    );
  }
  if (section.kind === "clauses" && section.clauses.length === 0) {
    problems.push({ code: "no_clauses", at });
  }
  if (
    section.kind === "signatures" &&
    !(
      Number.isInteger(section.witnesses) &&
      section.witnesses >= 0 &&
      section.witnesses <= MOST_WITNESSES
    )
  ) {
    problems.push({ code: "witnesses", at });
  }
  return problems;
};

/**
 * What stops a Version being published: wording left empty in Bangla, a field this kind of paper does not have, a
 * part the paper needs missing or given twice. English left empty is not a problem — the Bangla is the paper.
 */
export const templateProblems = (
  kind: TemplateKind,
  content: TemplateContent
): TemplateProblem[] => {
  const problems: TemplateProblem[] = [];
  if (content.title.bn.trim() === "") {
    problems.push({ code: "title_missing", at: "title" });
  }
  problems.push(
    ...fieldProblems(kind, content.title, "title"),
    ...fieldProblems(kind, content.preamble, "preamble")
  );
  for (const [index, section] of content.sections.entries()) {
    problems.push(...sectionProblems(kind, section, index + 1));
  }
  for (const part of ONCE) {
    const places = content.sections
      .map((section, index) => (section.kind === part ? index + 1 : null))
      .filter((place) => place !== null);
    if (places.length > 1) {
      problems.push({ code: "part_twice", at: places[1] ?? 1, about: part });
    }
  }
  for (const [index, section] of content.sections.entries()) {
    if (RULES[kind].refused.includes(section.kind)) {
      problems.push({
        code: "part_not_here",
        at: index + 1,
        about: section.kind,
      });
    }
  }
  for (const part of RULES[kind].required) {
    if (!content.sections.some((section) => section.kind === part)) {
      problems.push({ code: "part_missing", at: "title", about: part });
    }
  }
  return problems;
};

/** What each field says on this paper, in both languages, already formatted. */
export type FieldValues = Partial<Record<TemplateField, Said>>;

/** Fills the fields of one piece of wording in one language; a field with nothing to say is left blank to write in. */
const fillIn = (
  text: string,
  values: FieldValues,
  language: keyof Said
): string =>
  text.replace(FIELD, (_match, name: string) => {
    const value = isTemplateField(name) ? values[name]?.[language] : undefined;
    return value?.trim() ? value : "____________";
  });

const filled = (said: Said, values: FieldValues): Said => ({
  bn: fillIn(said.bn, values, "bn"),
  en: said.en.trim() ? fillIn(said.en, values, "en") : "",
});

/** An Investor as a paper writes him down. */
export interface PaperInvestor {
  name: string;
  /** The mobile on the record: an Organisation's Signatory's. */
  phone: string;
  address: string | null;
  nid: string | null;
  /** An Organisation's papers and Signatory; null or left out for a person. */
  organisation?: PaperOrganisation | null;
  /** The Nominees the paper names: the list being signed, on a paper to sign that names its own; the list in force,
   *  on every other. */
  nominees: PaperNominee[];
}

/**
 * What the farm knows of the parties: the Owner signing for the Farm, and the Investor — or, on an Amendment, every
 * Investor on the Venture, since it is one paper they all sign.
 */
export interface PaperParties {
  farm: FarmIdentity;
  ownerName: string;
  investors: readonly [PaperInvestor, ...PaperInvestor[]];
}

/** A part of the paper as printed: the Owner's wording with the farm's facts in it. */
export type PaperSection =
  | {
      kind: "parties";
      heading: Said;
      /** Each party: its role, what the farm writes of it, an Investor's Nominees as a table (none under the Farm),
       *  and the lines printed under it — an Investor's nominee lines. The table is the farm's facts, printed on
       *  every Version; the lines are the wording's. */
      parties: {
        role: Said;
        rows: DocumentRow[];
        nominees: NomineeRow[];
        lines: Said[];
      }[];
    }
  | { kind: "facts"; heading: Said; rows: DocumentRow[]; note: Said | null }
  | { kind: "clauses"; heading: Said; clauses: Said[] }
  | {
      kind: "stamp";
      heading: Said;
      blanks: Said[];
      /** What each blank says on a paper already stamped — a copy of a signed Agreement — in the blanks' order. */
      filled?: string[];
    }
  | {
      kind: "signatures";
      heading: Said;
      signers: { role: Said; name: string }[];
      /** What each signer writes beside their signature besides it: the day, where the paper asks for one. */
      dateBlank: Said | null;
      witnesses: Said[];
      /** What each witness writes: a name, and a signature. */
      witnessBlanks: Said[];
    };

/** A paper laid out to print: the letterhead, its title and opening, its parts in order, and the closing lines. */
export interface PaperDocument {
  letterhead: { name: string; details: string[] };
  title: Said;
  preamble: Said;
  sections: PaperSection[];
  /** What a paper about an Investor's money ends on: no return is promised. Nothing on the others. */
  closing: readonly string[];
  produced: string;
  /** On a copy of a paper already signed: that it is a copy and not the original, and which signed paper it copies —
   *  printed on it so a copy can never be mistaken for, or signed again as, a second original. */
  copyOf?: string;
}

const row = (bn: string, en: string, value: string | null | undefined) =>
  value?.trim() ? { label: { bn, en }, value } : null;

const rows = (...all: (DocumentRow | null)[]): DocumentRow[] =>
  all.filter((one) => one !== null);

/** Who the Farm is, as every paper with a parties part writes the first party — the farm's facts, not the Owner's
 *  wording. */
const farmRows = (parties: PaperParties): DocumentRow[] =>
  rows(
    row("নাম", "Name", parties.ownerName),
    row("খামার", "Farm", parties.farm.name),
    row("ঠিকানা", "Address", parties.farm.address),
    row("ডিএলএস নিবন্ধন", "DLS registration", parties.farm.registrationNumber)
  );

/**
 * Who an Investor is, as every paper writes him — or an Organisation, with its own papers, and under them the Signatory
 * who signs for it. An Organisation's name is its "Name" row and its Signatory's mobile its "Phone" row, so a paper
 * read in the portal still finds its reader by the two.
 */
const investorRows = (him: PaperInvestor): DocumentRow[] => {
  const { organisation } = him;
  if (!organisation) {
    return rows(
      row("নাম", "Name", him.name),
      row("ঠিকানা", "Address", him.address),
      row("মোবাইল", "Phone", him.phone),
      row("জাতীয় পরিচয়পত্র", "NID", him.nid)
    );
  }
  const { signatory } = organisation;
  return rows(
    row("প্রতিষ্ঠান", "Name", him.name),
    row("ঠিকানা", "Address", him.address),
    row("ট্রেড লাইসেন্স", "Trade licence", organisation.tradeLicence),
    row("আরজেএসসি নিবন্ধন", "RJSC registration", organisation.rjscNumber),
    row("টিআইএন", "TIN", organisation.tin),
    row("পক্ষে স্বাক্ষরকারী", "Signatory", signatory.name),
    row("পদবি", "Role", signatory.role),
    row("মোবাইল", "Phone", him.phone),
    row("স্বাক্ষরকারীর জাতীয় পরিচয়পত্র", "Signatory's NID", signatory.nid),
    row(
      "ক্ষমতা অর্পণ",
      "Authority",
      organisation.authorityOn
        ? `${organisation.authority} · ${organisation.authorityOn}`
        : organisation.authority
    )
  );
};

/** What a party's row of this label says, where it has one. */
const valueOf = (rowsOf: readonly DocumentRow[], en: string) =>
  rowsOf.find((one) => one.label.en === en)?.value;

/**
 * A paper as one Investor reads it in the portal: every party named, but another Investor by name alone — their
 * phone, address, NID and Nominees are theirs, not this reader's (the Owner's decision, 2026-10-06). The Farm and the
 * reader stand as the paper kept them. The paper kept, and printed for signing, is never changed by it.
 */
export const othersNamedOnly = (
  paper: PaperDocument,
  reader: { name: string; phone: string }
): PaperDocument => ({
  ...paper,
  sections: paper.sections.map((section) =>
    section.kind === "parties"
      ? {
          ...section,
          parties: section.parties.map((party, index) => {
            const theReader =
              valueOf(party.rows, "Name") === reader.name &&
              valueOf(party.rows, "Phone") === reader.phone;
            return index === 0 || theReader
              ? party
              : {
                  ...party,
                  rows: party.rows.filter((one) => one.label.en === "Name"),
                  nominees: [],
                  lines: [],
                };
          }),
        }
      : section
  ),
});

/** The blanks of the stamp box: the farm records all three when the paper comes back stamped. */
const STAMP_BLANKS: Said[] = [
  { bn: "সিরিয়াল / চালান নম্বর", en: "Serial / challan no." },
  { bn: "মূল্য", en: "Value" },
  { bn: "তারিখ", en: "Date" },
];

const WITNESS_BLANKS: Said[] = [
  { bn: "নাম", en: "Name" },
  { bn: "স্বাক্ষর", en: "Signature" },
];

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const inBangla = (number: number) =>
  String(number).replaceAll(/\d/gu, (digit) =>
    BANGLA_DIGITS.charAt(Number(digit))
  );

/** A party's role up to its dash: "প্রথম পক্ষ — মুদারিব" signs as প্রথম পক্ষ. */
const before = (said: Said): Said => ({
  bn: said.bn.split(" — ")[0] ?? said.bn,
  en: said.en.split(" — ")[0] ?? said.en,
});

/**
 * Who signs, by the words the paper gives the two parties — the whole role, or its first part before a dash. A paper
 * with no parties part of its own signs by its kind's words, or as the first and the second party.
 */
const signersOf = (kind: TemplateKind, content: TemplateContent): Signers => {
  // A paper that is the Investor's own names its signers itself, parties part or none.
  const own = RULES[kind].signers;
  if (own) {
    return own;
  }
  const parties = content.sections.find(
    (section) => section.kind === "parties"
  );
  if (parties?.kind === "parties") {
    return {
      farm: before(parties.first),
      investor: before(parties.second),
      investorFirst: false,
    };
  }
  return {
    farm: { bn: "প্রথম পক্ষ", en: "First party" },
    investor: { bn: "দ্বিতীয় পক্ষ", en: "Second party" },
    investorFirst: false,
  };
};

/** The signature line of one Investor: their own, or an Organisation's, signed by its Signatory for and on its behalf. */
const investorSigns = (role: Said, him: PaperInvestor) => {
  const signatory = him.organisation?.signatory;
  if (!signatory) {
    return { role, name: him.name };
  }
  return {
    role: {
      bn: `${role.bn} — ${him.name}-এর পক্ষে`,
      en: role.en ? `${role.en} — for and on behalf of ${him.name}` : "",
    },
    name: signatory.role
      ? `${signatory.name}, ${signatory.role}`
      : signatory.name,
  };
};

/** The signature lines in the order they are signed: the Farm first, unless the paper is the Investor's to give. */
const signingOrder = (signers: Signers, parties: PaperParties) => {
  const farm = { role: signers.farm, name: parties.ownerName };
  const investors = parties.investors.map((him) =>
    investorSigns(signers.investor, him)
  );
  return signers.investorFirst ? [...investors, farm] : [farm, ...investors];
};

/** A piece of wording with its English left off: a paper an Investor is handed in Bangla. */
const banglaOnly = (said: Said): Said => ({ bn: said.bn, en: "" });

/** A laid-out part with every English line left off. */
const inBanglaOnly = (section: PaperSection): PaperSection => {
  switch (section.kind) {
    case "parties": {
      return {
        ...section,
        heading: banglaOnly(section.heading),
        parties: section.parties.map((party) => ({
          role: banglaOnly(party.role),
          rows: party.rows.map((one) => ({
            ...one,
            label: banglaOnly(one.label),
          })),
          nominees: party.nominees,
          lines: party.lines.map(banglaOnly),
        })),
      };
    }
    case "facts": {
      return {
        ...section,
        heading: banglaOnly(section.heading),
        rows: section.rows.map((one) => ({
          ...one,
          label: banglaOnly(one.label),
        })),
        note: section.note ? banglaOnly(section.note) : null,
      };
    }
    case "clauses": {
      return {
        ...section,
        heading: banglaOnly(section.heading),
        clauses: section.clauses.map(banglaOnly),
      };
    }
    case "stamp": {
      return {
        ...section,
        heading: banglaOnly(section.heading),
        blanks: section.blanks.map(banglaOnly),
      };
    }
    default: {
      return {
        ...section,
        heading: banglaOnly(section.heading),
        signers: section.signers.map((one) => ({
          ...one,
          role: banglaOnly(one.role),
        })),
        dateBlank: section.dateBlank ? banglaOnly(section.dateBlank) : null,
        witnesses: section.witnesses.map(banglaOnly),
        witnessBlanks: section.witnessBlanks.map(banglaOnly),
      };
    }
  }
};

/** The one line for a minor Nominee, filled with whose it is and who collects for them. */
const receiverLineFor = (line: Said, minor: PaperNominee): Said => {
  const local: Record<ReceiverField, string> = {
    nomineeName: minor.name,
    receiverName: minor.receiver?.name ?? "____________",
    receiverRelation: minor.receiver?.relation?.trim() || "____________",
  };
  const fill = (text: string) =>
    text.replace(FIELD, (match, name: string) =>
      Object.hasOwn(local, name) ? local[name as ReceiverField] : match
    );
  return { bn: fill(line.bn), en: fill(line.en) };
};

/**
 * What prints under one Investor: with no Nominee, the Version's line saying so, where it has one; otherwise the lines
 * every Investor's Nominees print under, then a line for each minor Nominee's Receiver to sign. A Version worded before
 * there were Receivers prints its lines as it always did.
 */
const linesUnder = (
  section: Extract<TemplateSection, { kind: "parties" }>,
  him: PaperInvestor,
  values: FieldValues
): Said[] => {
  const noNominees = him.nominees.length === 0;
  if (noNominees && section.noNomineeLine) {
    return [filled(section.noNomineeLine, values)];
  }
  const lines = (section.nomineeLines ?? []).map((line) =>
    filled(line, values)
  );
  const { receiverLine } = section;
  if (!receiverLine) {
    return lines;
  }
  const minors = him.nominees.filter((one) => one.minor);
  return [
    ...lines,
    ...minors.map((one) => filled(receiverLineFor(receiverLine, one), values)),
  ];
};

const laidOut = (
  section: TemplateSection,
  values: FieldValues,
  parties: PaperParties,
  signers: Signers,
  dated: boolean
): PaperSection => {
  switch (section.kind) {
    case "parties": {
      const second = filled(section.second, values);
      return {
        kind: "parties",
        heading: filled(section.heading, values),
        parties: [
          {
            role: filled(section.first, values),
            rows: farmRows(parties),
            nominees: [],
            lines: [],
          },
          ...parties.investors.map((him) => ({
            role: second,
            rows: investorRows(him),
            // An Organisation names no Nominee, and its share is its own: nothing about Nominees is printed under it.
            nominees: him.organisation ? [] : him.nominees.map(nomineeRowOf),
            lines: him.organisation ? [] : linesUnder(section, him, values),
          })),
        ],
      };
    }
    case "facts": {
      return {
        kind: "facts",
        heading: filled(section.heading, values),
        rows: section.rows.map((line) => ({
          label: line.label,
          value: fillIn(line.value, values, "bn"),
        })),
        note: section.note ? filled(section.note, values) : null,
      };
    }
    case "clauses": {
      return {
        kind: "clauses",
        heading: filled(section.heading, values),
        clauses: section.clauses.map((clause) => filled(clause, values)),
      };
    }
    case "stamp": {
      return {
        kind: "stamp",
        heading: filled(section.heading, values),
        blanks: STAMP_BLANKS,
      };
    }
    default: {
      return {
        kind: "signatures",
        heading: filled(section.heading, values),
        signers: signingOrder(signers, parties),
        dateBlank: dated ? { bn: "তারিখ", en: "Date" } : null,
        witnesses: Array.from({ length: section.witnesses }, (_, index) => ({
          bn: `সাক্ষী ${inBangla(index + 1)}`,
          en: `Witness ${index + 1}`,
        })),
        witnessBlanks: WITNESS_BLANKS,
      };
    }
  }
};

/**
 * The **Farm Identity** at the head of every paper the farm hands an Investor: its name, and beneath it the address,
 * the phone and the DLS registration it has written down.
 */
export const letterheadOf = (
  farm: FarmIdentity
): PaperDocument["letterhead"] => ({
  name: farm.name,
  details: [
    farm.address?.trim() ?? null,
    farm.phone?.trim() ? `মোবাইল / Phone: ${farm.phone}` : null,
    farm.registrationNumber?.trim()
      ? `ডিএলএস নিবন্ধন / DLS registration: ${farm.registrationNumber}`
      : null,
  ].filter((line): line is string => Boolean(line)),
});

/**
 * A Version's wording with the lines for a kind of Investor the paper does not name left off: a person's paper prints no
 * line meant only for an Organisation, and an Organisation's none meant only for a person. A paper naming both — an
 * Amendment on a Venture with both — keeps both. Every other condition was the caller's to decide, and stands.
 */
const kindsOnThePaper = (
  content: TemplateContent,
  parties: PaperParties
): TemplateContent => {
  const named = new Set(
    parties.investors.map((him) =>
      him.organisation ? "an_organisation" : "a_person"
    )
  );
  const prints = (line: { only?: PrintedOnly }) =>
    conditionsOf(line.only).every(
      (condition) =>
        !(condition === "a_person" || condition === "an_organisation") ||
        named.has(condition)
    );
  return {
    ...content,
    sections: content.sections.map((section) => {
      if (section.kind === "facts") {
        return { ...section, rows: section.rows.filter(prints) };
      }
      if (section.kind === "clauses") {
        return { ...section, clauses: section.clauses.filter(prints) };
      }
      return section;
    }),
  };
};

/**
 * One paper, laid out to print from a Version's wording and the farm's facts: every field filled in its own language,
 * the parties written from what the farm holds, and — on a paper about an Investor's money — the lines that promise no
 * return at the foot. A paper handed to an Investor in Bangla prints its title's English and no other. `version` is
 * the Version's number, written in the foot so a paper kept on file says which wording it was.
 */
export const paperFrom = (
  content: TemplateContent,
  {
    kind,
    parties,
    values,
    producedBy,
    producedAt,
    version,
  }: {
    kind: TemplateKind;
    parties: PaperParties;
    values: FieldValues;
    producedBy: string;
    producedAt: string;
    version?: number;
  }
): PaperDocument => {
  const rules = RULES[kind];
  const forThem = kindsOnThePaper(content, parties);
  const signers = signersOf(kind, forThem);
  const { farm } = parties;
  const sections = forThem.sections.map((section) =>
    laidOut(section, values, parties, signers, rules.dated)
  );
  const preamble = filled(forThem.preamble, values);
  const wording =
    version === undefined
      ? ""
      : ` · সংস্করণ ${inBangla(version)} / Version ${version}`;
  return {
    letterhead: letterheadOf(farm),
    title: filled(forThem.title, values),
    preamble: rules.englishPrinted ? preamble : banglaOnly(preamble),
    sections: rules.englishPrinted ? sections : sections.map(inBanglaOnly),
    closing: rules.aboutMoney ? NO_GUARANTEE_LINES : [],
    produced: `${producedAt} · ${producedBy}${wording}`,
  };
};

/**
 * The terms of a paper in Bangla, numbered, as a letter repeats them: every clause of every clauses part, filled from
 * the facts in force — the first part's straight after one another, and each later part under its own heading,
 * numbered afresh as the paper numbers it. The joining letter reads its terms from the Version its Agreement was
 * signed under, so the letter and the deed cannot say different things.
 */
export const termsOf = (
  content: TemplateContent,
  values: FieldValues
): string[] =>
  content.sections
    .filter((section) => section.kind === "clauses")
    .flatMap((section, place) => [
      ...(place === 0 ? [] : [fillIn(section.heading.bn, values, "bn")]),
      ...section.clauses.map(
        (clause, index) =>
          `${inBangla(index + 1)}. ${fillIn(clause.bn, values, "bn")}`
      ),
    ]);

/**
 * The facts a Version's wording asks for that nobody has filled, each once, in the order they first appear — among
 * the facts given, or all of them: what the Owner is told is missing before the paper is printed or shown, rather
 * than handing somebody a blank.
 */
export const factsMissing = (
  content: TemplateContent,
  values: FieldValues,
  among: readonly TemplateField[] = Object.keys(TEMPLATE_FIELDS).filter(
    isTemplateField
  )
): TemplateField[] => {
  const asked = [
    content.title,
    content.preamble,
    ...content.sections.flatMap(wordingOf),
  ].flatMap((said) => [...fieldsIn(said.bn), ...fieldsIn(said.en)]);
  const counted = new Set<string>(among);
  return [...new Set(asked)]
    .filter(isTemplateField)
    .filter((name) => counted.has(name) && !values[name]?.bn.trim());
};

/** One part of a notice as a page reads it: its heading, and what it says line by line. */
export interface ReadPart {
  heading: string;
  lines: string[];
}

/**
 * A notice's wording read as a page rather than printed: its title, its opening and each part, in Bangla, with the
 * facts filled in — a clauses part line by line, a facts part as each label and what it says. Nothing of parties,
 * stamps or signatures: a page is read, not signed.
 */
export const readingOf = (
  content: TemplateContent,
  values: FieldValues
): { title: string; preamble: string; parts: ReadPart[] } => ({
  title: fillIn(content.title.bn, values, "bn"),
  preamble: fillIn(content.preamble.bn, values, "bn"),
  parts: content.sections.flatMap((section): ReadPart[] => {
    if (section.kind === "clauses") {
      return [
        {
          heading: fillIn(section.heading.bn, values, "bn"),
          lines: section.clauses.map((clause) =>
            fillIn(clause.bn, values, "bn")
          ),
        },
      ];
    }
    if (section.kind === "facts") {
      return [
        {
          heading: fillIn(section.heading.bn, values, "bn"),
          lines: section.rows.map(
            (one) => `${one.label.bn}: ${fillIn(one.value, values, "bn")}`
          ),
        },
      ];
    }
    return [];
  }),
});

/** Every field shown by its own name in square brackets: a Version previewed before any paper is filled from it. */
export const namedFields = (kind: TemplateKind): FieldValues =>
  Object.fromEntries(
    FIELDS_OF[kind].map((name) => [
      name,
      {
        bn: `[${TEMPLATE_FIELDS[name].bn}]`,
        en: `[${TEMPLATE_FIELDS[name].en}]`,
      },
    ])
  );
