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
    (text === "letter" || text === "message" || text === "signatory_changed")
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

/** A Settlement on one Agreement, in a line: what it owed them, and whether it was paid and acknowledged. */
const settlementWords = (
  settlement: NonNullable<
    Awaited<
      ReturnType<typeof theirAgreements>
    >["agreements"][number]["settlement"]
  >,
  language: Language
) => {
  const say = WORDS[language];
  return joined(
    say.owed(
      asMoney(settlement.payoutMoney, language),
      asMoney(settlement.capitalMoney, language),
      asMoney(settlement.shareMoney, language)
    ),
    settlement.paidOn
      ? say.paid(onDay(settlement.paidOn, language))
      : say.notPaid,
    settlement.acknowledgedAt
      ? say.acknowledged(when(settlement.acknowledgedAt, language))
      : null
  );
};

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
  const [payInNotes, offers, amendmentsAgreed] = await Promise.all([
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
  ]);
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
    // Every Nomination on file, the list in force first: who they named, and on which paper. An Organization names
    // none, and is not asked about them.
    ...(them.kind === "organization"
      ? []
      : [
          facts(
            { bn: "আপনার নমিনি", en: "Your Nominees" },
            nominations.map((one, index) => {
              const rows = paperNominees(one, one.signedOn).map(nomineeRowOf);
              return {
                label: each((language) =>
                  joined(
                    onDay(one.signedOn, language),
                    NOMINATION_HOW_WORDS[one.how][language],
                    index === 0 ? WORDS[language].inForce : null
                  )
                ),
                value: each((language) => {
                  const say = WORDS[language];
                  if (one.nominees.length === 0) {
                    return say.noNominees;
                  }
                  return rows
                    .map((row) =>
                      joined(
                        row.name,
                        row.relation?.[language] ?? null,
                        row.born ? say.born(row.born[language]) : null,
                        row.idNumber
                          ? (row.minor ? say.birthRegistration : say.nid)(
                              row.idNumber
                            )
                          : null,
                        row.phone,
                        say.share(row.share[language]),
                        row.receiver
                          ? say.receiver(row.receiver[language])
                          : null
                      )
                    )
                    .join("; ");
                }),
              };
            })
          ),
        ]),
    facts(
      { bn: "আপনার চুক্তি", en: "Your Agreements" },
      money.agreements.map((one) => ({
        label: asTyped(one.venture.name),
        value: each((language) => {
          const say = WORDS[language];
          return joined(
            `${say.units(one.units)}, ${asMoney(one.promisedMoney, language)}`,
            say.yourShare(one.investorsPercent),
            say.window(
              onDay(one.targetWindow.start, language),
              onDay(one.targetWindow.end, language)
            ),
            one.amendedOn ? say.amended(onDay(one.amendedOn, language)) : null,
            say.signed(when(one.signedAt, language)),
            say.stamp(
              one.stamp.serial,
              asMoney(one.stamp.valueMoney, language),
              onDay(one.stamp.on, language)
            ),
            say.arbitrator(one.arbitrator),
            one.hasPaper ? say.photoKept : null,
            say.capitalHeld(asMoney(one.capitalHeldMoney, language)),
            one.settlement ? settlementWords(one.settlement, language) : null
          );
        }),
      }))
    ),
    facts(
      { bn: `আপনার ${currencyWords("bn").of} লেনদেন`, en: "Your money moved" },
      money.movements.map((one) => ({
        label: each((language) => onDay(one.movedOn, language)),
        value: each((language) =>
          joined(
            MOVEMENT_NAMES[one.kind][language],
            asMoney(one.amountMoney, language),
            ventureOf.get(one.agreementId),
            one.reference
          )
        ),
      }))
    ),
    facts(
      { bn: "আপনার জন্য তৈরি কাগজ", en: "Papers made for you" },
      papers.map((one) => {
        const { paper } = fieldsOf(one.after);
        return {
          label: momentSaid(one.at),
          value: each((language) =>
            joined(
              isTheirPaper(paper)
                ? PAPER_NAMES[paper][language]
                : String(paper ?? ""),
              one.by
            )
          ),
        };
      })
    ),
    facts(
      { bn: "আপনার জমার খবর", en: "Your Pay-in Notes" },
      payInNotes.map((one) => ({
        label: each((language) => onDay(one.sentOn, language)),
        value: each((language) =>
          joined(
            ventureNamed.get(one.ventureId) ?? null,
            asMoney(one.amountMoney, language),
            translate(language, `portal.payIn.way.${one.way}`),
            one.reference,
            translate(language, `portal.payIn.state.${one.state}`),
            one.answerLine ? `“${one.answerLine}”` : null,
            WORDS[language].sent(when(one.createdAt, language))
          )
        ),
      }))
    ),
    facts({ bn: "পোর্টালে রাজি হওয়া চুক্তি ও সংশোধন", en: "Agreed in the portal" }, [
      ...offers.map((one) => ({
        label: asTyped(ventureNamed.get(one.ventureId) ?? ""),
        value: each((language) => {
          const say = WORDS[language];
          return joined(
            `${say.units(one.units)}, ${say.yourShare(one.investorsPercent)}`,
            say.offered(when(one.offeredAt, language)),
            one.agreedAt ? say.youAgreed(when(one.agreedAt, language)) : null,
            one.approvedAt
              ? say.farmApproved(when(one.approvedAt, language))
              : null,
            one.withdrawnAt
              ? say.offerWithdrawn(when(one.withdrawnAt, language))
              : null,
            say.paperMark(one.paperHash.slice(0, 12))
          );
        }),
      })),
      ...amendmentsAgreed.map((one) => ({
        label: each((language) =>
          WORDS[language].amendment(ventureOf.get(one.agreementId) ?? "")
        ),
        value: each((language) =>
          WORDS[language].youAgreed(when(one.agreedAt, language))
        ),
      })),
    ]),
    facts({ bn: "ভেঞ্চারে যোগ দেওয়ার অনুরোধ", en: "Your Requests to Join" }, [
      ...requests.map((one) => ({
        label: asTyped(one.ventureName),
        value: each((language) =>
          joined(
            WORDS[language].units(one.units),
            translate(language, `ventures.requests.state.${one.state}`),
            one.note ? `“${one.note}”` : null,
            one.answerLine
          )
        ),
      })),
      ...requestChanges.map((one) => ({
        label: momentSaid(one.at),
        value: each((language) =>
          joined(
            one.ventureName,
            translate(language, `ventures.requests.kind.${one.kind}`, {
              // The Bangla says the count as written; the English counts it, one Unit or many.
              units: language === "bn" ? figure(one.units, "bn") : one.units,
            })
          )
        ),
      })),
    ]),
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
    facts(
      { bn: "আপনার সম্পর্কে প্রতিটি বদল", en: "Every change about you" },
      changes.flatMap(({ entity, ...one }) =>
        isTrailed(entity)
          ? [
              {
                label: momentSaid(one.at),
                value: each((language) =>
                  joined(
                    TRAILED[entity].what[language],
                    translate(language, `audit.action.${one.action}`),
                    one.by,
                    whatChanged(entity, one.before, one.after, language)
                  )
                ),
              },
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
