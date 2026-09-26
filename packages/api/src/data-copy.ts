import { and, desc, eq, inArray, or, sql } from "@OpenFarm/db/operators";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { user } from "@OpenFarm/db/schema/auth";
import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import { portalConsent } from "@OpenFarm/db/schema/venture";
import type {
  DocumentRow,
  PaperDocument,
  PaperSection,
  Said,
} from "@OpenFarm/domain";
import {
  farmDayOf,
  letterheadOf,
  nomineeRowOf,
  phoneOfInvestorLogin,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber, translate } from "@OpenFarm/i18n";
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
// on paper; never offered in the portal. Everything is listed the latest first, as their money is.

/** The paper's title. */
const TITLE: Said = {
  bn: "খামারে আপনার তথ্য",
  en: "What the farm holds about you",
};

/** A moment on the farm's clock, as the Bangla paper writes it. */
const when = (at: Date) => formatDate(at, "bn", "dateTime");

/** A farm day, as the Bangla paper writes it. */
const onDay = (day: string) => formatDate(new Date(`${day}T00:00:00Z`), "bn");

/** Taka, in Bangla numerals. */
const taka = (bdt: number) => `৳${formatNumber(bdt, "bn")}`;

/** A figure, in Bangla numerals. */
const inBangla = (value: number) => formatNumber(value, "bn");

/** A message in Bangla. */
const bn = (key: MessageKey, params?: Record<string, string | number>) =>
  translate("bn", key, params);

/** A message in both languages, for a label. */
const both = (key: MessageKey): Said => ({
  bn: translate("bn", key),
  en: translate("en", key),
});

/** The lines of the paper saying one fact: one line, or none where the farm holds nothing for it. */
const linesFor = (
  label: Said,
  value: string | null | undefined
): DocumentRow[] => (value?.trim() ? [{ label, value }] : []);

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

/** The papers the farm makes for an Investor, by the name the trail records them under. */
const PAPER_NAMES = {
  joining_letter: both("portal.paper.joining"),
  progress_statement: both("portal.paper.progress"),
  settlement_statement: both("portal.paper.settlement"),
  agreement_draft: { bn: "চুক্তির খসড়া", en: "Agreement to sign" },
  amendment_draft: { bn: "সংশোধনী", en: "Amendment" },
  portal_consent: both("portal.consent.sheetTitle"),
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
  capital_in: both("investors.page.move.capitalIn"),
  refund: both("investors.page.move.refund"),
  payout: both("investors.page.move.payout"),
} as const;

/** Why their access was taken away, said to them — the Owner's screen says it of them, in the third person. */
const TAKEN_AWAY_WHY: Record<string, string> = {
  withdrew_consent: "আপনি সম্মতি তুলে নিয়েছেন",
  lost_phone: "ফোন হারানো",
  owner: "খামারের সিদ্ধান্ত",
};

/**
 * Each part of the trail about them — what it is, and the fields of its snapshot a change can touch, as the stores
 * snapshot them (`readInvestor`, `readAccess`, and the consent's own). A field of the investor's the paper leaves out
 * is caught by the test that reads a change of every one.
 */
export const TRAILED = {
  investor: {
    what: "আপনার রেকর্ড",
    fields: ["name", "phone", "address", "nid", "bankAccount", "retiredAt"],
  },
  investor_access: {
    what: "পোর্টাল প্রবেশাধিকার",
    fields: [
      "invitedAt",
      "acceptedAt",
      "codeExpiresAt",
      "revokedAt",
      "revokedWhy",
    ],
  },
  portal_consent: {
    what: "পোর্টাল সম্মতি",
    fields: ["signedOn", "version", "withdrawnOn", "withdrawnHow"],
  },
} as const;

type Trailed = keyof typeof TRAILED;
type TrailedField = (typeof TRAILED)[Trailed]["fields"][number];

/** How a Nomination came to be on file, as the Bangla paper says it. */
const NOMINATION_HOW_WORDS: Record<NominationHow, string> = {
  nomination: "মনোনয়নপত্র",
  agreement: "বিনিয়োগ চুক্তিতে",
  carried_over: "আগের রেকর্ড থেকে, এখনো সই হয়নি",
};

/** Whether an entity on the trail is one the paper reads. */
const isTrailed = (entity: string): entity is Trailed => entity in TRAILED;

/** A snapshot the trail kept, read as the fields it holds. */
const fieldsOf = (snapshot: unknown): Record<string, unknown> =>
  typeof snapshot === "object" && snapshot !== null
    ? Object.fromEntries(Object.entries(snapshot))
    : {};

/** One field's value in a snapshot, as the Bangla paper writes it: a moment or a day in Bangla, a reason in words. */
const valueWords = (field: TrailedField, value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "number") {
    return inBangla(value);
  }
  const text = String(value);
  if (field === "signedOn" || field === "withdrawnOn") {
    return onDay(text);
  }
  if (field.endsWith("At")) {
    return when(new Date(text));
  }
  if (field === "revokedWhy") {
    return TAKEN_AWAY_WHY[text] ?? text;
  }
  if (field === "withdrawnHow" && (text === "letter" || text === "message")) {
    return bn(`portal.howLine.${text}`);
  }
  return text;
};

/** What one change did: each field it touched, what it was and what it became. */
const whatChanged = (entity: Trailed, before: unknown, after: unknown) => {
  const was = fieldsOf(before);
  const now = fieldsOf(after);
  const fields: readonly TrailedField[] = TRAILED[entity].fields;
  return fields
    .filter(
      (field) => valueWords(field, was[field]) !== valueWords(field, now[field])
    )
    .map(
      (field) =>
        `${bn(`auditField.${field}`)}: ${valueWords(field, was[field])} → ${valueWords(field, now[field])}`
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
  >
) =>
  joined(
    `হিসাব নিকাশে পাওনা ${taka(settlement.payoutBdt)} (মূলধন ${taka(settlement.capitalBdt)}, মুনাফায় অংশ ${taka(settlement.shareBdt)})`,
    settlement.paidOn
      ? `পরিশোধ ${onDay(settlement.paidOn)}`
      : "এখনো পরিশোধ হয়নি",
    settlement.acknowledgedAt
      ? `আপনি বুঝে পেয়েছেন ${when(settlement.acknowledgedAt)}`
      : null
  );

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
    where: { id: investorId, farmId: farm.id },
  });
  if (!them) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  assertRegistered(farm, "data_copy");
  const { notice } = await theNoticeToRead(db, farm);
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
  const places = access?.userId ? await signedInOn(db, access.userId, now) : [];
  const ventureOf = new Map(
    money.agreements.map((one) => [one.id, one.venture.name] as const)
  );

  const sections: PaperSection[] = [
    // The notice's points first, as the portal's page reads them.
    ...notice.parts.map((part): PaperSection => ({
      kind: "clauses",
      heading: { bn: part.heading, en: "" },
      clauses: part.lines.map((line) => ({ bn: line, en: "" })),
    })),
    facts({ bn: "আপনার রেকর্ড", en: "Your record" }, [
      ...linesFor({ bn: "নাম", en: "Name" }, them.name),
      ...linesFor({ bn: "ফোন", en: "Phone" }, them.phone),
      ...linesFor({ bn: "ঠিকানা", en: "Address" }, them.address),
      ...linesFor({ bn: "এনআইডি নম্বর", en: "NID" }, them.nid),
      ...linesFor({ bn: "ব্যাংক হিসাব", en: "Bank account" }, them.bankAccount),
      ...linesFor({ bn: "লেখা হয়েছে", en: "Recorded" }, when(them.createdAt)),
      ...linesFor(
        { bn: "বাদ দেওয়ার দিন", en: "Retired" },
        them.retiredAt ? when(them.retiredAt) : null
      ),
    ]),
    // Every Nomination on file, the list in force first: who they named, and on which paper.
    facts(
      { bn: "আপনার নমিনি", en: "Your Nominees" },
      nominations.map((one, index) => ({
        label: {
          bn: joined(
            onDay(one.signedOn),
            NOMINATION_HOW_WORDS[one.how],
            index === 0 ? "এখন বহাল" : null
          ),
          en: "",
        },
        value:
          one.nominees.length === 0
            ? "কোনো নমিনি নেই"
            : paperNominees(one, one.signedOn)
                .map((nominee) => {
                  const row = nomineeRowOf(nominee);
                  return joined(
                    row.name,
                    row.relation,
                    row.born ? `জন্ম ${row.born}` : null,
                    row.phone,
                    `অংশ ${row.share}`,
                    row.receiver ? `গ্রহণকারী ${row.receiver}` : null
                  );
                })
                .join("; "),
      }))
    ),
    facts(
      { bn: "আপনার চুক্তি", en: "Your Agreements" },
      money.agreements.map((one) => ({
        label: { bn: one.venture.name, en: "" },
        value: joined(
          `${inBangla(one.units)} ইউনিট, ${taka(one.promisedBdt)}`,
          `আপনার অংশ ${inBangla(one.investorsPercent)}%`,
          `সময় ${onDay(one.targetWindow.start)} – ${onDay(one.targetWindow.end)}`,
          one.amendedOn ? `সংশোধিত ${onDay(one.amendedOn)}` : null,
          `সই ${when(one.signedAt)}`,
          `স্ট্যাম্প ${one.stamp.serial} (${taka(one.stamp.valueBdt)}, ${onDay(one.stamp.on)})`,
          `সালিস ${one.arbitrator}`,
          one.hasPaper ? "সই করা চুক্তির ছবি খামারে রাখা আছে" : null,
          `খামারে মূলধন ${taka(one.capitalHeldBdt)}`,
          one.settlement ? settlementWords(one.settlement) : null
        ),
      }))
    ),
    facts(
      { bn: "আপনার টাকার লেনদেন", en: "Your money moved" },
      money.movements.map((one) => ({
        label: { bn: onDay(one.movedOn), en: "" },
        value: joined(
          MOVEMENT_NAMES[one.kind].bn,
          taka(one.amountBdt),
          ventureOf.get(one.agreementId),
          one.reference
        ),
      }))
    ),
    facts(
      { bn: "আপনার জন্য তৈরি কাগজ", en: "Papers made for you" },
      papers.map((one) => {
        const { paper } = fieldsOf(one.after);
        return {
          label: { bn: when(one.at), en: "" },
          value: joined(
            isTheirPaper(paper) ? PAPER_NAMES[paper].bn : String(paper ?? ""),
            one.by
          ),
        };
      })
    ),
    facts({ bn: "ভেঞ্চারে যোগ দেওয়ার অনুরোধ", en: "Your Requests to Join" }, [
      ...requests.map((one) => ({
        label: { bn: one.ventureName, en: "" },
        value: joined(
          `${inBangla(one.units)} ইউনিট`,
          bn(`ventures.requests.state.${one.state}`),
          one.note ? `“${one.note}”` : null,
          one.answerLine
        ),
      })),
      ...requestChanges.map((one) => ({
        label: { bn: when(one.at), en: "" },
        value: joined(
          one.ventureName,
          bn(`ventures.requests.kind.${one.kind}`, {
            units: inBangla(one.units),
          })
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
        access ? when(access.invitedAt) : null
      ),
      ...linesFor(
        { bn: "প্রথম সাইন ইন", en: "First signed in" },
        access?.acceptedAt ? when(access.acceptedAt) : null
      ),
      ...linesFor(
        { bn: "শেষ এসেছেন", en: "Last in" },
        access?.lastSeenAt ? when(access.lastSeenAt) : null
      ),
      ...linesFor(
        { bn: "প্রবেশাধিকার তুলে নেওয়া", en: "Access taken away" },
        access?.revokedAt
          ? joined(
              when(access.revokedAt),
              access.revokedWhy ? TAKEN_AWAY_WHY[access.revokedWhy] : null
            )
          : null
      ),
      ...(consents.length === 0
        ? linesFor({ bn: "সম্মতি", en: "Consent" }, "কোনো সম্মতি রেকর্ড নেই")
        : consents.map((one) => ({
            label: { bn: "সম্মতি", en: "Consent" },
            value: joined(
              bn("portal.consent.signed", {
                when: onDay(farmDayOf(one.signedOn)),
                version: inBangla(one.version),
              }),
              one.withdrawnOn
                ? joined(
                    `তুলে নেওয়া ${onDay(farmDayOf(one.withdrawnOn))}`,
                    one.withdrawnHow
                      ? bn(`portal.howLine.${one.withdrawnHow}`)
                      : null
                  )
                : "বহাল"
            ),
          }))),
      ...places.map((one) => ({
        label: { bn: "এখন সাইন ইন", en: "Signed in now" },
        value: joined(`${when(one.since)} থেকে`, one.browser, one.from),
      })),
    ]),
    facts(
      { bn: "আপনার সম্পর্কে প্রতিটি বদল", en: "Every change about you" },
      changes.flatMap((one) =>
        isTrailed(one.entity)
          ? [
              {
                label: { bn: when(one.at), en: "" },
                value: joined(
                  TRAILED[one.entity].what,
                  bn(`audit.action.${one.action}`),
                  one.by,
                  whatChanged(one.entity, one.before, one.after)
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
    preamble: {
      bn: `${them.name}, ${onDay(farmDayOf(now))} পর্যন্ত খামার আপনার সম্পর্কে যা রাখে তার সবকিছু। প্রথমে আছে খামার তা কেন ও কীভাবে রাখে।`,
      en: "",
    },
    sections,
    closing: [],
    produced: `${producedAt(now, "bn")} · ${context.actor.name}`,
  };
};
