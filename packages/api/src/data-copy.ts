import { and, desc, eq, sql } from "@OpenFarm/db/operators";
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
import { farmDayOf, letterheadOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import { assertRegistered, exportedPaper } from "./export-store";
import { signedInOn } from "./membership";
import { producedAt } from "./paper-values";
import type { Owned } from "./portal-invitable";
import { refused } from "./portal-invitable";
import { theNoticeToRead } from "./portal-reads";
import { theirRequests, whatTheyDidToTheirRequests } from "./requests-to-join";
import { theirAgreements } from "./their-agreements";

// «খামারে আপনার তথ্য»: the copy of everything the farm holds on one Investor, which answers their written request for
// one (Personal Data Protection Act 2026 s.11) in minutes. The privacy notice's points come first, then the record as
// the farm keeps it — unmasked, since it is theirs — their Agreements and the money they moved, the papers made for
// them, their Requests to Join, their portal access, consent and sign-ins, and every change to their record. Made by
// the Owner from the Investor's page and handed over on paper; never offered in the portal.

/** The words for an Investor's copy of their data, as its title and in the trail. */
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

/** A message in both languages, for a label. */
const both = (key: MessageKey): Said => ({
  bn: translate("bn", key),
  en: translate("en", key),
});

/** One line of the paper, or nothing where the farm holds nothing for it. */
const row = (
  bn: string,
  en: string,
  value: string | null | undefined
): DocumentRow[] => (value?.trim() ? [{ label: { bn, en }, value }] : []);

/** What a part of the paper says where the farm holds nothing for it. */
const NONE: Said = { bn: "কিছু নেই", en: "None" };

/** A part of the paper that is facts, one to a line, saying so where there are none. */
const facts = (heading: Said, rows: DocumentRow[]): PaperSection => ({
  kind: "facts",
  heading,
  rows,
  note: rows.length === 0 ? NONE : null,
});

/** The papers the farm makes for an Investor, by the name the trail records them under. */
const PAPER_NAMES: Record<string, Said> = {
  joining_letter: both("portal.paper.joining"),
  progress_statement: both("portal.paper.progress"),
  settlement_statement: both("portal.paper.settlement"),
  agreement_draft: { bn: "চুক্তির খসড়া", en: "Agreement to sign" },
  amendment_draft: { bn: "সংশোধনী", en: "Amendment" },
  portal_consent: { bn: "পোর্টাল সম্মতিপত্র", en: "Portal Consent" },
  welcome_letter: { bn: "স্বাগত চিঠি", en: "Welcome Letter" },
  code_slip: { bn: "কোডের স্লিপ", en: "Code Slip" },
  data_copy: TITLE,
};

/** How each movement of their money is named. */
const MOVEMENT_NAMES = {
  capital_in: both("investors.page.move.capitalIn"),
  refund: both("investors.page.move.refund"),
  payout: both("investors.page.move.payout"),
} as const;

/** What each change to their record did. */
const ACTIONS: Record<string, string> = {
  create: "লেখা হয়েছে",
  update: "বদলানো হয়েছে",
  correct: "সংশোধন করা হয়েছে",
  retire: "বাদ দেওয়া হয়েছে",
  restore: "ফিরিয়ে আনা হয়েছে",
};

/** What they did to a Request, as the paper says it. */
const REQUEST_CHANGES = {
  made: "করা হয়েছে",
  changed: "বদলানো হয়েছে",
  withdrawn: "তুলে নেওয়া হয়েছে",
} as const;

/** Why their access was taken away, as the paper says it. */
const TAKEN_AWAY_WHY: Record<string, string> = {
  withdrew_consent: "আপনি সম্মতি তুলে নিয়েছেন",
  lost_phone: "ফোন হারানো",
  owner: "খামারের সিদ্ধান্ত",
};

/** Each field of their record, as the paper names it. */
const FIELDS: Record<string, string> = {
  name: "নাম",
  phone: "ফোন",
  address: "ঠিকানা",
  nid: "এনআইডি",
  bankAccount: "ব্যাংক হিসাব",
  nominee: "নমিনির নাম",
  nomineePhone: "নমিনির ফোন",
  nomineeRelation: "নমিনির সম্পর্ক",
  retiredAt: "বাদ দেওয়া হয়েছে",
};

/** A snapshot's field as the paper writes it. */
const fieldWords = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
};

/** What one change did to their record: each field it touched, what it was and what it became. */
const whatChanged = (before: unknown, after: unknown) => {
  const was = (before ?? {}) as Record<string, unknown>;
  const now = (after ?? {}) as Record<string, unknown>;
  return Object.keys(FIELDS)
    .filter((field) => fieldWords(was[field]) !== fieldWords(now[field]))
    .map(
      (field) =>
        `${FIELDS[field]}: ${fieldWords(was[field])} → ${fieldWords(now[field])}`
    )
    .join("; ");
};

/** Every paper the farm made for them, whoever made it and whatever it is filed against, the latest first. */
const papersMadeFor = (db: Pick<Tx, "select">, farmId: string, id: string) =>
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
        sql`${auditEvent.after}->>'investorId' = ${id}`
      )
    )
    .orderBy(desc(auditEvent.receivedAt), desc(auditEvent.id));

/** Every change to their record itself, the latest first: who made it, and what it did. */
const changesToTheirRecord = (
  db: Pick<Tx, "select">,
  farmId: string,
  id: string
) =>
  db
    .select({
      at: auditEvent.receivedAt,
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
        eq(auditEvent.entity, "investor"),
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

/**
 * The copy of everything the farm holds on one Investor, laid out to print and hand over: the notice's points first,
 * then their record unmasked, their Agreements, the money they moved, the papers made for them, their Requests to
 * Join and each change they made, their portal access, consents and sign-ins, and every change to their record. An
 * Export on the Investor. Refused while the notice has a fact unwritten: its points are the paper's first page.
 */
export const copyOfTheirData = async (
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
  const [money, papers, requests, requestChanges, access, consents, changes] =
    await Promise.all([
      theirAgreements(db, farm.id, investorId, farmDayOf(now)),
      papersMadeFor(db, farm.id, investorId),
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
      changesToTheirRecord(db, farm.id, investorId),
    ]);
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
      ...row("নাম", "Name", them.name),
      ...row("ফোন", "Phone", them.phone),
      ...row("ঠিকানা", "Address", them.address),
      ...row("এনআইডি", "NID", them.nid),
      ...row("ব্যাংক হিসাব", "Bank account", them.bankAccount),
      ...row("নমিনি", "Nominee", them.nomineeName),
      ...row("নমিনির সম্পর্ক", "Nominee's relation", them.nomineeRelation),
      ...row("নমিনির ফোন", "Nominee's phone", them.nomineePhone),
      ...row("লেখা হয়েছে", "Recorded", when(them.createdAt)),
      ...row(
        "বাদ দেওয়া হয়েছে",
        "Retired",
        them.retiredAt ? when(them.retiredAt) : null
      ),
    ]),
    facts(
      { bn: "আপনার চুক্তি", en: "Your Agreements" },
      money.agreements.map((one) => ({
        label: { bn: one.venture.name, en: "" },
        value: [
          `${inBangla(one.units)} ইউনিট, ${taka(one.promisedBdt)}`,
          `আপনার অংশ ${inBangla(one.investorsPercent)}%`,
          `সময় ${onDay(one.targetWindow.start)} – ${onDay(one.targetWindow.end)}`,
          `সই ${when(one.signedAt)}`,
          `স্ট্যাম্প ${one.stamp.serial} (${taka(one.stamp.valueBdt)}, ${onDay(one.stamp.on)})`,
          `সালিস ${one.arbitrator}`,
          `খামারে মূলধন ${taka(one.capitalHeldBdt)}`,
        ].join(" · "),
      }))
    ),
    facts(
      { bn: "আপনার টাকার লেনদেন", en: "Your money moved" },
      money.movements.map((one) => ({
        label: { bn: onDay(one.movedOn), en: "" },
        value: [
          MOVEMENT_NAMES[one.kind].bn,
          taka(one.amountBdt),
          ventureOf.get(one.agreementId) ?? "",
          one.reference ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      }))
    ),
    facts(
      { bn: "আপনার জন্য তৈরি কাগজ", en: "Papers made for you" },
      papers.map((one) => {
        const paper = String(
          (one.after as { paper?: unknown } | null)?.paper ?? ""
        );
        return {
          label: { bn: when(one.at), en: "" },
          value: [PAPER_NAMES[paper]?.bn ?? paper, one.by ?? ""]
            .filter(Boolean)
            .join(" · "),
        };
      })
    ),
    facts({ bn: "ভেঞ্চারে যোগ দেওয়ার অনুরোধ", en: "Your Requests to Join" }, [
      ...requests.map((one) => ({
        label: { bn: one.ventureName, en: "" },
        value: [
          `${inBangla(one.units)} ইউনিট`,
          translate("bn", `ventures.requests.state.${one.state}`),
          one.note ? `“${one.note}”` : "",
          one.answerLine ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
      ...requestChanges.map((one) => ({
        label: { bn: when(one.at), en: "" },
        value: `${one.ventureName} · ${REQUEST_CHANGES[one.kind]} · ${inBangla(one.units)} ইউনিট`,
      })),
    ]),
    facts({ bn: "পোর্টাল", en: "The portal" }, [
      ...row(
        "সাইন ইনের ফোন",
        "Signs in with",
        access ? access.loginEmail.split("@")[0] : null
      ),
      ...row("আমন্ত্রণ", "Invited", access ? when(access.invitedAt) : null),
      ...row(
        "প্রথম সাইন ইন",
        "First signed in",
        access?.acceptedAt ? when(access.acceptedAt) : null
      ),
      ...row(
        "শেষ এসেছেন",
        "Last in",
        access?.lastSeenAt ? when(access.lastSeenAt) : null
      ),
      ...row(
        "প্রবেশাধিকার তুলে নেওয়া",
        "Access taken away",
        access?.revokedAt
          ? [when(access.revokedAt), TAKEN_AWAY_WHY[access.revokedWhy ?? ""]]
              .filter(Boolean)
              .join(" · ")
          : null
      ),
      ...(consents.length === 0
        ? row("সম্মতি", "Consent", "কোনো সম্মতি রেকর্ড নেই")
        : consents.map((one) => ({
            label: { bn: "সম্মতি", en: "Consent" },
            value: [
              `সই ${onDay(farmDayOf(one.signedOn))}`,
              `ভাষার সংস্করণ ${inBangla(one.version)}`,
              one.withdrawnOn
                ? `তুলে নেওয়া ${onDay(farmDayOf(one.withdrawnOn))}`
                : "বহাল",
            ].join(" · "),
          }))),
      ...places.map((one) => ({
        label: { bn: "এখন সাইন ইন", en: "Signed in now" },
        value: [`${when(one.since)} থেকে`, one.browser ?? "", one.from ?? ""]
          .filter(Boolean)
          .join(" · "),
      })),
    ]),
    facts(
      { bn: "আপনার রেকর্ডে প্রতিটি বদল", en: "Every change to your record" },
      changes.map((one) => ({
        label: { bn: when(one.at), en: "" },
        value: [
          ACTIONS[one.action] ?? one.action,
          one.by ?? "",
          whatChanged(one.before, one.after),
        ]
          .filter(Boolean)
          .join(" · "),
      }))
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
