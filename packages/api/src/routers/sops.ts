import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import {
  sopDefinition,
  sopProposal,
  sopTraining,
  sopVersion,
} from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import {
  findPublishBlockers,
  mayBePrescribed,
  whyNotPrescribable,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { tell } from "../notice";
import { requirePersonalSession, requireRole } from "../roles";
import {
  asSopContent,
  publishedContent,
  sopContentSchema,
} from "../sop-content";

const note = z.string().trim().max(400).optional();

/**
 * A campaign names the product it gives every animal in the Pen. That product has to be on
 * the farm's own Drug List and have its withdrawal days written down — otherwise the campaign
 * would put milk in the tank that nobody could call safe, and the shed would find out about it
 * with the syringe in hand rather than the Owner finding out here.
 *
 * Checked when the Version is published, because a Version is immutable and this is the moment
 * it becomes the farm's word. Days cleared afterwards cannot happen: nothing on the farm
 * clears them.
 */
const assertProductsMayBeGiven = async (
  tx: Tx,
  farmId: string,
  content: SopContent
): Promise<void> => {
  const named = content.steps.flatMap((step) =>
    step.effect?.kind === "treatment" && step.effect.productId
      ? [step.effect.productId]
      : []
  );
  if (named.length === 0) {
    return;
  }
  const known = await tx.query.drugProduct.findMany({
    where: { farmId, id: { in: named } },
    columns: {
      id: true,
      nameBn: true,
      milkWithdrawalDays: true,
      meatWithdrawalDays: true,
      retiredAt: true,
    },
  });
  for (const productId of named) {
    const product = known.find((row) => row.id === productId);
    if (!product) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That product is not on the farm's drug list",
        data: { refusal: "no_such_product" },
      });
    }
    if (!mayBePrescribed(product)) {
      throw new ORPCError("BAD_REQUEST", {
        message: `${product.nameBn} has no withdrawal days written down, so a campaign cannot give it`,
        data: { refusal: whyNotPrescribable(product) },
      });
    }
  }
};

/**
 * The farm has one procedure for each act that raises its own work: one it treats with, one it
 * reports with.
 *
 * Those acts raise their work against the SOP that says they raise it, and with two of those the
 * farm would have to pick — silently, by some rule nobody asked for, and differently from the one
 * the Owner had in mind. Retiring the old one first is how a farm changes how it treats or how it
 * reports, and that is the same act as changing anything else in the Playbook.
 */
const RAISED_BY_AN_ACT = [
  {
    kind: "prescription" as const,
    refusal: "treatment_sop_exists",
    message:
      "The farm already has a procedure a prescription raises; retire that one first",
  },
  {
    kind: "notifiable_disease" as const,
    refusal: "report_sop_exists",
    message:
      "The farm already has a procedure a notifiable diagnosis raises; retire that one first",
  },
];

const assertOneSuchProcedure = async (
  tx: Tx,
  farmId: string,
  definitionId: string,
  content: SopContent
): Promise<void> => {
  const raising = RAISED_BY_AN_ACT.filter((act) =>
    content.triggers.some((trigger) => trigger.kind === act.kind)
  );
  if (raising.length === 0) {
    return;
  }
  const live = await tx.query.sopDefinition.findMany({
    where: { farmId, retiredAt: { isNull: true } },
    columns: { id: true },
    with: { currentVersion: { columns: { content: true } } },
  });
  for (const act of raising) {
    const already = live.find(
      (definition) =>
        definition.id !== definitionId &&
        publishedContent(definition)?.triggers.some(
          (trigger) => trigger.kind === act.kind
        )
    );
    if (already) {
      throw new ORPCError("CONFLICT", {
        message: act.message,
        data: { refusal: act.refusal, definitionId: already.id },
      });
    }
  }
};

/** Publishing is the only way an SOP's content changes: a new immutable Version, and the
 *  Definition pointed at it. Nothing ever rewrites a published Version (ADR 0001). */
const publishVersion = async (
  tx: Tx,
  {
    farmId,
    definitionId,
    content,
    note: publishNote,
    actorId,
    roleUsed,
    now,
  }: {
    farmId: string;
    definitionId: string;
    content: SopContent;
    note?: string;
    actorId: string;
    roleUsed: string | null;
    now: Date;
  }
): Promise<{ id: string; number: number }> => {
  const blockers = findPublishBlockers(content);
  if (blockers.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: `This cannot be published yet — ${blockers.join("; ")}`,
      data: { blockers },
    });
  }
  await assertProductsMayBeGiven(tx, farmId, content);
  await assertOneSuchProcedure(tx, farmId, definitionId, content);
  const previous = await tx.query.sopVersion.findMany({
    where: { definitionId },
    columns: { number: true },
    orderBy: { number: "desc" },
    limit: 1,
  });
  const number = (previous[0]?.number ?? 0) + 1;
  const id = uuidv7(now);
  await tx.insert(sopVersion).values({
    id,
    farmId,
    definitionId,
    number,
    content,
    note: publishNote ?? null,
    publishedBy: actorId,
    publishedByRole: roleUsed as never,
    publishedAt: now,
  });
  await tx
    .update(sopDefinition)
    .set({ currentVersionId: id })
    .where(
      and(eq(sopDefinition.id, definitionId), eq(sopDefinition.farmId, farmId))
    );

  // Everybody whose Role does this work is told a new Version exists. It is written to the
  // farm's notification list and shown in-app, and it is deliberately not pushed: a changed
  // procedure costs nothing if it is read at six in the morning, and Push is for what costs
  // money or breaks a deadline. Ticket 23 batches notices like this into the morning and
  // evening digests. What actually changed is shown on the work itself, the first time the
  // person opens it.
  if (number > 1) {
    await tell(
      tx,
      farmId,
      {
        kind: "sop_published",
        about: { id, assignedRole: content.assignedRole },
        facts: {
          sopBn: content.name.bn,
          sopEn: content.name.en ?? content.name.bn,
          number,
        },
      },
      now
    );
  }
  return { id, number };
};

export const sopsRouter = {
  /** The Playbook: every SOP with the Version in force. */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) =>
      context.db.query.sopDefinition.findMany({
        where: { farmId: context.farm.id },
        with: { currentVersion: true },
        orderBy: { createdAt: "asc" },
      })
    ),

  get: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.sopDefinition.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        with: {
          currentVersion: true,
          versions: {
            columns: { id: true, number: true, publishedAt: true, note: true },
          },
        },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      return row;
    }),

  /** Any Version, by its number — what the farm shows when asked what was in force. */
  version: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({ definitionId: z.string(), number: z.number().int().min(1) })
    )
    .handler(async ({ context, input }) => {
      const row = await context.db.query.sopVersion.findFirst({
        where: {
          farmId: context.farm.id,
          definitionId: input.definitionId,
          number: input.number,
        },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND");
      }
      return row;
    }),

  /** Creates the SOP and publishes its first Version in one act. */
  create: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ content: sopContentSchema, note }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const definitionId = uuidv7(now);
      let published = { id: "", number: 0 };
      await audited(context).write(
        {
          entity: "sop",
          entityId: definitionId,
          action: "create",
          after: { name: input.content.name, version: 1 },
          reason: input.note,
        },
        async (tx) => {
          await tx.insert(sopDefinition).values({
            id: definitionId,
            farmId: context.farm.id,
            createdBy: context.actor.id,
            createdAt: now,
          });
          published = await publishVersion(tx, {
            farmId: context.farm.id,
            definitionId,
            content: asSopContent(input.content),
            note: input.note,
            actorId: context.actor.id,
            roleUsed: context.roleUsed,
            now,
          });
        }
      );
      return {
        definitionId,
        versionId: published.id,
        number: published.number,
      };
    }),

  /** Publishes the next Version. The previous one is untouched. */
  publish: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(
      z.object({ definitionId: z.string(), content: sopContentSchema, note })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let published = { id: "", number: 0 };
      await audited(context).write(
        {
          entity: "sop",
          entityId: input.definitionId,
          action: "update",
          before: async (tx) => {
            const row = await tx.query.sopDefinition.findFirst({
              where: { id: input.definitionId },
              with: { currentVersion: { columns: { number: true } } },
            });
            return { version: row?.currentVersion?.number ?? null };
          },
          after: async (tx) => {
            const row = await tx.query.sopDefinition.findFirst({
              where: { id: input.definitionId },
              with: { currentVersion: { columns: { number: true } } },
            });
            return { version: row?.currentVersion?.number ?? null };
          },
          reason: input.note,
        },
        async (tx) => {
          const definition = await tx.query.sopDefinition.findFirst({
            where: { id: input.definitionId, farmId: context.farm.id },
            columns: { id: true, retiredAt: true },
          });
          if (!definition) {
            throw new ORPCError("NOT_FOUND");
          }
          if (definition.retiredAt) {
            throw new ORPCError("BAD_REQUEST", {
              message: "This SOP has been retired",
            });
          }
          published = await publishVersion(tx, {
            farmId: context.farm.id,
            definitionId: input.definitionId,
            content: asSopContent(input.content),
            note: input.note,
            actorId: context.actor.id,
            roleUsed: context.roleUsed,
            now,
          });
        }
      );
      return {
        definitionId: input.definitionId,
        versionId: published.id,
        number: published.number,
      };
    }),

  /** A Manager's suggested change. It changes nothing until the Owner approves it. */
  /**
   * The SOP Card: the published Version as it goes on the shed wall — what it is for, the
   * Steps in order, and what each one records. It names its own Version and the day it was
   * published, so a card somebody printed in March can be checked against the Playbook
   * rather than trusted.
   */
  card: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ definitionId: z.string() }))
    .handler(async ({ context, input }) => {
      const definition = await context.db.query.sopDefinition.findFirst({
        where: { id: input.definitionId, farmId: context.farm.id },
        with: { currentVersion: true },
      });
      if (!definition?.currentVersion) {
        throw new ORPCError("NOT_FOUND", {
          message: "That SOP has no published version yet",
        });
      }
      const content = definition.currentVersion.content as SopContent;
      return {
        definitionId: definition.id,
        versionId: definition.currentVersion.id,
        number: definition.currentVersion.number,
        publishedAt: definition.currentVersion.publishedAt,
        name: content.name,
        purpose: content.purpose,
        assignedRole: content.assignedRole,
        checkerRole: content.checkerRole,
        wholeFarm: content.wholeFarm === true,
        triggers: content.triggers,
        steps: content.steps,
      };
    }),

  /**
   * Who has been taught what, for one SOP. `asOf` answers the question the farm actually
   * asks — "did they know this procedure on the day it went wrong" — by cutting the list at
   * that date and saying which Version was in force by then.
   */
  training: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        definitionId: z.string(),
        asOf: z.coerce.date().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.sopTraining.findMany({
        where: {
          farmId: context.farm.id,
          definitionId: input.definitionId,
          ...(input.asOf ? { trainedAt: { lte: input.asOf } } : {}),
        },
        orderBy: { trainedAt: "desc" },
        with: {
          version: { columns: { number: true, publishedAt: true } },
          person: { columns: { name: true } },
        },
      });
      return rows.map(({ version, person, ...row }) => ({
        ...row,
        versionNumber: version.number,
        versionPublishedAt: version.publishedAt,
        personName: person?.name ?? null,
      }));
    }),

  /**
   * Records that a person was taught this Version. Never a flag: the farm keeps what was
   * taught and when, so "who knew which procedure" can be answered for any date, including
   * the day something went wrong.
   */
  recordTraining: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), versionId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const version = await context.db.query.sopVersion.findFirst({
        where: { id: input.versionId, farmId: context.farm.id },
        columns: { id: true, definitionId: true, number: true },
      });
      if (!version) {
        throw new ORPCError("NOT_FOUND", { message: "No such version" });
      }
      // Somebody on this farm, and not somebody it has let go: training is a fact about the
      // people who do the work here.
      const person = await context.db.query.user.findFirst({
        where: { id: input.userId },
        columns: { id: true, disabledAt: true },
      });
      const roles = await context.db.query.roleAssignment.findMany({
        where: {
          farmId: context.farm.id,
          userId: input.userId,
          ...ACTIVE_ROLE,
        },
        columns: { role: true },
      });
      if (!person || person.disabledAt || roles.length === 0) {
        throw new ORPCError("NOT_FOUND", {
          message: "That is not somebody who works on this farm",
        });
      }
      // Already taught this Version: nothing changed, so nothing is written — least of all
      // an Audit Event saying something did.
      const already = await context.db.query.sopTraining.findFirst({
        where: { versionId: version.id, userId: input.userId },
        columns: { id: true },
      });
      if (already) {
        return { id: already.id, versionNumber: version.number, taught: false };
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "sop_training",
          entityId: id,
          action: "create",
          after: async (tx) => {
            const row = await tx.query.sopTraining.findFirst({
              where: { id },
              columns: { userId: true, versionId: true, trainedAt: true },
            });
            return row ?? null;
          },
        },
        async (tx) => {
          const [saved] = await tx
            .insert(sopTraining)
            .values({
              id,
              farmId: context.farm.id,
              definitionId: version.definitionId,
              versionId: version.id,
              userId: input.userId,
              trainedBy: context.actor.id,
              trainedByRole: context.roleUsed,
              trainedAt: now,
            })
            // Two Managers marking the same person at once: the second finds it written.
            .onConflictDoNothing()
            .returning({ id: sopTraining.id });
          if (!saved) {
            throw new ORPCError("CONFLICT", {
              message:
                "That person was already marked as trained on this version",
            });
          }
        }
      );
      return { id, versionNumber: version.number, taught: true };
    }),

  /** A Manager's suggested change, waiting for the Owner. Approving it publishes a Version. */
  propose: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({ definitionId: z.string(), content: sopContentSchema, note })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "sop_proposal",
          entityId: id,
          action: "create",
          after: { definitionId: input.definitionId, status: "pending" },
          reason: input.note,
        },
        async (tx) => {
          const definition = await tx.query.sopDefinition.findFirst({
            where: { id: input.definitionId, farmId: context.farm.id },
            columns: { id: true, currentVersionId: true },
          });
          if (!definition) {
            throw new ORPCError("NOT_FOUND");
          }
          await tx.insert(sopProposal).values({
            id,
            farmId: context.farm.id,
            definitionId: input.definitionId,
            basedOnVersionId: definition.currentVersionId,
            content: input.content,
            note: input.note ?? null,
            status: "pending",
            proposedBy: context.actor.id,
            proposedByRole: context.roleUsed,
            createdAt: now,
          });
          // The Owner is the only person who can answer a proposal, so the Owner is who is
          // told. In the digest: a suggested change to the Playbook is not something to
          // wake anybody for (notification channels).
          await tell(
            tx,
            context.farm.id,
            {
              kind: "sop_proposed",
              about: { id },
              facts: {
                sopBn: input.content.name.bn,
                sopEn: input.content.name.en ?? input.content.name.bn,
              },
            },
            now
          );
        }
      );
      return { id, status: "pending" } as const;
    }),

  proposals: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) =>
      context.db.query.sopProposal.findMany({
        where: { farmId: context.farm.id, status: "pending" },
        with: {
          definition: {
            with: {
              currentVersion: { columns: { content: true, number: true } },
            },
          },
          proposer: { columns: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    ),

  /** Approving a proposal is how a Manager's change becomes the Playbook. */
  approveProposal: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), note }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      let published = { id: "", number: 0 };
      await audited(context).write(
        {
          entity: "sop_proposal",
          entityId: input.id,
          action: "update",
          before: { status: "pending" },
          after: { status: "approved" },
          reason: input.note,
        },
        async (tx) => {
          const [proposal] = await tx
            .update(sopProposal)
            .set({
              status: "approved",
              decidedBy: context.actor.id,
              decidedAt: now,
              decisionNote: input.note ?? null,
            })
            .where(
              and(
                eq(sopProposal.id, input.id),
                eq(sopProposal.farmId, context.farm.id),
                eq(sopProposal.status, "pending")
              )
            )
            .returning({
              definitionId: sopProposal.definitionId,
              content: sopProposal.content,
            });
          if (!proposal) {
            throw new ORPCError("NOT_FOUND");
          }
          published = await publishVersion(tx, {
            farmId: context.farm.id,
            definitionId: proposal.definitionId,
            content: proposal.content as SopContent,
            note: input.note,
            actorId: context.actor.id,
            roleUsed: context.roleUsed,
            now,
          });
        }
      );
      return {
        id: input.id,
        versionId: published.id,
        number: published.number,
      };
    }),

  rejectProposal: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(
      z.object({ id: z.string(), note: z.string().trim().min(1).max(400) })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "sop_proposal",
          entityId: input.id,
          action: "update",
          before: { status: "pending" },
          after: { status: "rejected" },
          reason: input.note,
        },
        async (tx) => {
          const [row] = await tx
            .update(sopProposal)
            .set({
              status: "rejected",
              decidedBy: context.actor.id,
              decidedAt: now,
              decisionNote: input.note,
            })
            .where(
              and(
                eq(sopProposal.id, input.id),
                eq(sopProposal.farmId, context.farm.id),
                eq(sopProposal.status, "pending")
              )
            )
            .returning({ id: sopProposal.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { id: input.id, status: "rejected" } as const;
    }),
};
