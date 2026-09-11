import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { feedItem, ration, rationVersion } from "@OpenFarm/db/schema/feed";
import { MAX_SESSIONS_PER_DAY, findRationProblems } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  feedNames,
  headcountOf,
  linesOf,
  rationInForceAt,
  targetFor,
} from "../feed-store";
import { requirePen } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const bilingual = z.object({
  bn: z.string().trim().min(1).max(80),
  en: z.string().trim().max(80).optional(),
});

const rationInput = z.object({
  penId: z.string(),
  name: bilingual,
  sessionsPerDay: z.number().int().min(1).max(MAX_SESSIONS_PER_DAY),
  items: z
    .array(
      z.object({
        feedItemId: z.string(),
        kgPerAnimalPerDay: z.number(),
      })
    )
    .min(1),
  note: z.string().trim().max(400).optional(),
});

export const feedRouter = {
  /** The farm's Feed Items, retired ones last — a retired one still names itself in the
   *  Rations that fed it. */
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
    .input(z.object({ name: bilingual }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: id,
          action: "create",
          after: { nameBn: input.name.bn, nameEn: input.name.en ?? null },
        },
        (tx) =>
          tx.insert(feedItem).values({
            id,
            farmId: context.farm.id,
            nameBn: input.name.bn,
            nameEn: input.name.en ?? null,
            createdBy: context.actor.id,
            createdAt: now,
          })
      );
      return { id, name: input.name };
    }),

  /** Retired, never removed: what a Pen was fed in March still names it. */
  retireItem: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: input.id,
          action: "update",
          after: { retiredAt: now.toISOString() },
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

  /** This Pen's Ration, as it stands. */
  ration: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ penId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.ration.findFirst({
        where: { farmId: context.farm.id, penId: input.penId },
        with: { currentVersion: true },
      });
      if (!row?.currentVersion) {
        return null;
      }
      return {
        id: row.id,
        name: { bn: row.nameBn, en: row.nameEn },
        number: row.currentVersion.number,
        sessionsPerDay: row.currentVersion.sessionsPerDay,
        items: linesOf(row.currentVersion.items),
        publishedAt: row.currentVersion.publishedAt,
      };
    }),

  /** Sets what a Pen is fed. Never an edit: each change is the next Version, so what was fed
   *  in March can still be shown in June (ADR 0001). */
  setRation: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(rationInput)
    .handler(async ({ context, input }) => {
      const problems = findRationProblems(input);
      if (problems.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `This ration cannot be set — ${problems.join("; ")}`,
          data: { problems },
        });
      }
      const now = context.clock.now();
      let number = 1;
      let rationId = "";
      await audited(context).write(
        {
          entity: "ration",
          entityId: () => rationId,
          action: "update",
          reason: input.note,
          after: () => Promise.resolve({ number, items: input.items }),
        },
        async (tx) => {
          await requirePen(tx, context.farm.id, input.penId);
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
          const existing = await tx.query.ration.findFirst({
            where: { farmId: context.farm.id, penId: input.penId },
            columns: { id: true },
          });
          rationId = existing?.id ?? uuidv7(now);
          if (existing) {
            await tx
              .update(ration)
              .set({ nameBn: input.name.bn, nameEn: input.name.en ?? null })
              .where(eq(ration.id, rationId));
          } else {
            await tx.insert(ration).values({
              id: rationId,
              farmId: context.farm.id,
              penId: input.penId,
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
            sessionsPerDay: input.sessionsPerDay,
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

  /**
   * What one session calls for in this Pen, with the working shown: the Ration in force, the
   * animals standing there, and how often they are fed. `at` asks what it would have been —
   * work raised yesterday is fed on yesterday's Ration.
   */
  target: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ penId: z.string(), at: z.coerce.date().optional() }))
    .handler(async ({ context, input }) => {
      const at = input.at ?? context.clock.now();
      const row = await context.db.query.ration.findFirst({
        where: { farmId: context.farm.id, penId: input.penId },
        columns: { id: true, nameBn: true, nameEn: true },
      });
      if (!row) {
        // A Pen with no Ration is a thing the screen says, not a zero it shows.
        return { ration: null, headcount: 0, sessionsPerDay: 0, items: [] };
      }
      const version = await rationInForceAt(context.db, row.id, at);
      if (!version) {
        return { ration: null, headcount: 0, sessionsPerDay: 0, items: [] };
      }
      const headcount = await headcountOf(
        context.db,
        context.farm.id,
        input.penId
      );
      const names = await feedNames(context.db, context.farm.id);
      return {
        ration: {
          id: row.id,
          name: { bn: row.nameBn, en: row.nameEn },
          number: version.number,
        },
        headcount,
        sessionsPerDay: version.sessionsPerDay,
        items: targetFor(
          linesOf(version.items),
          names,
          headcount,
          version.sessionsPerDay
        ),
      };
    }),
};
