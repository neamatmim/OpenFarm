import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import {
  paperTemplate,
  paperTemplateVersion,
} from "@OpenFarm/db/schema/paper-template";
import { investmentAgreement } from "@OpenFarm/db/schema/venture";
import type { TemplateContent, TemplateKind } from "@OpenFarm/domain";
import {
  FIRST_PRINTED_AGREEMENT,
  NOMINATION_BEFORE_NOMINEE_NUMBERS,
  PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
  STANDARD_AGREEMENT_BEFORE_MONTHLY,
  STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS,
  STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS,
  SCHEDULE_BEFORE_ENGLISH_FACTS,
  AMENDMENT_BEFORE_ENGLISH_FACTS,
  PORTAL_CONSENT_BEFORE_ORGANIZATIONS,
  STANDARD_AGREEMENT_PAID_BY_THE_MONTH,
  STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
  STANDARD_TEMPLATES,
  TEMPLATE_KINDS,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import {
  NothingToDoError,
  giveStandardOnce,
  ignoreNothingToDo,
} from "./farm-list";
import { lockTheFarm } from "./venture-store";

/** One Version of a Template, as a paper is printed from it and the screen shows it. */
export interface Wording {
  versionId: string;
  number: number;
  content: TemplateContent;
  /** The lawyer who approved it and the day, or nothing until the Owner has written that down. */
  reviewedBy: string | null;
  reviewedOn: string | null;
}

const asWording = (row: {
  id: string;
  number: number;
  content: unknown;
  reviewedBy: string | null;
  reviewedOn: string | null;
}): Wording => ({
  versionId: row.id,
  number: row.number,
  content: row.content as TemplateContent,
  reviewedBy: row.reviewedBy,
  reviewedOn: row.reviewedOn,
});

/** The kinds of paper this farm has no wording for yet. */
const kindsNotHad = async (
  db: Pick<Tx, "query">,
  farmId: string
): Promise<TemplateKind[]> => {
  const had = await db.query.paperTemplate.findMany({
    where: { farmId },
    columns: { kind: true },
  });
  const have = new Set(had.map((one) => one.kind));
  return TEMPLATE_KINDS.filter((kind) => !have.has(kind));
};

/** Whether the farm has Agreements signed before its wording could be edited: recorded against no Version. */
const hasAgreementsInNoVersion = async (tx: Tx, farmId: string) =>
  Boolean(
    await tx.query.investmentAgreement.findFirst({
      where: { farmId, templateVersionId: { isNull: true } },
      columns: { id: true },
    })
  );

/**
 * The Versions a kind of paper is given, oldest first: the standard wording — and, for the Investment Agreement on a
 * farm with Agreements signed before its wording could be edited, the words those were printed in before it.
 */
const wordingsToGive = async (
  tx: Tx,
  farmId: string,
  kind: TemplateKind
): Promise<TemplateContent[]> =>
  kind === "investment_agreement" &&
  (await hasAgreementsInNoVersion(tx, farmId))
    ? [FIRST_PRINTED_AGREEMENT, STANDARD_TEMPLATES[kind]]
    : [STANDARD_TEMPLATES[kind]];

/**
 * Gives the farm the standard wording for each kind of paper it has none for, published by nobody, the standard in
 * force.
 *
 * Every Agreement signed before the wording could be edited is recorded here against the words the farm printed
 * then — Version 1, the standard following it as Version 2 — the one moment the farm can say which words those papers
 * were. The kinds actually given: two requests at once give each kind once.
 */
const addStandardTemplates = async (
  tx: Tx,
  farmId: string,
  kinds: readonly TemplateKind[],
  now: Date
): Promise<TemplateKind[]> => {
  const given: TemplateKind[] = [];
  for (const kind of kinds) {
    const templateId = uuidv7(now);
    // Sequential: each kind's Template, then its Versions in order, then the Template pointed at the last.
    // oxlint-disable-next-line no-await-in-loop
    const [made] = await tx
      .insert(paperTemplate)
      .values({ id: templateId, farmId, kind, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: paperTemplate.id });
    if (!made) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    const wordings = await wordingsToGive(tx, farmId, kind);
    const versions = wordings.map((content, index) => ({
      id: uuidv7(now),
      farmId,
      templateId,
      number: index + 1,
      content,
      publishedAt: now,
    }));
    // oxlint-disable-next-line no-await-in-loop
    await tx.insert(paperTemplateVersion).values(versions);
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(paperTemplate)
      .set({ currentVersionId: versions.at(-1)?.id })
      .where(eq(paperTemplate.id, templateId));
    if (kind === "investment_agreement") {
      // oxlint-disable-next-line no-await-in-loop
      await tx
        .update(investmentAgreement)
        .set({ templateVersionId: versions[0]?.id })
        .where(
          and(
            eq(investmentAgreement.farmId, farmId),
            isNull(investmentAgreement.templateVersionId)
          )
        );
    }
    given.push(kind);
  }
  return given;
};

/** A wording as the database keeps it: the same words in whatever order its keys come back. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b))
        )
      : inner
  );

/** What the 2026-10-05 standard adds: a lost animal made good, and the Farm's own capital — built on Claude's
 *  recommendation at the Owner's word, ahead of the advisers. */
const LOST_AND_FARM_CAPITAL =
  "A lost or stolen animal is made good by the Farm, and the Farm's own capital in a Venture is told to its Investors (2026-10-05, not yet seen by the advisers).";

/** What the 2026-10-08 standard adds: the lines for an Organization and its Signatory (ADR 0020), agreed by the
 *  advisers before it was built, the Owner said. A person's paper reads as it did. */
const ORGANIZATIONS =
  "An Organization may be an Investor through its Signatory: its papers print the Organization's lines in place of a person's death and Nominee lines; a person's read as before (2026-10-08, ADR 0020).";

/** What the second 2026-10-08 standard adds: a Nominee's NID, or a minor's birth registration, and a minor's
 *  Receiver's NID, held and printed — the Owner's decision, not yet read by the lawyer. */
const NOMINEE_NUMBERS =
  "Each Nominee gives their NID, a minor their birth registration, and a minor's Receiver their NID: the papers say the Farm holds them (2026-10-08, the Owner's decision, not yet read by the lawyer).";

/** What the third 2026-10-08 standard adds: each fact said in English beside its Bangla, for a paper read in English
 *  (ADR 0021). The Bangla is as it was. */
const ENGLISH_FACTS =
  "Each fact on the paper is said in English too, for a paper read in English; the Bangla is unchanged (2026-10-08, ADR 0021).";

/** The standard a farm is caught up to, as the trail names it. */
const CAUGHT_UP_TO = "english_facts";

/**
 * The standard wordings a farm may still be on exactly, kind by kind, oldest first, each with the note its catch-up
 * Version says why with. A wording the Owner changed or published herself is hers, and is never caught up.
 */
const EARLIER_STANDARDS: Partial<
  Record<TemplateKind, readonly { content: TemplateContent; note: string }[]>
> = {
  investment_agreement: [
    {
      content: STANDARD_AGREEMENT_BEFORE_MONTHLY,
      note: `OpenFarm's standard wording: the clauses for capital paid by the month, approved by the lawyer and the Shariah scholar on 2026-10-02, printed only on a Venture paid by the month. ${LOST_AND_FARM_CAPITAL} ${ORGANIZATIONS} ${NOMINEE_NUMBERS} ${ENGLISH_FACTS}`,
    },
    {
      content: STANDARD_AGREEMENT_PAID_BY_THE_MONTH,
      note: `OpenFarm's standard wording. ${LOST_AND_FARM_CAPITAL} ${ORGANIZATIONS} ${NOMINEE_NUMBERS} ${ENGLISH_FACTS}`,
    },
    {
      content: STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
      note: `OpenFarm's standard wording. ${ORGANIZATIONS} ${NOMINEE_NUMBERS} ${ENGLISH_FACTS}`,
    },
    {
      content: STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS,
      note: `OpenFarm's standard wording. ${NOMINEE_NUMBERS} ${ENGLISH_FACTS}`,
    },
    {
      content: STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS,
      note: `OpenFarm's standard wording. ${ENGLISH_FACTS}`,
    },
  ],
  venture_schedule: [
    {
      content: SCHEDULE_BEFORE_ENGLISH_FACTS,
      note: `OpenFarm's standard wording. ${ENGLISH_FACTS}`,
    },
  ],
  agreement_amendment: [
    {
      content: AMENDMENT_BEFORE_ENGLISH_FACTS,
      note: `OpenFarm's standard wording. ${ENGLISH_FACTS}`,
    },
  ],
  portal_consent: [
    {
      content: PORTAL_CONSENT_BEFORE_ORGANIZATIONS,
      note: `OpenFarm's standard wording. ${ORGANIZATIONS}`,
    },
  ],
  nomination: [
    {
      content: NOMINATION_BEFORE_NOMINEE_NUMBERS,
      note: `OpenFarm's standard wording. ${NOMINEE_NUMBERS}`,
    },
  ],
  privacy_notice: [
    {
      content: PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
      note: `OpenFarm's standard wording. ${NOMINEE_NUMBERS}`,
    },
  ],
};

/**
 * Catches a farm's paper of one kind up to the standard wording, when the wording in force is still exactly a standard
 * it was given before — the clauses for capital paid by the month added after it (2026-10-02), a lost animal and the
 * Farm's own capital (2026-10-05), an Organization's lines (2026-10-08), a Nominee's number (2026-10-08). A wording the Owner changed is hers, and is
 * left alone: she adds the clauses herself if she wants them. Published by nobody, as the standard first was, with a
 * note saying why; every paper already signed keeps the Version it was signed in.
 */
const catchUpTheStandard = async (
  context: Context & { farm: { id: string } },
  kind: TemplateKind
): Promise<void> => {
  const farmId = context.farm.id;
  const template = await context.db.query.paperTemplate.findFirst({
    where: { farmId, kind },
    with: { currentVersion: true },
  });
  const current = template?.currentVersion;
  // Given by nobody and never changed: the Owner publishing the same words herself is a choice of hers, and kept.
  const onStandard = (() => {
    if (!current || current.publishedBy !== null) {
      return null;
    }
    const words = canonical(current.content);
    return (
      EARLIER_STANDARDS[kind]?.find(
        (earlier) => canonical(earlier.content) === words
      ) ?? null
    );
  })();
  if (!(template && current && onStandard)) {
    return;
  }
  const { note } = onStandard;
  const now = context.clock.now();
  const versionId = uuidv7(now);
  await audited(context)
    .write(
      {
        entity: "paper_template",
        entityId: template.id,
        action: "update",
        after: () => Promise.resolve({ caughtUpTo: CAUGHT_UP_TO, versionId }),
        reason: note,
      },
      async (tx) => {
        // Behind the farm's lock and read again inside it: two requests at once catch it up once.
        await lockTheFarm(tx, farmId);
        const standing = await tx.query.paperTemplate.findFirst({
          where: { id: template.id },
          columns: { currentVersionId: true },
        });
        if (standing?.currentVersionId !== current.id) {
          throw new NothingToDoError();
        }
        await tx.insert(paperTemplateVersion).values({
          id: versionId,
          farmId,
          templateId: template.id,
          number: current.number + 1,
          content: STANDARD_TEMPLATES[kind],
          note,
          publishedAt: now,
        });
        await tx
          .update(paperTemplate)
          .set({ currentVersionId: versionId })
          .where(eq(paperTemplate.id, template.id));
      }
    )
    .catch(ignoreNothingToDo);
};

/** The kinds of paper whose standard has changed since a farm was first given it. */
const CAUGHT_UP_KINDS = Object.keys(EARLIER_STANDARDS) as TemplateKind[];

/**
 * Gives the farm the standard wording it has not been given — the first time its papers' wording is opened, or the
 * first time a paper is printed or signed. Recorded as what was actually given; a request that finds it all there
 * writes nothing.
 */
export const giveStandardTemplates = async (
  context: Context & { farm: { id: string } }
): Promise<void> => {
  await giveStandardOnce(context, {
    entity: "paper_template",
    missing: () => kindsNotHad(context.db, context.farm.id),
    give: (tx, kinds, now) =>
      addStandardTemplates(tx, context.farm.id, kinds, now),
  });
  // One at a time: each takes the farm's lock.
  for (const kind of CAUGHT_UP_KINDS) {
    // oxlint-disable-next-line no-await-in-loop
    await catchUpTheStandard(context, kind);
  }
};

/** The Version a kind of paper is in now on this farm, or nothing for a farm not yet given its wording. */
const inForce = async (
  db: Pick<Tx, "query">,
  farmId: string,
  kind: TemplateKind
): Promise<Wording | null> => {
  const template = await db.query.paperTemplate.findFirst({
    where: { farmId, kind },
    with: { currentVersion: true },
  });
  return template?.currentVersion ? asWording(template.currentVersion) : null;
};

/** The Version a kind of paper is printed and signed in now. The farm must have been given its wording first. */
export const currentWording = async (
  db: Pick<Tx, "query">,
  farmId: string,
  kind: TemplateKind
): Promise<Wording> => {
  const wording = await inForce(db, farmId, kind);
  if (!wording) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: `The farm has no wording for ${kind} yet`,
    });
  }
  return wording;
};

/**
 * The wording a kind of paper is in now — the standard wording for a farm not yet given any. Read without giving:
 * what somebody outside the farm reads never writes the farm's records.
 */
export const wordingInForce = async (
  db: Pick<Tx, "query">,
  farmId: string,
  kind: TemplateKind
): Promise<TemplateContent> => {
  const wording = await inForce(db, farmId, kind);
  return wording?.content ?? STANDARD_TEMPLATES[kind];
};

/** One Version by its id, on this farm. */
export const wordingById = async (
  db: Pick<Tx, "query">,
  farmId: string,
  versionId: string
): Promise<Wording> => {
  const version = await db.query.paperTemplateVersion.findFirst({
    where: { id: versionId, farmId },
  });
  if (!version) {
    throw new ORPCError("NOT_FOUND", { message: "No such wording" });
  }
  return asWording(version);
};

/** The wording an Agreement was signed in: its own Version, which every Agreement has once the farm has wording. */
export const wordingSignedIn = (
  db: Pick<Tx, "query">,
  farmId: string,
  agreement: { templateVersionId: string | null }
): Promise<Wording> =>
  agreement.templateVersionId
    ? wordingById(db, farmId, agreement.templateVersionId)
    : currentWording(db, farmId, "investment_agreement");

/** Every Template the farm has, with each Version it has published, newest first. */
export const templatesOf = async (db: Pick<Tx, "query">, farmId: string) => {
  const templates = await db.query.paperTemplate.findMany({
    where: { farmId },
    with: {
      versions: {
        columns: {
          id: true,
          number: true,
          content: true,
          note: true,
          publishedAt: true,
          reviewedBy: true,
          reviewedOn: true,
        },
        orderBy: { number: "desc" },
      },
    },
  });
  return TEMPLATE_KINDS.flatMap((kind) => {
    const template = templates.find((one) => one.kind === kind);
    if (!template) {
      return [];
    }
    const versions = template.versions.map((version) => ({
      ...asWording(version),
      note: version.note,
      publishedAt: version.publishedAt,
    }));
    const current = versions.find(
      (version) => version.versionId === template.currentVersionId
    );
    return current
      ? [{ kind, templateId: template.id, current, versions }]
      : [];
  });
};
