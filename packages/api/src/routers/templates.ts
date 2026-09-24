import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import {
  paperTemplate,
  paperTemplateVersion,
} from "@OpenFarm/db/schema/paper-template";
import {
  TEMPLATE_FIELDS,
  farmDayOf,
  namedFields,
  paperFrom,
  templateProblems,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { exportedPaper } from "../export-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { paperValues, producedAt } from "../paper-values";
import { languageOf } from "../reader-language";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import { templateContentSchema, templateKindSchema } from "../template-content";
import { giveStandardTemplates, templatesOf } from "../template-store";

/** A fact of the paper's own, named in square brackets where it will go. */
const named = (field: keyof typeof TEMPLATE_FIELDS) =>
  `[${TEMPLATE_FIELDS[field].bn}]`;

/** A Version as the trail keeps it: which it is, and whether a lawyer's approval is written on it. */
const readVersion = async (tx: Tx, farmId: string, versionId: string) =>
  (await tx.query.paperTemplateVersion.findFirst({
    where: { id: versionId, farmId },
    columns: { number: true, reviewedBy: true, reviewedOn: true },
  })) ?? null;

/**
 * The wording of the papers an Investor signs: the Owner's alone to read and to change, as every paper to an Investor
 * is. Changing it publishes the next Version; the Agreements already signed keep the Version they were signed in.
 */
export const templatesRouter = {
  /** Each kind of paper with the Version it is printed in now and every Version before it. */
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .handler(async ({ context }) => {
      await giveStandardTemplates(context);
      return templatesOf(context.db, context.farm.id);
    }),

  /**
   * Publishes the next Version of a kind of paper, which every paper of that kind is printed and signed in from now.
   * Refused while anything in it would print wrong: a field that kind of paper does not have, Bangla left empty, a
   * part missing or given twice. A new Version has no lawyer's approval, whatever the one before it had.
   */
  publish: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        kind: templateKindSchema,
        content: templateContentSchema,
        note: z.string().trim().max(400).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const problems = templateProblems(input.kind, input.content);
      if (problems.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This wording cannot be published yet",
          data: { refusal: "template_problems", problems },
        });
      }
      await giveStandardTemplates(context);
      const farmId = context.farm.id;
      const now = context.clock.now();
      const versionId = uuidv7(now);
      const template = await context.db.query.paperTemplate.findFirst({
        where: { farmId, kind: input.kind },
        columns: { id: true },
      });
      if (!template) {
        throw new ORPCError("NOT_FOUND");
      }
      let number = 0;
      await audited(context).write(
        {
          entity: "paper_template",
          entityId: template.id,
          action: "update",
          before: () => Promise.resolve(null),
          after: (tx) => readVersion(tx, farmId, versionId),
          reason: input.note,
        },
        async (tx) => {
          const [latest] = await tx.query.paperTemplateVersion.findMany({
            where: { templateId: template.id },
            columns: { number: true },
            orderBy: { number: "desc" },
            limit: 1,
          });
          number = (latest?.number ?? 0) + 1;
          await tx.insert(paperTemplateVersion).values({
            id: versionId,
            farmId,
            templateId: template.id,
            number,
            content: input.content,
            note: input.note ?? null,
            publishedBy: context.actor.id,
            publishedByRole: context.roleUsed,
            publishedAt: now,
          });
          await tx
            .update(paperTemplate)
            .set({ currentVersionId: versionId })
            .where(eq(paperTemplate.id, template.id));
        }
      );
      return { versionId, number };
    }),

  /**
   * A kind of paper laid out in some wording — published or still being written — with the farm's own facts in it and
   * every fact of the paper's own named in square brackets where it will go: what the Owner reads before publishing,
   * and what the lawyer is handed to approve. Its trail line says which kind, since a printed one leaves the farm.
   */
  preview: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({ kind: templateKindSchema, content: templateContentSchema })
    )
    .handler(async ({ context, input }) => {
      const language = await languageOf(context.db, context.actor.id);
      const document = paperFrom(input.content, {
        parties: {
          farm: context.farm,
          ownerName: context.actor.name,
          investors: [
            {
              name: named("investorName"),
              phone: named("investorPhone"),
              address: named("investorAddress"),
              nid: named("investorNid"),
              nominee: null,
            },
          ],
        },
        values: {
          ...namedFields(input.kind),
          ...paperValues({ farm: context.farm, ownerName: context.actor.name }),
        },
        producedBy: context.actor.name,
        producedAt: producedAt(context.clock.now(), language),
      });
      await audited(context).write(
        {
          entity: "paper_template",
          entityId: context.farm.id,
          action: "export",
          after: exportedPaper(context.farm, "template_preview", {
            kind: input.kind,
          }),
        },
        () => Promise.resolve()
      );
      return { document };
    }),

  /**
   * Writes onto a Version that a lawyer approved its wording: who, and the day. Once — an approval is a fact about a
   * day and a person, and a second one would be a different Version's business. Refused for a day not yet come.
   */
  recordReview: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        versionId: z.string(),
        reviewedBy: z.string().trim().min(1).max(200),
        reviewedOn: farmDay,
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      if (input.reviewedOn > farmDayOf(context.clock.now())) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A lawyer cannot have approved it on a day still to come",
          data: { refusal: "reviewed_in_the_future" },
        });
      }
      await audited(context).write(
        {
          entity: "paper_template_version",
          entityId: input.versionId,
          action: "update",
          before: (tx) => readVersion(tx, farmId, input.versionId),
          after: (tx) => readVersion(tx, farmId, input.versionId),
        },
        async (tx) => {
          const [written] = await tx
            .update(paperTemplateVersion)
            .set({
              reviewedBy: input.reviewedBy,
              reviewedOn: input.reviewedOn,
              reviewRecordedBy: context.actor.id,
            })
            .where(
              and(
                eq(paperTemplateVersion.id, input.versionId),
                eq(paperTemplateVersion.farmId, farmId),
                isNull(paperTemplateVersion.reviewedOn)
              )
            )
            .returning({ id: paperTemplateVersion.id });
          if (!written) {
            const exists = await tx.query.paperTemplateVersion.findFirst({
              where: { id: input.versionId, farmId },
              columns: { id: true },
            });
            throw exists
              ? new ORPCError("CONFLICT", {
                  message:
                    "A lawyer's approval is already written on this wording",
                  data: { refusal: "already_reviewed" },
                })
              : new ORPCError("NOT_FOUND");
          }
        }
      );
      return { versionId: input.versionId };
    }),
};
