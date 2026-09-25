import type { FarmIdentity } from "./farm";
import type { DocumentRow, Said } from "./papers";
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
} as const satisfies Record<string, Said>;
export type TemplateField = keyof typeof TEMPLATE_FIELDS;

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
];
/** Both parties to a paper. */
const WHO: readonly TemplateField[] = [...THE_FARM, ...THE_INVESTOR];
/** Who keeps the farm's records for it: the server's host, the backup's keeper and its country. */
const THE_KEEPERS: readonly TemplateField[] = [
  "dataHost",
  "backupStore",
  "backupCountry",
];
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
 * The notice is read, not signed. Neither of the two is about money, and each is handed to the Investor in Bangla.
 */
const RULES: Record<TemplateKind, PaperRules> = {
  investment_agreement: {
    ...AN_AGREEMENT,
    fields: [...WHO, ...HIS_PART, "arbitrator"],
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

/** One fact of the paper's own, as the Owner words its line: what it is called, and what it says. */
export interface FactLine {
  label: Said;
  /** In Bangla, the paper's language; fields in braces. */
  value: string;
}

/** A part of the paper, in the order it is printed. The Owner words each; the farm fills in what is its own. */
export type TemplateSection =
  | { kind: "parties"; heading: Said; first: Said; second: Said }
  | { kind: "facts"; heading: Said; rows: FactLine[]; note: Said | null }
  | { kind: "clauses"; heading: Said; clauses: Said[] }
  | { kind: "stamp"; heading: Said }
  | { kind: "signatures"; heading: Said; witnesses: number };

export type TemplateSectionKind = TemplateSection["kind"];

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
      return [section.heading, section.first, section.second];
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
  at: TemplateProblem["at"]
): TemplateProblem[] => {
  const allowed = new Set<string>(FIELDS_OF[kind]);
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
  phone: string;
  address: string | null;
  nid: string | null;
  nominee: {
    name: string;
    phone: string | null;
    relation: string | null;
  } | null;
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
      parties: { role: Said; rows: DocumentRow[] }[];
    }
  | { kind: "facts"; heading: Said; rows: DocumentRow[]; note: Said | null }
  | { kind: "clauses"; heading: Said; clauses: Said[] }
  | { kind: "stamp"; heading: Said; blanks: Said[] }
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
}

const row = (bn: string, en: string, value: string | null | undefined) =>
  value?.trim() ? { label: { bn, en }, value } : null;

const rows = (...all: (DocumentRow | null)[]): DocumentRow[] =>
  all.filter((one) => one !== null);

const nomineeLine = (nominee: PaperInvestor["nominee"]) =>
  nominee
    ? [
        nominee.name,
        nominee.relation?.trim() || null,
        nominee.phone?.trim() || null,
      ]
        .filter((part) => part !== null)
        .join(" · ")
    : null;

/** Who the Farm is, as every paper with a parties part writes the first party — the farm's facts, not the Owner's
 *  wording. */
const farmRows = (parties: PaperParties): DocumentRow[] =>
  rows(
    row("নাম", "Name", parties.ownerName),
    row("খামার", "Farm", parties.farm.name),
    row("ঠিকানা", "Address", parties.farm.address),
    row("ডিএলএস নিবন্ধন", "DLS registration", parties.farm.registrationNumber)
  );

/** Who an Investor is, as every paper writes him. */
const investorRows = (him: PaperInvestor): DocumentRow[] =>
  rows(
    row("নাম", "Name", him.name),
    row("ঠিকানা", "Address", him.address),
    row("মোবাইল", "Phone", him.phone),
    row("জাতীয় পরিচয়পত্র", "NID", him.nid),
    row("নমিনি", "Nominee", nomineeLine(him.nominee))
  );

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
  return (
    RULES[kind].signers ?? {
      farm: { bn: "প্রথম পক্ষ", en: "First party" },
      investor: { bn: "দ্বিতীয় পক্ষ", en: "Second party" },
      investorFirst: false,
    }
  );
};

/** The signature lines in the order they are signed: the Farm first, unless the paper is the Investor's to give. */
const signingOrder = (signers: Signers, parties: PaperParties) => {
  const farm = { role: signers.farm, name: parties.ownerName };
  const investors = parties.investors.map((him) => ({
    role: signers.investor,
    name: him.name,
  }));
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
          { role: filled(section.first, values), rows: farmRows(parties) },
          ...parties.investors.map((him) => ({
            role: second,
            rows: investorRows(him),
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
  const signers = signersOf(kind, content);
  const { farm } = parties;
  const sections = content.sections.map((section) =>
    laidOut(section, values, parties, signers, rules.dated)
  );
  const preamble = filled(content.preamble, values);
  const wording =
    version === undefined
      ? ""
      : ` · সংস্করণ ${inBangla(version)} / Version ${version}`;
  return {
    letterhead: letterheadOf(farm),
    title: filled(content.title, values),
    preamble: rules.englishPrinted ? preamble : banglaOnly(preamble),
    sections: rules.englishPrinted ? sections : sections.map(inBanglaOnly),
    closing: rules.aboutMoney ? NO_GUARANTEE_LINES : [],
    produced: `${producedAt} · ${producedBy}${wording}`,
  };
};

/**
 * The terms of a paper in Bangla, numbered, as a letter repeats them: every clause of every clauses part, filled from
 * the facts in force. The joining letter reads its terms from the Version its Agreement was signed under, so the
 * letter and the deed cannot say different things.
 */
export const termsOf = (
  content: TemplateContent,
  values: FieldValues
): string[] =>
  content.sections
    .flatMap((section) => (section.kind === "clauses" ? section.clauses : []))
    .map(
      (clause, index) =>
        `${inBangla(index + 1)}. ${fillIn(clause.bn, values, "bn")}`
    );

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
