import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { notifiableDisease } from "@OpenFarm/db/schema/health";
import { notifiableLetter } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const name = z.object({
  bn: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).optional(),
});

/** The disease as it stands, for the trail to record either side of a change. */
const readDisease = async (tx: Tx, id: string) => {
  const row = await tx.query.notifiableDisease.findFirst({
    where: { id },
    columns: { nameBn: true, note: true, retiredAt: true },
  });
  return row ?? null;
};

/**
 * The letter itself, in Bangla, from what the farm already knows.
 *
 * Producing it is an Audit Event of its own — an export — because a letter that went to the
 * office is the farm's evidence, and "who printed it, and when" is part of that. The Vet may
 * take one too: the roles matrix gives them health reports to export.
 */
const buildLetter = async (
  context: Parameters<typeof audited>[0] & {
    farm: { id: string; name: string };
    actor: { name: string };
  },
  diagnosisId: string
) => {
  const found = await context.db.query.diagnosis.findFirst({
    where: { id: diagnosisId, farmId: context.farm.id },
    with: {
      animal: { columns: { tagNumber: true } },
      vet: { columns: { name: true } },
      report: { columns: { id: true, withdrawnAt: true } },
      /** What has been given for it, so the letter can say what the farm has already done. */
      prescriptions: {
        with: { product: { columns: { nameBn: true } } },
      },
    },
  });
  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "No such diagnosis" });
  }
  if (!found.report || found.report.withdrawnAt) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "That diagnosis is not one the farm's list says must be reported",
      data: { refusal: "not_notifiable" },
    });
  }
  const now = context.clock.now();
  return {
    reportId: found.report.id,
    text: notifiableLetter({
      farmName: context.farm.name,
      tagNumber: found.animal.tagNumber,
      disease: found.disease,
      diagnosedOn: formatDate(found.diagnosedAt, "bn", "date"),
      vetName: found.vet.name,
      // What the farm has already done about it, which is what the office asks next.
      treatedWith: [
        ...new Set(found.prescriptions.map((one) => one.product.nameBn)),
      ],
      reportedByName: context.actor.name,
      reportedOn: formatDate(now, "bn", "date"),
    }),
  };
};

export const notifiableRouter = {
  /**
   * The letter for one notifiable Diagnosis, ready to print and take to the office.
   *
   * Every time it is produced is recorded: a report that was sent and cannot be evidenced is a
   * report that was not sent, and the farm's answer to "when did you write it" should not
   * depend on somebody remembering.
   */
  letter: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(z.object({ diagnosisId: z.string() }))
    .handler(async ({ context, input }) => {
      const { reportId, text } = await buildLetter(context, input.diagnosisId);
      await audited(context).write(
        {
          entity: "dls_report",
          entityId: reportId,
          action: "export",
          after: { diagnosisId: input.diagnosisId, characters: text.length },
        },
        () => Promise.resolve()
      );
      return { text };
    }),

  /**
   * The farm's notifiable-disease list: what must be reported to DLS without delay.
   *
   * Read by everyone who might diagnose or report; kept by the Owner, the Manager and the Vet
   * (roles matrix). Barn Staff have no business in it.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.notifiableDisease.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc" },
        with: { addedByPerson: { columns: { name: true } } },
      });
      return rows.map(({ addedByPerson, ...row }) => ({
        ...row,
        addedByName: addedByPerson?.name ?? null,
      }));
    }),

  /**
   * Adds a disease the office has confirmed is reportable.
   *
   * The schedule of the Animal Disease Rules could not be sourced, so this list is what the
   * Upazila Livestock Officer has told this farm — and the note is where that is written down,
   * because "why did you report this one" is a question with an answer.
   */
  add: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(z.object({ name, note: z.string().trim().max(300).optional() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const already = await context.db.query.notifiableDisease.findFirst({
        where: { farmId: context.farm.id, nameBn: input.name.bn },
        columns: { id: true, retiredAt: true },
      });
      if (already) {
        // Naming it again is how somebody puts back a disease the farm took off the list, so
        // say what is there rather than failing on an index nobody can read.
        throw new ORPCError("CONFLICT", {
          message: already.retiredAt
            ? "That disease is on the list, taken off; put it back rather than adding it twice"
            : "That disease is already on the list",
          data: { diseaseId: already.id, retired: Boolean(already.retiredAt) },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "notifiable_disease",
          entityId: id,
          action: "create",
          reason: input.note,
          after: { nameBn: input.name.bn, note: input.note ?? null },
        },
        (tx) =>
          tx.insert(notifiableDisease).values({
            id,
            farmId: context.farm.id,
            nameBn: input.name.bn,
            nameEn: input.name.en ?? null,
            note: input.note ?? null,
            addedBy: context.actor.id,
            addedByRole: context.roleUsed,
            createdAt: now,
          })
      );
      return { id };
    }),

  /** Takes a disease off the list, never out of it: a report made last year was made against
   *  the list as it stood then. */
  retire: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(z.object({ id: z.string(), reason: z.string().trim().max(300) }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "notifiable_disease",
          entityId: input.id,
          action: "update",
          reason: input.reason,
          before: (tx) => readDisease(tx, input.id),
          after: (tx) => readDisease(tx, input.id),
        },
        async (tx) => {
          const [changed] = await tx
            .update(notifiableDisease)
            .set({ retiredAt: now })
            .where(
              and(
                eq(notifiableDisease.id, input.id),
                eq(notifiableDisease.farmId, context.farm.id),
                isNull(notifiableDisease.retiredAt)
              )
            )
            .returning({ id: notifiableDisease.id });
          if (!changed) {
            throw new ORPCError("NOT_FOUND", {
              message: "No such disease on the list, or it is already off it",
            });
          }
        }
      );
      return { id: input.id };
    }),
};
