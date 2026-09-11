import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import {
  sopDefinition,
  sopProposal,
  sopVersion,
} from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { findPublishBlockers } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

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
