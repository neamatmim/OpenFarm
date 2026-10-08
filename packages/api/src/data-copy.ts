import { and, desc, eq, inArray, or, sql } from "@OpenFarm/db/operators";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { user } from "@OpenFarm/db/schema/auth";
import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import type { investor } from "@OpenFarm/db/schema/venture";
import { portalConsent } from "@OpenFarm/db/schema/venture";
import type {
  DocumentRow,
  PaperDocument,
  PaperSection,
  Said,
  Worded,
} from "@OpenFarm/domain";
import {
  farmDayOf,
  inLanguage,
  letterheadOf,
  nomineeRowOf,
  phoneOfInvestorLogin,
} from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import {
  currencySign,
  currencyWords,
  formatDate,
  formatNumber,
  translate,
} from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { ExportedPaper } from "./export-store";
import { assertRegistered, exportedPaper } from "./export-store";
import { signedInOn } from "./membership";
import type { NominationHow } from "./nomination-store";
import { nominationsOf, paperNominees } from "./nomination-store";
import { producedAt } from "./paper-values";
import type { Owned } from "./portal-invitable";
import { refused } from "./portal-invitable";
import { theNoticeToRead } from "./portal-reads";
import { theirRequests, whatTheyDidToTheirRequests } from "./requests-to-join";
import type { SigningChannel } from "./signing-code";
import { theirAgreements } from "./their-agreements";

// The Data Copy, «খামারে আপনার তথ্য» (the glossary's entry): everything the farm holds on one Investor, which answers
// their written request for a copy (Personal Data Protection Act 2026 s.11) in minutes. The privacy notice's points
// come first, then the record as the farm keeps it — unmasked, since it is theirs — their Agreements and the money
// they moved, the papers made for them, their Requests to Join, their portal access, consents and sign-ins, and every
// change to their record, their access and their consent. Made by the Owner from the Investor's page and handed over
// on paper; never offered in the portal. Everything is listed the latest first, as their money is. Read in Bangla or in
// English (ADR 0021): every line the farm words is said in both, each with its own numerals, days and money, and only
// what somebody typed — a name, an address, a Venture's name, a note — reads as it was typed in either.

/** The paper's title. */
const TITLE: Said = {
  bn: "খামারে আপনার তথ্য",
  en: "What the farm holds about you",
};

/** Words said in both languages, each written by its own reader's numerals, days and words. */
const each = (say: (language: Language) => string): Said => ({
  bn: say("bn"),
  en: say("en"),
});

/** What somebody typed — a name, a Venture's name — read as it was typed in either language. */
const asTyped = (text: string): Said => ({ bn: text, en: text });

/** A moment on the farm's clock, as the paper in `language` writes it. */
const when = (at: Date, language: Language) =>
  formatDate(at, language, "dateTime");

/** A moment on the farm's clock, said in both languages. */
const momentSaid = (at: Date): Said => each((language) => when(at, language));

/** A farm day, as the paper in `language` writes it. */
const onDay = (day: string, language: Language) =>
  formatDate(new Date(`${day}T00:00:00Z`), language);

/** Money, in the language's own numerals. */
const asMoney = (amount: number, language: Language) =>
  `${currencySign()}${formatNumber(amount, language)}`;

/** A figure, in the language's own numerals. */
const figure = (value: number, language: Language) =>
  formatNumber(value, language);

/** A message in both languages, for a label. */
const both = (key: MessageKey): Said =>
  each((language) => translate(language, key));

/** The lines of the paper saying one fact: one line, or none where the farm holds nothing for it. */
const linesFor = (
  label: Said,
  value: Worded | null | undefined
): DocumentRow[] =>
  value && inLanguage(value, "bn").trim() ? [{ label, value }] : [];

/** What a part of the paper says where the farm holds nothing for it. */
const NONE: Said = { bn: "কিছু নেই", en: "None" };

/** A part of the paper that is facts, one to a line, saying so where there are none. */
const facts = (heading: Said, rows: DocumentRow[]): PaperSection => ({
  kind: "facts",
  heading,
  rows,
  note: rows.length === 0 ? NONE : null,
});

/** Several things said on one line: those the farm has, one after another. */
const joined = (...values: (string | null | undefined)[]) =>
  values.filter((one) => one?.trim()).join(" · ");

/**
 * The paper's own words around the farm's figures, in Bangla: each takes its days, moments and money already written
 * in Bangla, and a count of Units as a number.
 */
const BANGLA = {
  preamble: (name: string, day: string) =>
    `${name}, ${day} পর্যন্ত খামার আপনার সম্পর্কে যা রাখে তার সবকিছু। প্রথমে আছে খামার তা কেন ও কীভাবে রাখে।`,
  inForce: "এখন বহাল",
  noNominees: "কোনো নমিনি নেই",
  born: (day: string) => `জন্ম ${day}`,
  nid: (number: string) => `এনআইডি ${number}`,
  birthRegistration: (number: string) => `জন্ম নিবন্ধন ${number}`,
  share: (percent: string) => `অংশ ${percent}`,
  receiver: (who: string) => `গ্রহণকারী ${who}`,
  units: (count: number) => `${figure(count, "bn")} ইউনিট`,
  yourShare: (percent: number) => `আপনার অংশ ${figure(percent, "bn")}%`,
  window: (from: string, to: string) => `সময় ${from} – ${to}`,
  amended: (day: string) => `সংশোধিত ${day}`,
  signed: (at: string) => `সই ${at}`,
  stamp: (serial: string, money: string, day: string) =>
    `স্ট্যাম্প ${serial} (${money}, ${day})`,
  arbitrator: (name: string) => `সালিস ${name}`,
  photoKept: "সই করা চুক্তির ছবি খামারে রাখা আছে",
  capitalHeld: (money: string) => `খামারে মূলধন ${money}`,
  owed: (payout: string, capital: string, share: string) =>
    `হিসাব নিকাশে পাওনা ${payout} (মূলধন ${capital}, মুনাফায় অংশ ${share})`,
  paid: (day: string) => `পরিশোধ ${day}`,
  notPaid: "এখনো পরিশোধ হয়নি",
  acknowledged: (at: string) => `আপনি বুঝে পেয়েছেন ${at}`,
  sent: (at: string) => `জানানো ${at}`,
  offered: (at: string) => `প্রস্তাব ${at}`,
  youAgreed: (at: string) => `আপনি রাজি ${at}`,
  farmApproved: (at: string) => `খামারের অনুমোদন ${at}`,
  offerWithdrawn: (at: string) => `প্রস্তাব তুলে নেওয়া ${at}`,
  paperMark: (hash: string) => `কাগজের ছাপ ${hash}`,
  sealedBy: (channel: SigningChannel, to: string) =>
    `${channel === "sms" ? "এসএমএসে" : "ইমেইলে"}, ${to}-এ`,
  toldApproved: (ways: string, at: string) => `${ways}, ${at}`,
  notToldApproved: "যায়নি",
  youWithdrew: (agreed: string, withdrawn: string) =>
    `${agreed}-এর সম্মতি আপনি ফিরিয়ে নিয়েছেন ${withdrawn}`,
  bySmsAndEmail: (sms: boolean, email: boolean) =>
    [sms ? "এসএমএসে" : null, email ? "ইমেইলে" : null]
      .filter(Boolean)
      .join(" ও "),
  amendment: (venture: string) => `সংশোধন: ${venture}`,
  noConsent: "কোনো সম্মতি রেকর্ড নেই",
  consentWithdrawn: (day: string) => `তুলে নেওয়া ${day}`,
  consentInForce: "বহাল",
  since: (at: string) => `${at} থেকে`,
};

/** The same words in English, each taking its figures written in English. */
const ENGLISH: typeof BANGLA = {
  preamble: (name: string, day: string) =>
    `${name}, everything the farm holds about you up to ${day}. First comes why and how the farm keeps it.`,
  inForce: "in force now",
  noNominees: "No Nominees",
  born: (day: string) => `born ${day}`,
  nid: (number: string) => `NID ${number}`,
  birthRegistration: (number: string) => `birth registration ${number}`,
  share: (percent: string) => `share ${percent}`,
  receiver: (who: string) => `Receiver ${who}`,
  units: (count: number) =>
    `${figure(count, "en")} ${count === 1 ? "Unit" : "Units"}`,
  yourShare: (percent: number) => `your share ${figure(percent, "en")}%`,
  window: (from: string, to: string) => `Target Window ${from} – ${to}`,
  amended: (day: string) => `amended ${day}`,
  signed: (at: string) => `signed ${at}`,
  stamp: (serial: string, money: string, day: string) =>
    `stamp ${serial} (${money}, ${day})`,
  arbitrator: (name: string) => `arbitrator ${name}`,
  photoKept: "a photo of the signed Agreement is kept on the farm",
  capitalHeld: (money: string) => `capital on the farm ${money}`,
  owed: (payout: string, capital: string, share: string) =>
    `owed at the Settlement ${payout} (capital ${capital}, share of the profit ${share})`,
  paid: (day: string) => `paid ${day}`,
  notPaid: "not paid yet",
  acknowledged: (at: string) => `you acknowledged it ${at}`,
  sent: (at: string) => `sent ${at}`,
  offered: (at: string) => `offered ${at}`,
  youAgreed: (at: string) => `you agreed ${at}`,
  farmApproved: (at: string) => `the farm approved ${at}`,
  offerWithdrawn: (at: string) => `offer withdrawn ${at}`,
  paperMark: (hash: string) => `paper fingerprint ${hash}`,
  sealedBy: (channel: SigningChannel, to: string) =>
    `by ${channel === "sms" ? "text" : "email"} to ${to}`,
  toldApproved: (ways: string, at: string) => `by ${ways}, ${at}`,
  notToldApproved: "not sent",
  youWithdrew: (agreed: string, withdrawn: string) =>
    `you withdrew your agreement of ${agreed} on ${withdrawn}`,
  bySmsAndEmail: (sms: boolean, email: boolean) =>
    [sms ? "text" : null, email ? "email" : null].filter(Boolean).join(" and "),
  amendment: (venture: string) => `Amendment: ${venture}`,
  noConsent: "No consent on record",
  consentWithdrawn: (day: string) => `withdrawn ${day}`,
  consentInForce: "in force",
  since: (at: string) => `since ${at}`,
};

/** The paper's own words in each language. */
const WORDS: Record<Language, typeof BANGLA> = { bn: BANGLA, en: ENGLISH };

/** The papers the farm makes for an Investor, by the name the trail records them under. */
const PAPER_NAMES = {
  joining_letter: both("portal.paper.joining"),
  progress_statement: both("portal.paper.progress"),
  settlement_statement: both("portal.paper.settlement"),
  agreement_draft: { bn: "চুক্তির খসড়া", en: "Agreement to sign" },
  agreement_copy: { bn: "চুক্তির অনুলিপি", en: "Copy of the Agreement" },
  amendment_draft: { bn: "সংশোধনী", en: "Amendment" },
  portal_consent: both("portal.consent.sheetTitle"),
  nomination: { bn: "মনোনয়নপত্র", en: "Nomination" },
  privacy_notice: { bn: "আপনার তথ্য", en: "Your data" },
  welcome_letter: { bn: "স্বাগত চিঠি", en: "Welcome Letter" },
  code_slip: { bn: "কোডের স্লিপ", en: "Code Slip" },
  data_copy: TITLE,
} as const satisfies Partial<Record<ExportedPaper, Said>>;

/** Whether a paper is one the farm makes for an Investor, and so has a name on this one. */
const isTheirPaper = (paper: unknown): paper is keyof typeof PAPER_NAMES =>
  typeof paper === "string" && paper in PAPER_NAMES;

/** How each movement of their money is named. */
const MOVEMENT_NAMES = {
  capital_in: both("money.capitalIn"),
  refund: both("money.refund"),
  payout: both("money.payout"),
} as const;

/** Why their access was taken away, said to them — the Owner's screen says it of them, in the third person. */
const TAKEN_AWAY_WHY: Record<string, Said> = {
  withdrew_consent: {
    bn: "আপনি সম্মতি তুলে নিয়েছেন",
    en: "You withdrew your consent",
  },
  lost_phone: { bn: "ফোন হারানো", en: "A lost phone" },
  owner: { bn: "খামারের সিদ্ধান্ত", en: "The farm's decision" },
  signatory_changed: {
    bn: "প্রতিষ্ঠানের স্বাক্ষরকারী বদলেছে",
    en: "Your Organization's Signatory changed",
  },
};

/**
 * Each part of the trail about them — what it is, and the fields of its snapshot a change can touch, as the stores
 * snapshot them (`readInvestor`, `readAccess`, and the consent's own). A field of the investor's the paper leaves out
 * is caught by the test that reads a change of every one.
 */
export const TRAILED = {
  investor: {
    what: { bn: "আপনার রেকর্ড", en: "Your record" },
    fields: [
      "name",
      "phone",
      "email",
      "emailConfirmedAt",
      "address",
      "nid",
      "bankAccount",
      "retiredAt",
      // An Organization's own, and its Signatory's (ADR 0020).
      "tradeLicense",
      "rjscNumber",
      "tin",
      "authority",
      "authorityOn",
      "signatoryName",
      "signatoryNid",
      "signatoryRole",
    ],
  },
  investor_access: {
    what: { bn: "পোর্টাল প্রবেশাধিকার", en: "Portal access" },
    fields: [
      "invitedAt",
      "acceptedAt",
      "codeExpiresAt",
      "revokedAt",
      "revokedWhy",
    ],
  },
  portal_consent: {
    what: { bn: "পোর্টাল সম্মতি", en: "Portal Consent" },
    fields: ["signedOn", "version", "withdrawnOn", "withdrawnHow"],
  },
  nomination: {
    what: { bn: "আপনার নমিনি", en: "Your Nominees" },
    fields: ["signedOn", "nominationHow", "nominees"],
  },
} as const;

type Trailed = keyof typeof TRAILED;
type TrailedField = (typeof TRAILED)[Trailed]["fields"][number];

/** How a Nomination came to be on file. */
const NOMINATION_HOW_WORDS: Record<NominationHow, Said> = {
  nomination: { bn: "মনোনয়নপত্র", en: "Nomination" },
  agreement: { bn: "বিনিয়োগ চুক্তিতে", en: "In the Investment Agreement" },
  carried_over: {
    bn: "আগের রেকর্ড থেকে, এখনো সই হয়নি",
    en: "From the earlier record, not yet signed",
  },
  in_app: {
    bn: "অ্যাপে কোড দিয়ে সম্মত মনোনয়নপত্র",
    en: "মনোনয়নপত্র agreed in the app",
  },
};

const isNominationHow = (text: string): text is NominationHow =>
  Object.hasOwn(NOMINATION_HOW_WORDS, text);

/** Whether an entity on the trail is one the paper reads. */
const isTrailed = (entity: string): entity is Trailed => entity in TRAILED;

/** A snapshot the trail kept, read as the fields it holds. */
const fieldsOf = (snapshot: unknown): Record<string, unknown> =>
  typeof snapshot === "object" && snapshot !== null
    ? Object.fromEntries(Object.entries(snapshot))
    : {};

/** One field's value in a snapshot, as the paper in `language` writes it: a moment or a day in its own numerals, a
 *  reason in words. */
const valueWords = (
  field: TrailedField,
  value: unknown,
  language: Language
): string => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "number") {
    return figure(value, language);
  }
  const text = String(value);
  if (
    field === "signedOn" ||
    field === "withdrawnOn" ||
    field === "authorityOn"
  ) {
    return onDay(text, language);
  }
  if (field.endsWith("At")) {
    return when(new Date(text), language);
  }
  if (field === "nominationHow" && isNominationHow(text)) {
    return NOMINATION_HOW_WORDS[text][language];
  }
  if (field === "revokedWhy") {
    return TAKEN_AWAY_WHY[text]?.[language] ?? text;
  }
  if (
    field === "withdrawnHow" &&
    (text === "letter" ||
      text === "message" ||
      text === "signatory_changed" ||
      text === "replaced")
  ) {
    return translate(language, `portal.howLine.${text}`);
  }
  return text;
};

/** What one change did: each field it touched, what it was and what it became. */
const whatChanged = (
  entity: Trailed,
  before: unknown,
  after: unknown,
  language: Language
) => {
  const was = fieldsOf(before);
  const now = fieldsOf(after);
  const fields: readonly TrailedField[] = TRAILED[entity].fields;
  const words = (field: TrailedField, snapshot: Record<string, unknown>) =>
    valueWords(field, snapshot[field], language);
  return fields
    .filter((field) => words(field, was) !== words(field, now))
    .map(
      (field) =>
        `${translate(language, `auditField.${field}`)}: ${words(field, was)} → ${words(field, now)}`
    )
    .join("; ");
};

/**
 * Every paper the farm made for them, whoever made it and whatever it is filed against — and every amendment of a
 * Venture they signed into, which prints each Investor in it — the latest first.
 */
const papersMadeFor = (
  db: Pick<Tx, "select">,
  farmId: string,
  id: string,
  ventureIds: string[]
) =>
  db
    .select({
      at: auditEvent.receivedAt,
      after: auditEvent.after,
      by: user.name,
    })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorId))
    .where(
      and(
        eq(auditEvent.farmId, farmId),
        eq(auditEvent.action, "export"),
        or(
          sql`${auditEvent.after}->>'investorId' = ${id}`,
          ventureIds.length > 0
            ? and(
                eq(auditEvent.entity, "venture"),
                inArray(auditEvent.entityId, ventureIds),
                sql`${auditEvent.after}->>'paper' = 'amendment_draft'`
              )
            : undefined
        )
      )
    )
    .orderBy(desc(auditEvent.receivedAt), desc(auditEvent.id));

/** Every change to their record, their portal access and their consent, the latest first: who made it, and what it
 *  did. */
const changesAboutThem = (db: Pick<Tx, "select">, farmId: string, id: string) =>
  db
    .select({
      at: auditEvent.receivedAt,
      entity: auditEvent.entity,
      action: auditEvent.action,
      before: auditEvent.before,
      after: auditEvent.after,
      by: user.name,
    })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorId))
    .where(
      and(
        eq(auditEvent.farmId, farmId),
        inArray(auditEvent.entity, Object.keys(TRAILED)),
        eq(auditEvent.entityId, id),
        sql`${auditEvent.action} <> 'export'`
      )
    )
    .orderBy(desc(auditEvent.receivedAt), desc(auditEvent.id));

/** Every Portal Consent they signed, in force or withdrawn, the latest first. */
const theirConsents = (db: Pick<Tx, "select">, farmId: string, id: string) =>
  db
    .select({
      signedOn: portalConsent.signedOn,
      version: paperTemplateVersion.number,
      withdrawnOn: portalConsent.withdrawnOn,
      withdrawnHow: portalConsent.withdrawnHow,
    })
    .from(portalConsent)
    .innerJoin(
      paperTemplateVersion,
      eq(paperTemplateVersion.id, portalConsent.versionId)
    )
    .where(
      and(eq(portalConsent.farmId, farmId), eq(portalConsent.investorId, id))
    )
    .orderBy(desc(portalConsent.signedOn), desc(portalConsent.id));

/** What a Settlement owes on an Agreement, a fact to a line: owed, paid, and acknowledged by them. */
const settlementLines = (
  settlement: NonNullable<
    Awaited<
      ReturnType<typeof theirAgreements>
    >["agreements"][number]["settlement"]
  >
): DocumentRow[] => [
  {
    label: { bn: "হিসাব নিকাশে পাওনা", en: "Owed at Settlement" },
    value: each((language) => {
      const share = language === "bn" ? "মুনাফায় অংশ" : "share of the profit";
      const capital = language === "bn" ? "মূলধন" : "capital";
      return `${asMoney(settlement.payoutMoney, language)} (${capital} ${asMoney(settlement.capitalMoney, language)}, ${share} ${asMoney(settlement.shareMoney, language)})`;
    }),
  },
  {
    label: { bn: "পরিশোধ", en: "Paid" },
    value: each((language) =>
      settlement.paidOn
        ? onDay(settlement.paidOn, language)
        : WORDS[language].notPaid
    ),
  },
  ...linesFor(
    { bn: "আপনি বুঝে পেয়েছেন", en: "You acknowledged it" },
    settlement.acknowledgedAt ? momentSaid(settlement.acknowledgedAt) : null
  ),
];

/** What each column of the paper's tables says it holds. */
const COLUMN = {
  day: { label: { bn: "তারিখ", en: "Date" } },
  at: { label: { bn: "সময়", en: "When" } },
  what: { label: { bn: "কী", en: "What" } },
  venture: { label: { bn: "ভেঞ্চার", en: "Venture" } },
  reference: { label: { bn: "রেফারেন্স", en: "Reference" } },
  money: { label: { bn: "টাকা", en: "Amount" }, figures: true },
  paper: { label: { bn: "কাগজ", en: "Paper" } },
  by: { label: { bn: "যিনি করেছেন", en: "By" } },
  way: { label: { bn: "যেভাবে", en: "How" } },
  standing: { label: { bn: "অবস্থা", en: "Where it stands" } },
  units: { label: { bn: "ইউনিট", en: "Units" }, figures: true },
  saidAndAnswered: { label: { bn: "আপনার কথা ও উত্তর", en: "Said and answered" } },
  changed: { label: { bn: "কী বদলাল", en: "What changed" } },
  whenWhatBy: { label: { bn: "কখন, কী, কে", en: "When, what, by whom" } },
  nominee: { label: { bn: "নমিনি", en: "Nominee" } },
  born: { label: { bn: "জন্ম", en: "Born" } },
  number: {
    label: { bn: "এনআইডি / জন্ম নিবন্ধন", en: "NID / birth registration" },
  },
  share: { label: { bn: "অংশ", en: "Share" }, figures: true },
} as const satisfies Record<string, { label: Said; figures?: boolean }>;

/** A part of the paper that is a table — a line to a thing — or plainly nothing where it would have no lines. */
const tableOf = (
  heading: Said,
  columns: readonly { label: Said; figures?: boolean }[],
  rows: Worded[][]
): PaperSection =>
  rows.length === 0
    ? facts(heading, [])
    : {
        kind: "table",
        heading,
        columns: [...columns],
        rows,
        foot: null,
        note: null,
      };

/** The heading over the papers they agreed to in the portal, and the part that says there are none. */
const IN_THE_PORTAL: Said = {
  bn: "পোর্টালে রাজি হওয়া কাগজ",
  en: "Agreed in the portal",
};

/** The heading over their Agreements, and the part that says they have none. */
const AGREEMENTS: Said = { bn: "আপনার চুক্তি", en: "Your Agreements" };

/**
 * Every Nomination on file, the list in force first, one Nominee to a line: the paper and its day on its first line,
 * each Nominee's relation, birth, number and share, and a minor's Receiver beneath their name.
 */
const nomineesTable = (
  nominations: Awaited<ReturnType<typeof nominationsOf>>
): PaperSection =>
  tableOf(
    { bn: "আপনার নমিনি", en: "Your Nominees" },
    [COLUMN.paper, COLUMN.nominee, COLUMN.born, COLUMN.number, COLUMN.share],
    nominations.flatMap((one, index) => {
      const paper = each((language) =>
        joined(
          onDay(one.signedOn, language),
          NOMINATION_HOW_WORDS[one.how][language],
          index === 0 ? WORDS[language].inForce : null
        )
      );
      if (one.nominees.length === 0) {
        return [
          [paper, each((language) => WORDS[language].noNominees), "", "", ""],
        ];
      }
      return paperNominees(one, one.signedOn)
        .map(nomineeRowOf)
        .map((row, at): Worded[] => [
          at === 0 ? paper : "",
          each((language) =>
            [
              joined(row.name, row.relation?.[language] ?? null),
              row.phone,
              row.receiver
                ? WORDS[language].receiver(row.receiver[language])
                : null,
            ]
              .filter(Boolean)
              .join("\n")
          ),
          row.born ?? "",
          // An adult's NID as it is, the column naming it; a minor's birth registration said so.
          row.idNumber && row.minor
            ? each((language) =>
                WORDS[language].birthRegistration(row.idNumber ?? "")
              )
            : (row.idNumber ?? ""),
          row.share,
        ]);
    })
  );

/** One Agreement on its own, a fact to a line: what it holds, its terms, how it was signed and stamped, its money. */
const agreementPart = (
  one: Awaited<ReturnType<typeof theirAgreements>>["agreements"][number]
): PaperSection =>
  facts(
    { bn: `চুক্তি — ${one.venture.name}`, en: `Agreement — ${one.venture.name}` },
    [
      {
        label: { bn: "ইউনিট ও মূলধন", en: "Units and capital" },
        value: each(
          (language) =>
            `${WORDS[language].units(one.units)}, ${asMoney(one.promisedMoney, language)}`
        ),
      },
      {
        label: { bn: "আপনার অংশ", en: "Your share" },
        value: each((language) => `${figure(one.investorsPercent, language)}%`),
      },
      {
        label: { bn: "বিক্রির সময়", en: "Target Window" },
        value: each(
          (language) =>
            `${onDay(one.targetWindow.start, language)} – ${onDay(one.targetWindow.end, language)}`
        ),
      },
      ...linesFor(
        { bn: "সংশোধন", en: "Amended" },
        one.amendedOn
          ? each((language) => onDay(one.amendedOn ?? "", language))
          : null
      ),
      {
        label: { bn: "সই", en: "Signed" },
        value: each((language) => when(one.signedAt, language)),
      },
      {
        label: { bn: "স্ট্যাম্প", en: "Stamp" },
        value: each((language) =>
          // Agreed in the app, it carries none: the agreed paper's number instead, as the copy of it says.
          one.stamp.kind === "in_app"
            ? joined(
                language === "bn"
                  ? "নেই — অ্যাপে সম্মত"
                  : "None — agreed in the app",
                language === "bn"
                  ? `সম্মত কাগজ নম্বর ${one.stamp.serial}`
                  : `agreed paper no. ${one.stamp.serial}`
              )
            : joined(
                one.stamp.serial,
                asMoney(one.stamp.valueMoney, language),
                onDay(one.stamp.on, language)
              )
        ),
      },
      { label: { bn: "সালিস", en: "Arbitrator" }, value: one.arbitrator },
      ...linesFor(
        { bn: "সই করা কাগজ", en: "Signed paper" },
        one.hasPaper ? each((language) => WORDS[language].photoKept) : null
      ),
      {
        label: { bn: "খামারে মূলধন", en: "Capital held" },
        value: each((language) => asMoney(one.capitalHeldMoney, language)),
      },
      ...(one.settlement ? settlementLines(one.settlement) : []),
    ]
  );

/** When their portal access was taken away, and why, said to them. */
const takenAwayWords = (at: Date, why: string | null): Said =>
  each((language) =>
    joined(when(at, language), why ? TAKEN_AWAY_WHY[why]?.[language] : null)
  );

/** An Organization's own papers and the Signatory it acts through, as "Your record" lists them; nothing for a person,
 *  whose columns are empty (ADR 0020). */
const organizationLines = (them: typeof investor.$inferSelect) => [
  ...linesFor({ bn: "ট্রেড লাইসেন্স", en: "Trade license" }, them.tradeLicense),
  ...linesFor(
    { bn: "আরজেএসসি নিবন্ধন", en: "RJSC registration" },
    them.rjscNumber
  ),
  ...linesFor({ bn: "টিআইএন", en: "TIN" }, them.tin),
  ...linesFor({ bn: "স্বাক্ষরকারী", en: "Signatory" }, them.signatoryName),
  ...linesFor({ bn: "পদবি", en: "Role" }, them.signatoryRole),
  ...linesFor(
    { bn: "স্বাক্ষরকারীর এনআইডি নম্বর", en: "Signatory's NID" },
    them.signatoryNid
  ),
  ...linesFor(
    { bn: "ক্ষমতা অর্পণের কাগজ", en: "Authority" },
    them.authority
      ? each((language) =>
          joined(
            them.authority,
            them.authorityOn ? onDay(them.authorityOn, language) : null
          )
        )
      : null
  ),
];

/** Their email, and whether and when they confirmed it in the portal (ADR 0022); nothing with none. */
const emailLines = (them: {
  email: string | null;
  emailConfirmedAt: Date | null;
}): DocumentRow[] => {
  if (!them.email) {
    return [];
  }
  const confirmed = them.emailConfirmedAt;
  return linesFor(
    { bn: "ইমেইল", en: "Email" },
    {
      bn: `${them.email} · ${confirmed ? `নিশ্চিত করেছেন ${momentSaid(confirmed).bn}` : "এখনো নিশ্চিত করেননি"}`,
      en: `${them.email} · ${confirmed ? `confirmed ${momentSaid(confirmed).en}` : "not confirmed yet"}`,
    }
  );
};

/** How a paper agreed in the portal was sealed, a fact to a line: the way the code came and where, from what address and
 *  browser, and whether the farm told them of the approval. Nothing where no code sealed it. */
const sealLines = (
  proof:
    | {
        channel: SigningChannel;
        sentTo: string;
        callerAddress: string | null;
        callerAgent: string | null;
        confirmedAt: Date | null;
        confirmedBySms: boolean;
        confirmedByEmail: boolean;
      }
    | undefined
): DocumentRow[] => {
  if (!proof) {
    return [];
  }
  const told = proof.confirmedBySms || proof.confirmedByEmail;
  const { confirmedAt } = proof;
  return [
    {
      label: { bn: "কোড", en: "Code" },
      value: each((language) =>
        WORDS[language].sealedBy(proof.channel, proof.sentTo)
      ),
    },
    { label: { bn: "ঠিকানা", en: "Address" }, value: proof.callerAddress ?? "—" },
    { label: { bn: "ব্রাউজার", en: "Browser" }, value: proof.callerAgent ?? "—" },
    ...linesFor(
      { bn: "অনুমোদনের খবর", en: "Told of the approval" },
      confirmedAt
        ? each((language) => {
            const say = WORDS[language];
            return told
              ? say.toldApproved(
                  say.bySmsAndEmail(
                    proof.confirmedBySms,
                    proof.confirmedByEmail
                  ),
                  when(confirmedAt, language)
                )
              : say.notToldApproved;
          })
        : null
    ),
  ];
};

/** Each agreement they withdrew before it was approved, by the paper it was to: `offerKind:offerId`. */
const withdrawalsByPaper = (
  proofs: {
    offerKind: string;
    offerId: string;
    agreedAt: Date;
    withdrawnAt: Date | null;
  }[]
) => {
  const withdrawals = new Map<
    string,
    { agreedAt: Date; withdrawnAt: Date }[]
  >();
  for (const one of proofs) {
    if (one.withdrawnAt) {
      const key = `${one.offerKind}:${one.offerId}`;
      withdrawals.set(key, [
        ...(withdrawals.get(key) ?? []),
        { agreedAt: one.agreedAt, withdrawnAt: one.withdrawnAt },
      ]);
    }
  }
  return withdrawals;
};

/**
 * The Amendments whose agreement they withdrew and did not give again: no answer of theirs is left to name one by, so
 * each is named from its offer — by its Venture, which they have an Agreement on, or the Amendment would not name them.
 */
const amendmentsTakenBack = async (
  db: Pick<Tx, "query">,
  farmId: string,
  {
    proofs,
    answered,
    agreements,
  }: {
    proofs: { offerKind: string; offerId: string; withdrawnAt: Date | null }[];
    answered: string[];
    agreements: { venture: { id: string; name: string } }[];
  }
) => {
  const stillAnswered = new Set(answered);
  const ids = [
    ...new Set(
      proofs
        .filter(
          (one) =>
            one.offerKind === "amendment_offer" &&
            one.withdrawnAt !== null &&
            !stillAnswered.has(one.offerId)
        )
        .map((one) => one.offerId)
    ),
  ];
  if (ids.length === 0) {
    return [];
  }
  const ventureNameOf = new Map(
    agreements.map((one) => [one.venture.id, one.venture.name] as const)
  );
  const offers = await db.query.amendmentOffer.findMany({
    where: { farmId, id: { in: ids } },
    columns: { id: true, ventureId: true },
  });
  return offers.map((one) => ({
    id: one.id,
    ventureName: ventureNameOf.get(one.ventureId) ?? "",
  }));
};

/**
 * The Data Copy of one Investor, laid out to print and hand over: the notice's points first, then their record
 * unmasked, their Agreements with any Settlement, the money they moved, the papers made for them, their Requests to
 * Join and each change they made, their portal access, consents and sign-ins, and every change to their record, access
 * and consent. An Export on the Investor. Refused while the notice has a fact unwritten: its points are the first page.
 */
export const dataCopyOf = async (
  context: Owned,
  investorId: string
): Promise<PaperDocument> => {
  const { db, farm } = context;
  const now = context.clock.now();
  const them = await db.query.investor.findFirst({
    // The Farm's own partner record is no person, and holds no personal data to copy.
    where: { id: investorId, farmId: farm.id, isFarm: false },
  });
  if (!them) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  assertRegistered(farm, "data_copy");
  const { notice, inEnglish } = await theNoticeToRead(db, farm);
  if (!notice) {
    throw refused(
      "The privacy notice still names a fact the farm has not written down, and it is this paper's first page",
      "notice_unwritten"
    );
  }
  const money = await theirAgreements(db, farm.id, investorId, farmDayOf(now));
  const ventureIds = [
    ...new Set(money.agreements.map((one) => one.venture.id)),
  ];
  const [papers, requests, requestChanges, access, consents, changes] =
    await Promise.all([
      papersMadeFor(db, farm.id, investorId, ventureIds),
      theirRequests(db, farm.id, investorId),
      whatTheyDidToTheirRequests(db, farm.id, investorId),
      db.query.investorAccess.findFirst({
        where: { farmId: farm.id, investorId },
        columns: {
          userId: true,
          loginEmail: true,
          invitedAt: true,
          acceptedAt: true,
          lastSeenAt: true,
          revokedAt: true,
          revokedWhy: true,
        },
      }),
      theirConsents(db, farm.id, investorId),
      changesAboutThem(db, farm.id, investorId),
    ]);
  const nominations = await nominationsOf(db, farm.id, investorId);
  // What they said they paid through the portal, and what they agreed to there: theirs, as much as a signed paper is.
  const [payInNotes, offers, amendmentsAgreed, proofs, nominationOffers] =
    await Promise.all([
      db.query.payInNote.findMany({
        where: { farmId: farm.id, investorId },
        orderBy: { createdAt: "asc", id: "asc" },
      }),
      db.query.agreementOffer.findMany({
        where: { farmId: farm.id, investorId },
        orderBy: { offeredAt: "asc", id: "asc" },
      }),
      money.agreements.length === 0
        ? Promise.resolve([])
        : db.query.amendmentOfferAnswer.findMany({
            where: {
              farmId: farm.id,
              agreementId: { in: money.agreements.map((one) => one.id) },
            },
            orderBy: { agreedAt: "asc", id: "asc" },
          }),
      db.query.signingProof.findMany({
        where: { farmId: farm.id, investorId },
        orderBy: { agreedAt: "asc", id: "asc" },
      }),
      db.query.nominationOffer.findMany({
        where: { farmId: farm.id, investorId },
        columns: { paper: false },
        orderBy: { offeredAt: "asc", id: "asc" },
      }),
    ]);
  // How each paper they agreed to in the app was sealed, by what it was offered as (ADR 0022) — the agreement standing,
  // and each they withdrew before it was approved.
  const proofOf = new Map(
    proofs
      .filter((one) => one.withdrawnAt === null)
      .map((one) => [`${one.offerKind}:${one.offerId}`, one])
  );
  const withdrawals = withdrawalsByPaper(proofs);
  const withdrawnOf = (key: string, language: Language) =>
    (withdrawals.get(key) ?? [])
      .map((one) =>
        WORDS[language].youWithdrew(
          when(one.agreedAt, language),
          when(one.withdrawnAt, language)
        )
      )
      .join(" · ");
  const portalVentureIds = [
    ...new Set([...payInNotes, ...offers].map((one) => one.ventureId)),
  ];
  const portalVentures =
    portalVentureIds.length === 0
      ? []
      : await db.query.venture.findMany({
          where: { farmId: farm.id, id: { in: portalVentureIds } },
          columns: { id: true, name: true },
        });
  const ventureNamed = new Map(
    portalVentures.map((one) => [one.id, one.name] as const)
  );
  const places = access?.userId ? await signedInOn(db, access.userId, now) : [];
  const ventureOf = new Map(
    money.agreements.map((one) => [one.id, one.venture.name] as const)
  );
  const takenBack = await amendmentsTakenBack(db, farm.id, {
    proofs,
    answered: amendmentsAgreed.map((one) => one.offerId),
    agreements: money.agreements,
  });

  // Each paper agreed in the portal on its own: offered, agreed, approved, and how the code that sealed it came.
  const inThePortal = (
    agreedThere: {
      name: Said;
      key: string;
      offer: {
        offeredAt?: Date;
        agreedAt?: Date | null;
        approvedAt?: Date | null;
        withdrawnAt?: Date | null;
        paperHash?: string;
      };
      terms: Said | null;
    }[]
  ): PaperSection[] =>
    agreedThere.length === 0
      ? [facts(IN_THE_PORTAL, [])]
      : agreedThere.map(({ name, key, offer, terms }) =>
          facts(
            {
              bn: `${IN_THE_PORTAL.bn} — ${name.bn}`,
              en: `${IN_THE_PORTAL.en} — ${name.en}`,
            },
            [
              ...linesFor({ bn: "শর্ত", en: "Terms" }, terms),
              ...linesFor(
                { bn: "প্রস্তাব", en: "Offered" },
                offer.offeredAt ? momentSaid(offer.offeredAt) : null
              ),
              ...linesFor(
                { bn: "আপনার সম্মতি", en: "You agreed" },
                offer.agreedAt ? momentSaid(offer.agreedAt) : null
              ),
              ...linesFor(
                { bn: "খামারের অনুমোদন", en: "Approved by the farm" },
                offer.approvedAt ? momentSaid(offer.approvedAt) : null
              ),
              ...linesFor(
                { bn: "প্রস্তাব তুলে নেওয়া", en: "Offer withdrawn" },
                offer.withdrawnAt ? momentSaid(offer.withdrawnAt) : null
              ),
              ...linesFor(
                { bn: "কাগজের ছাপ", en: "Paper fingerprint" },
                offer.paperHash ? offer.paperHash.slice(0, 12) : null
              ),
              ...linesFor(
                { bn: "ফিরিয়ে নেওয়া সম্মতি", en: "Agreement withdrawn" },
                each((language) => withdrawnOf(key, language))
              ),
              ...sealLines(proofOf.get(key)),
            ]
          )
        );

  const sections: PaperSection[] = [
    // The notice's points first, as the portal's page reads them, each with its English beside it.
    ...notice.parts.map((part, at): PaperSection => {
      const english = inEnglish?.parts[at];
      return {
        kind: "clauses",
        heading: { bn: part.heading, en: english?.heading ?? "" },
        clauses: part.lines.map((line, place) => ({
          bn: line,
          en: english?.lines[place] ?? "",
        })),
      };
    }),
    facts({ bn: "আপনার রেকর্ড", en: "Your record" }, [
      ...linesFor({ bn: "নাম", en: "Name" }, them.name),
      ...linesFor({ bn: "ফোন", en: "Phone" }, them.phone),
      ...emailLines(them),
      ...linesFor({ bn: "ঠিকানা", en: "Address" }, them.address),
      ...linesFor({ bn: "এনআইডি নম্বর", en: "NID" }, them.nid),
      ...organizationLines(them),
      ...linesFor({ bn: "ব্যাংক হিসাব", en: "Bank account" }, them.bankAccount),
      ...linesFor(
        { bn: "লেখা হয়েছে", en: "Recorded" },
        momentSaid(them.createdAt)
      ),
      ...linesFor(
        { bn: "বাদ দেওয়ার দিন", en: "Retired" },
        them.retiredAt ? momentSaid(them.retiredAt) : null
      ),
    ]),
    // Every Nomination on file, the list in force first, one Nominee to a line: who they named, and on which paper. An
    // Organization names none, and is not asked about them.
    ...(them.kind === "organization" ? [] : [nomineesTable(nominations)]),
    // Each Agreement on its own, a fact to a line.
    ...(money.agreements.length === 0
      ? [facts(AGREEMENTS, [])]
      : money.agreements.map(agreementPart)),
    tableOf(
      { bn: `আপনার ${currencyWords("bn").of} লেনদেন`, en: "Your money moved" },
      [COLUMN.day, COLUMN.what, COLUMN.venture, COLUMN.reference, COLUMN.money],
      money.movements.map((one) => [
        each((language) => onDay(one.movedOn, language)),
        each((language) => MOVEMENT_NAMES[one.kind][language]),
        ventureOf.get(one.agreementId) ?? "",
        one.reference ?? "",
        each((language) => asMoney(one.amountMoney, language)),
      ])
    ),
    tableOf(
      { bn: "আপনার জন্য তৈরি কাগজ", en: "Papers made for you" },
      [COLUMN.at, COLUMN.paper, COLUMN.by],
      papers.map((one) => {
        const { paper } = fieldsOf(one.after);
        return [
          momentSaid(one.at),
          isTheirPaper(paper) ? PAPER_NAMES[paper] : String(paper ?? ""),
          one.by ?? "",
        ];
      })
    ),
    tableOf(
      { bn: "আপনার জমার খবর", en: "Your Pay-in Notes" },
      [
        COLUMN.day,
        COLUMN.venture,
        COLUMN.way,
        COLUMN.reference,
        COLUMN.standing,
        COLUMN.money,
      ],
      payInNotes.map((one) => [
        each((language) => onDay(one.sentOn, language)),
        ventureNamed.get(one.ventureId) ?? "",
        each((language) => translate(language, `portal.payIn.way.${one.way}`)),
        one.reference ?? "",
        each((language) =>
          joined(
            translate(language, `portal.payIn.state.${one.state}`),
            one.answerLine ? `“${one.answerLine}”` : null,
            WORDS[language].sent(when(one.createdAt, language))
          )
        ),
        each((language) => asMoney(one.amountMoney, language)),
      ])
    ),
    // Each paper agreed in the portal on its own: offered, agreed, approved, and how the code that sealed it came.
    ...inThePortal([
      ...offers.map((one) => ({
        name: asTyped(ventureNamed.get(one.ventureId) ?? ""),
        key: `agreement_offer:${one.id}`,
        offer: one,
        terms: each(
          (language) =>
            `${WORDS[language].units(one.units)}, ${WORDS[language].yourShare(one.investorsPercent)}`
        ),
      })),
      ...amendmentsAgreed.map((one) => ({
        name: each((language) =>
          WORDS[language].amendment(ventureOf.get(one.agreementId) ?? "")
        ),
        key: `amendment_offer:${one.offerId}`,
        offer: { agreedAt: one.agreedAt },
        terms: null,
      })),
      ...takenBack.map((one) => ({
        name: each((language) => WORDS[language].amendment(one.ventureName)),
        key: `amendment_offer:${one.id}`,
        offer: {},
        terms: null,
      })),
      ...nominationOffers.map((one) => ({
        name: { bn: "মনোনয়নপত্র", en: "মনোনয়নপত্র" },
        key: `nomination_offer:${one.id}`,
        offer: one,
        terms: null,
      })),
    ]),
    tableOf(
      { bn: "ভেঞ্চারে যোগ দেওয়ার অনুরোধ", en: "Your Requests to Join" },
      [COLUMN.venture, COLUMN.units, COLUMN.standing, COLUMN.saidAndAnswered],
      requests.map((one) => [
        one.ventureName,
        each((language) => WORDS[language].units(one.units)),
        each((language) =>
          translate(language, `ventures.requests.state.${one.state}`)
        ),
        asTyped(joined(one.note ? `“${one.note}”` : null, one.answerLine)),
      ])
    ),
    tableOf(
      {
        bn: "অনুরোধে আপনার প্রতিটি বদল",
        en: "Each change you made to a Request",
      },
      [COLUMN.at, COLUMN.venture, COLUMN.what],
      requestChanges.map((one) => [
        momentSaid(one.at),
        one.ventureName,
        each((language) =>
          translate(language, `ventures.requests.kind.${one.kind}`, {
            // The Bangla says the count as written; the English counts it, one Unit or many.
            units: language === "bn" ? figure(one.units, "bn") : one.units,
          })
        ),
      ])
    ),
    facts({ bn: "পোর্টাল", en: "The portal" }, [
      ...linesFor(
        { bn: "সাইন ইনের ফোন", en: "Signs in with" },
        access ? phoneOfInvestorLogin(access.loginEmail) : null
      ),
      ...linesFor(
        { bn: "আমন্ত্রণ", en: "Invited" },
        access ? momentSaid(access.invitedAt) : null
      ),
      ...linesFor(
        { bn: "প্রথম সাইন ইন", en: "First signed in" },
        access?.acceptedAt ? momentSaid(access.acceptedAt) : null
      ),
      ...linesFor(
        { bn: "শেষ এসেছেন", en: "Last in" },
        access?.lastSeenAt ? momentSaid(access.lastSeenAt) : null
      ),
      ...linesFor(
        { bn: "প্রবেশাধিকার তুলে নেওয়া", en: "Access taken away" },
        access?.revokedAt
          ? takenAwayWords(access.revokedAt, access.revokedWhy)
          : null
      ),
      ...(consents.length === 0
        ? linesFor(
            { bn: "সম্মতি", en: "Consent" },
            each((language) => WORDS[language].noConsent)
          )
        : consents.map((one) => ({
            label: { bn: "সম্মতি", en: "Consent" },
            value: each((language) => {
              const say = WORDS[language];
              return joined(
                translate(language, "portal.consent.signed", {
                  when: onDay(farmDayOf(one.signedOn), language),
                  version: figure(one.version, language),
                }),
                one.withdrawnOn
                  ? joined(
                      say.consentWithdrawn(
                        onDay(farmDayOf(one.withdrawnOn), language)
                      ),
                      one.withdrawnHow
                        ? translate(
                            language,
                            `portal.howLine.${one.withdrawnHow}`
                          )
                        : null
                    )
                  : say.consentInForce
              );
            }),
          }))),
      ...places.map((one) => ({
        label: { bn: "এখন সাইন ইন", en: "Signed in now" },
        value: each((language) =>
          joined(
            WORDS[language].since(when(one.since, language)),
            one.browser,
            one.from
          )
        ),
      })),
    ]),
    tableOf(
      { bn: "আপনার সম্পর্কে প্রতিটি বদল", en: "Every change about you" },
      [COLUMN.whenWhatBy, COLUMN.changed],
      changes.flatMap(({ entity, ...one }) =>
        isTrailed(entity)
          ? [
              [
                // When, what and who, a line each, beside what changed.
                each((language) =>
                  [
                    when(one.at, language),
                    joined(
                      TRAILED[entity].what[language],
                      translate(language, `audit.action.${one.action}`)
                    ),
                    one.by,
                  ]
                    .filter(Boolean)
                    .join("\n")
                ),
                each((language) =>
                  whatChanged(entity, one.before, one.after, language)
                ),
              ],
            ]
          : []
      )
    ),
  ];

  await audited(context).write(
    {
      entity: "investor",
      entityId: investorId,
      action: "export",
      after: exportedPaper(farm, "data_copy", { investorId }),
    },
    () => Promise.resolve()
  );

  return {
    letterhead: letterheadOf(farm),
    title: TITLE,
    preamble: each((language) =>
      WORDS[language].preamble(them.name, onDay(farmDayOf(now), language))
    ),
    sections,
    closing: [],
    produced: each(
      (language) => `${producedAt(now, language)} · ${context.actor.name}`
    ),
  };
};
