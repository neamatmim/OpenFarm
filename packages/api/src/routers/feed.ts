import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import {
  feedItem,
  penRation,
  ration,
  rationVersion,
} from "@OpenFarm/db/schema/feed";
import { findRationProblems } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { feedingTargetForPen, linesOf } from "../feed-store";
import { assertPenIsTheirs, requirePen } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const bilingual = z.object({
  bn: z.string().trim().min(1).max(80),
  en: z.string().trim().max(80).optional(),
});

const rationInput = z.object({
  /** Omitted for a new Ration; given to publish the next Version of one that exists. */
  rationId: z.string().optional(),
  name: bilingual,
  items: z
    .array(
      z.object({ feedItemId: z.string(), kgPerAnimalPerDay: z.number() })
    )
    .min(1),
  note: z.string().trim().max(400).optional(),
});

/** What a Ration says right now, for the trail to record as the before and the after. */
const readRation = async (tx: Tx, rationId: string) => {
  const row = await tx.query.ration.findFirst({
    where: { id: rationId },
    with: { currentVersion: true },
  });
  return row?.currentVersion
    ? {
        name: row.nameBn,
        number: row.currentVersion.number,
        items: linesOf(row.currentVersion.items),
      }
    : null;
};

export const feedRouter = {
  /** The farm's Feed Items. A retired one is kept: a Ration that fed it still names it. */
  items: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) =>
      context.db.query.feedItem.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc" },
      })
    ),

  addItem: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        name: bilingual,
        unit: z.string().trim().min(1).max(16).default("kg"),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: id,
          action: "create",
          after: {
            nameBn: input.name.bn,
            nameEn: input.name.en ?? null,
            unit: input.unit,
          },
        },
        (tx) =>
          tx.insert(feedItem).values({
            id,
            farmId: context.farm.id,
            nameBn: input.name.bn,
            nameEn: input.name.en ?? null,
            unit: input.unit,
            createdBy: context.actor.id,
            createdAt: now,
          })
      );
      return { id, name: input.name, unit: input.unit };
    }),

  /** Retired, never removed: what a Pen was fed in March still names it. */
  retireItem: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.feedItem.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, nameBn: true, retiredAt: true },
      });
      // A trail that records a change to something the farm does not have is a trail that
      // lies; the caller is told instead.
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such feed" });
      }
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: input.id,
          action: "update",
          before: { nameBn: existing.nameBn, retiredAt: existing.retiredAt },
          after: { nameBn: existing.nameBn, retiredAt: now.toISOString() },
        },
        (tx) =>
          tx
            .update(feedItem)
            .set({ retiredAt: now })
            .where(
              and(
                eq(feedItem.id, input.id),
                eq(feedItem.farmId, context.farm.id)
              )
            )
      );
      return { id: input.id };
    }),

  /** Every Ration the farm has, with the Pens on it. */
  rations: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.ration.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc" },
        with: { currentVersion: true, pens: { columns: { penId: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        name: { bn: row.nameBn, en: row.nameEn },
        retiredAt: row.retiredAt,
        number: row.currentVersion?.number ?? null,
        items: linesOf(row.currentVersion?.items),
        penIds: row.pens.map((assignment) => assignment.penId),
      }));
    }),

  /**
   * Writes a Ration, as a new Version of it. Never an edit: what a Pen was fed in March can
   * still be shown in June (ADR 0001).
   */
  saveRation: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(rationInput)
    .handler(async ({ context, input }) => {
      const problems = findRationProblems(input);
      if (problems.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `This ration cannot be saved — ${problems.join("; ")}`,
          data: { problems },
        });
      }
      const now = context.clock.now();
      let number = 1;
      let rationId = input.rationId ?? "";
      await audited(context).write(
        {
          entity: "ration",
          entityId: () => rationId,
          action: input.rationId ? "update" : "create",
          reason: input.note,
          before: async (tx) => (rationId ? await readRation(tx, rationId) : null),
          after: (tx) => readRation(tx, rationId),
        },
        async (tx) => {
          for (const line of input.items) {
            const known = await tx.query.feedItem.findFirst({
              where: { id: line.feedItemId, farmId: context.farm.id },
              columns: { id: true },
            });
            if (!known) {
              throw new ORPCError("NOT_FOUND", {
                message: "That is not one of this farm's feeds",
              });
            }
          }
          if (rationId) {
            const existing = await tx.query.ration.findFirst({
              where: { id: rationId, farmId: context.farm.id },
              columns: { id: true },
            });
            if (!existing) {
              throw new ORPCError("NOT_FOUND", { message: "No such ration" });
            }
            await tx
              .update(ration)
              .set({ nameBn: input.name.bn, nameEn: input.name.en ?? null })
              .where(eq(ration.id, rationId));
          } else {
            rationId = uuidv7(now);
            await tx.insert(ration).values({
              id: rationId,
              farmId: context.farm.id,
              nameBn: input.name.bn,
              nameEn: input.name.en ?? null,
              createdAt: now,
            });
          }
          const [previous] = await tx.query.rationVersion.findMany({
            where: { rationId },
            columns: { number: true },
            orderBy: { number: "desc" },
            limit: 1,
          });
          number = (previous?.number ?? 0) + 1;
          const versionId = uuidv7(now);
          await tx.insert(rationVersion).values({
            id: versionId,
            farmId: context.farm.id,
            rationId,
            number,
            items: input.items,
            note: input.note ?? null,
            publishedBy: context.actor.id,
            publishedByRole: context.roleUsed,
            publishedAt: now,
          });
          await tx
            .update(ration)
            .set({ currentVersionId: versionId })
            .where(eq(ration.id, rationId));
        }
      );
      return { rationId, number };
    }),

  /** Puts a Pen on a Ration. One at a time, and the trail says who moved it. */
  assignRation: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ penId: z.string(), rationId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "pen",
          entityId: input.penId,
          action: "update",
          before: async (tx) => {
            const row = await tx.query.penRation.findFirst({
              where: { penId: input.penId },
              columns: { rationId: true },
            });
            return { rationId: row?.rationId ?? null };
          },
          after: { rationId: input.rationId },
        },
        async (tx) => {
          await requirePen(tx, context.farm.id, input.penId);
          const known = await tx.query.ration.findFirst({
            where: { id: input.rationId, farmId: context.farm.id },
            columns: { id: true },
          });
          if (!known) {
            throw new ORPCError("NOT_FOUND", { message: "No such ration" });
          }
          await tx
            .insert(penRation)
            .values({
              penId: input.penId,
              farmId: context.farm.id,
              rationId: input.rationId,
              assignedBy: context.actor.id,
              assignedAt: now,
            })
            .onConflictDoUpdate({
              target: penRation.penId,
              set: {
                rationId: input.rationId,
                assignedBy: context.actor.id,
                assignedAt: now,
              },
            });
        }
      );
      return { penId: input.penId, rationId: input.rationId };
    }),

  /**
   * What one session calls for in this Pen, with the working shown: the Ration in force, the
   * animals standing there, and how often the Playbook feeds them.
   *
   * `rationAsOf` asks which Ration Version to read — work raised yesterday is fed on
   * yesterday's Ration. The animals are always the animals standing there *now*, because they
   * are who eats: a cow who arrived this morning is fed this evening.
   */
  target: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({ penId: z.string(), rationAsOf: z.coerce.date().optional() })
    )
    .handler(async ({ context, input }) => {
      assertPenIsTheirs(context, input.penId);
      const found = await feedingTargetForPen(
        context.db,
        context.farm.id,
        input.penId,
        input.rationAsOf ?? context.clock.now()
      );
      if (!found) {
        // A Pen on no Ration, or a Playbook that does not feed yet: things the screen says,
        // not zeros it shows.
        return { ration: null, animals: 0, sessionsPerDay: 0, items: [] };
      }
      return {
        ration: {
          id: found.rationId,
          versionId: found.rationVersionId,
          name: found.name,
          number: found.number,
        },
        animals: found.animals,
        sessionsPerDay: found.sessionsPerDay,
        items: found.items,
      };
    }),
};
