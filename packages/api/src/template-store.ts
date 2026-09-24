import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import {
  paperTemplate,
  paperTemplateVersion,
} from "@OpenFarm/db/schema/paper-template";
import { investmentAgreement } from "@OpenFarm/db/schema/venture";
import type { TemplateContent, TemplateKind } from "@OpenFarm/domain";
import { STANDARD_TEMPLATES, TEMPLATE_KINDS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";

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

/**
 * Gives the farm the standard wording for each kind of paper it has none for, as Version 1, published by nobody.
 *
 * The Investment Agreement's standard wording is what the farm printed before its wording could be edited, so every
 * Agreement signed then is recorded against it here — the one moment the farm can say which words those papers were.
 * The kinds actually given: two requests at once give each kind once.
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
    // Sequential: each kind's Template, then its first Version, then the Template pointed at it.
    // oxlint-disable-next-line no-await-in-loop
    const [made] = await tx
      .insert(paperTemplate)
      .values({ id: templateId, farmId, kind, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: paperTemplate.id });
    if (!made) {
      continue;
    }
    const versionId = uuidv7(now);
    // oxlint-disable-next-line no-await-in-loop
    await tx.insert(paperTemplateVersion).values({
      id: versionId,
      farmId,
      templateId,
      number: 1,
      content: STANDARD_TEMPLATES[kind],
      publishedAt: now,
    });
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(paperTemplate)
      .set({ currentVersionId: versionId })
      .where(eq(paperTemplate.id, templateId));
    if (kind === "investment_agreement") {
      // oxlint-disable-next-line no-await-in-loop
      await tx
        .update(investmentAgreement)
        .set({ templateVersionId: versionId })
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

class NothingToGiveError extends Error {
  constructor() {
    super("The standard wording was already given");
    this.name = "NothingToGiveError";
  }
}

/**
 * Gives the farm the standard wording it has not been given — the first time its papers' wording is opened, or the
 * first time a paper is printed or signed. Recorded as what was actually given; a request that finds it all there
 * writes nothing.
 */
export const giveStandardTemplates = async (
  context: Context & { farm: { id: string } }
): Promise<void> => {
  const missing = await kindsNotHad(context.db, context.farm.id);
  if (missing.length === 0) {
    return;
  }
  const now = context.clock.now();
  let given: TemplateKind[] = [];
  await audited(context)
    .write(
      {
        entity: "paper_template",
        entityId: context.farm.id,
        action: "create",
        after: () => Promise.resolve({ standard: given }),
      },
      async (tx) => {
        given = await addStandardTemplates(tx, context.farm.id, missing, now);
        if (given.length === 0) {
          throw new NothingToGiveError();
        }
      }
    )
    .catch((error: unknown) => {
      if (!(error instanceof NothingToGiveError)) {
        throw error;
      }
    });
};

/** The Version a kind of paper is printed and signed in now. The farm must have been given its wording first. */
export const currentWording = async (
  db: Pick<Tx, "query">,
  farmId: string,
  kind: TemplateKind
): Promise<Wording> => {
  const template = await db.query.paperTemplate.findFirst({
    where: { farmId, kind },
    with: { currentVersion: true },
  });
  if (!template?.currentVersion) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: `The farm has no wording for ${kind} yet`,
    });
  }
  return asWording(template.currentVersion);
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
