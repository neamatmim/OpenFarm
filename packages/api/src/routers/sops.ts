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
import { findPublishBlockers } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { holdersOf, raiseAlerts } from "../alerts-store";
import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";
import { asSopContent, sopContentSchema } from "../sop-content";

const note = z.string().trim().max(400).optional();

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

  // Everybody whose Role does this work is told a new Version exists. It goes in the
  // digest, not as an Alert: a changed procedure costs nothing if it is read at six in the
  // morning, and the farm's Alerts are for what costs money or breaks a deadline. What
  // actually changed is shown on the work itself, the first time they open it.
  if (number > 1) {
    const doers = await holdersOf(tx, farmId, [content.assignedRole]);
    await raiseAlerts(
      tx,
      farmId,
      doers,
      {
        kind: "sop_published",
        entity: "sop_version",
        entityId: id,
        params: { sopBn: content.name.bn, number },
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
