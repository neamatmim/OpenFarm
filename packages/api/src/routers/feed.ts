import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import {
  FEED_UNITS,
  feedItem,
  penRation,
  ration,
} from "@OpenFarm/db/schema/feed";
import {
  STANDARD_FEED_ITEMS,
  findBandProblems,
  findRationProblems,
  isByWeight,
  mayGoByWeight,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import type { FarmList } from "../farm-list";
import { assertNameFree, bringBackToList, retireFromList } from "../farm-list";
import {
  bandColumns,
  bandOf,
  feedingTargetForPen,
  linesOf,
  publishRationVersion,
} from "../feed-store";
import { requirePen } from "../herd-store";
import { protectedProcedure } from "../index";
import { leftoversOf } from "../leftover-store";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import { requirePenInScope } from "../scope";
import { feedsNotHad, startWithStandard } from "../standard-store";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** How far back the Leftovers are read: a week, as the store is counted, or longer to see a pattern. */
const LEFTOVER_PERIODS = [7, 14, 30] as const;

/** What one bag of a feed weighs, in kilos: a sack of bran is fifty, a bag of mineral mixture five. */
const bagSizeInput = z.number().positive().max(200);

/** A bag is a weight in kilos, so only feed counted in kilos is bought by it. */
const refuseBagOfNonKilos = (unit: string, bagSizeKg: number | undefined) => {
  if (bagSizeKg !== undefined && unit !== "kg") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only feed counted in kilos is bought by the bag",
      data: { refusal: "pack_needs_kg" },
    });
  }
};

const bilingual = z.object({
  bn: z.string().trim().min(1).max(80),
  en: z.string().trim().max(80).optional(),
});

const rationInput = z.object({
  /** Omitted for a new Ration; given to publish the next Version of one that exists. */
  rationId: z.string().optional(),
  name: bilingual,
  // Each line by the head, or by every hundred kilos of body weight.
  items: z
    .array(
      z.union([
        z.object({ feedItemId: z.string(), kgPerAnimalPerDay: z.number() }),
        z.object({ feedItemId: z.string(), kgPer100KgPerDay: z.number() }),
      ])
    )
    .min(1),
  note: z.string().trim().max(400).optional(),
  /** The weights it is written for, either end open. Left out, a Ration keeps the band it had — and a new one has none. */
  band: z
    .object({ fromKg: z.number().nullable(), toKg: z.number().nullable() })
    .optional(),
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
        band: bandOf(row),
      }
    : null;
};

/** A feed of this farm's, retired or not, or a refusal: a trail that records a change to something the farm does not
 *  have is a trail that lies. */
const requireFeedItem = async (
  db: Pick<Tx, "query">,
  farmId: string,
  id: string
) => {
  const existing = await db.query.feedItem.findFirst({
    where: { id, farmId },
    columns: { id: true, nameBn: true, nameEn: true, retiredAt: true },
  });
  if (!existing) {
    throw new ORPCError("NOT_FOUND", { message: "No such feed" });
  }
  return existing;
};

/** A feed as the trail keeps it either side of a change. */
const readFeedItem = async (tx: Tx, farmId: string, id: string) =>
  (await tx.query.feedItem.findFirst({
    where: { id, farmId },
    columns: { nameBn: true, nameEn: true, retiredAt: true },
  })) ?? null;

/** The farm's list of feeds, as the one way a list is kept keeps it. */
const FEED_ITEMS = {
  entity: "feed_item",
  table: feedItem,
  read: readFeedItem,
  notFound: "No such feed",
  names: { bn: feedItem.nameBn, en: feedItem.nameEn },
  nameTaken: {
    refusal: "feed_item_exists",
    message: "The farm already has a feed by that name",
  },
} satisfies FarmList & Parameters<typeof assertNameFree>[2];

export const feedRouter = {
  /** The farm's Feed Items. A retired one is kept: a Ration that fed it still names it. */
  items: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.feedItem.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc" },
      });
      // The price lives in a numeric column and comes back as a string; it is turned at the edge, as
      // every other figure is.
      return rows.map((row) => ({
        ...row,
        fodderPriceBdt: row.fodderPriceBdt,
        bagSizeKg: row.bagSizeKg === null ? null : Number(row.bagSizeKg),
      }));
    }),

  addItem: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        name: bilingual,
        unit: z.enum(FEED_UNITS).default("kg"),
        /** What one of its bags weighs, for feed bought by the bag: kilos, so for feed counted in kilos only. */
        bagSizeKg: bagSizeInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      refuseBagOfNonKilos(input.unit, input.bagSizeKg);
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
            bagSizeKg: input.bagSizeKg ?? null,
          },
        },
        async (tx) => {
          await assertNameFree(tx, context.farm.id, FEED_ITEMS, input.name);
          await tx.insert(feedItem).values({
            id,
            farmId: context.farm.id,
            nameBn: input.name.bn,
            nameEn: input.name.en ?? null,
            unit: input.unit,
            bagSizeKg:
              input.bagSizeKg === undefined ? null : String(input.bagSizeKg),
            createdBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id, name: input.name, unit: input.unit };
    }),

  /**
   * What one of a feed's bags weighs, so it can be bought by the bag and the store still counts kilos — or nothing, to
   * stop buying it so. Feed counted in kilos only: a bag is a weight.
   */
  setBagSize: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({ feedItemId: z.string(), bagSizeKg: bagSizeInput.nullable() })
    )
    .handler(async ({ context, input }) => {
      const existing = await context.db.query.feedItem.findFirst({
        where: { id: input.feedItemId, farmId: context.farm.id },
        columns: { id: true, nameBn: true, unit: true, bagSizeKg: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such feed" });
      }
      refuseBagOfNonKilos(existing.unit, input.bagSizeKg ?? undefined);
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: existing.id,
          action: "update",
          before: { nameBn: existing.nameBn, bagSizeKg: existing.bagSizeKg },
          after: { nameBn: existing.nameBn, bagSizeKg: input.bagSizeKg },
        },
        (tx) =>
          tx
            .update(feedItem)
            .set({
              bagSizeKg:
                input.bagSizeKg === null ? null : String(input.bagSizeKg),
            })
            .where(
              and(
                eq(feedItem.id, existing.id),
                eq(feedItem.farmId, context.farm.id)
              )
            )
      );
      return { feedItemId: existing.id, bagSizeKg: input.bagSizeKg };
    }),

  /**
   * What a kilo of home-grown fodder is worth. A Harvest comes into the store at the price in force when
   * it is recorded, so the animals that eat it are charged as they are for bought feed — and what was cut
   * before keeps the price it came in at.
   *
   * The Owner's alone: it is a price the farm puts on its own land's work, and it moves every Margin.
   */
  setFodderPrice: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        feedItemId: z.string(),
        fodderPriceBdt: z.number().min(0).max(100_000).nullable(),
      })
    )
    .handler(async ({ context, input }) => {
      const existing = await context.db.query.feedItem.findFirst({
        where: { id: input.feedItemId, farmId: context.farm.id },
        columns: { id: true, nameBn: true, fodderPriceBdt: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such feed" });
      }
      const { fodderPriceBdt } = input;
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: existing.id,
          action: "update",
          before: {
            nameBn: existing.nameBn,
            fodderPriceBdt: existing.fodderPriceBdt,
          },
          after: { nameBn: existing.nameBn, fodderPriceBdt },
        },
        (tx) =>
          tx
            .update(feedItem)
            .set({ fodderPriceBdt })
            .where(eq(feedItem.id, existing.id))
      );
      return { fodderPriceBdt: input.fodderPriceBdt };
    }),

  /**
   * How low a Feed Item may run before the Manager is told — or null, for one nobody watches. The
   * Manager's to set, as the store is theirs to keep, and the Owner's, who may do anything the Manager
   * does (the Owner, 2026-09-17).
   */
  setLowStock: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        feedItemId: z.string(),
        threshold: z.number().min(0.1).max(10_000_000).nullable(),
      })
    )
    .handler(async ({ context, input }) => {
      const existing = await context.db.query.feedItem.findFirst({
        where: { id: input.feedItemId, farmId: context.farm.id },
        columns: { id: true, nameBn: true, lowStockAt: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such feed" });
      }
      const lowStockAt =
        input.threshold === null ? null : input.threshold.toFixed(1);
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: existing.id,
          action: "update",
          before: { nameBn: existing.nameBn, lowStockAt: existing.lowStockAt },
          after: { nameBn: existing.nameBn, lowStockAt },
        },
        (tx) =>
          tx
            .update(feedItem)
            .set({ lowStockAt })
            .where(eq(feedItem.id, existing.id))
      );
      return { feedItemId: existing.id, threshold: input.threshold };
    }),

  /** Retired, never removed: what a Pen was fed in March still names it. */
  retireItem: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await retireFromList(context, FEED_ITEMS, input.id);
      return { id: input.id };
    }),

  /** Puts a feed's names right. A Ration, a purchase and a count name the feed, not its words, so each follows. */
  renameItem: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string(), name: bilingual }))
    .handler(async ({ context, input }) => {
      const existing = await requireFeedItem(
        context.db,
        context.farm.id,
        input.id
      );
      await audited(context).write(
        {
          entity: "feed_item",
          entityId: existing.id,
          action: "update",
          before: { nameBn: existing.nameBn, nameEn: existing.nameEn },
          after: { nameBn: input.name.bn, nameEn: input.name.en ?? null },
        },
        async (tx) => {
          await assertNameFree(
            tx,
            context.farm.id,
            FEED_ITEMS,
            input.name,
            existing.id
          );
          await tx
            .update(feedItem)
            .set({ nameBn: input.name.bn, nameEn: input.name.en ?? null })
            .where(eq(feedItem.id, existing.id));
        }
      );
      return { id: existing.id };
    }),

  /** Brings a retired feed back onto the list a Ration, a purchase and a count choose from. */
  bringBackItem: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await bringBackToList(context, FEED_ITEMS, input.id);
      return { id: input.id };
    }),

  /** The standard feeds the farm does not have yet, by their names: what adding them would add. */
  standardMissing: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const have = await context.db.query.feedItem.findMany({
        where: { farmId: context.farm.id },
        columns: { id: true, nameBn: true, nameEn: true },
      });
      return feedsNotHad(have).map((key) => STANDARD_FEED_ITEMS[key]);
    }),

  /**
   * The standard feeds the farm does not have yet — the ones the Owner may start the farm with — added as if by hand,
   * each with its line in the trail. A feed the farm already calls by one of their names, in either language, is left as
   * the farm's; asked twice, the second adds nothing. The Manager's too, since keeping the list of feeds is.
   */
  addStandardItems: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const added = await startWithStandard(
        context.db,
        audited(context).recordEvent,
        {
          farmId: context.farm.id,
          actorId: context.actor.id,
          roleUsed: context.roleUsed,
          now: context.clock.now(),
        },
        ["feed"]
      );
      return { added: added.feedItems };
    }),

  /**
   * Takes a Ration off the list of what a Pen may be put on. Retired rather than removed: every Feeding it fed still
   * names its Version, and a farm reading March's feed in June reads it by name. Not while a Pen is on it — the Pen
   * would go on being fed from a Ration nobody may choose — so the Pens are put on another first.
   */
  retireRation: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.ration.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, nameBn: true, retiredAt: true },
        with: { pens: { columns: { penId: true } } },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such ration" });
      }
      if (existing.pens.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Pens are still fed on this ration: put them on another first",
          data: { refusal: "ration_in_use" },
        });
      }
      if (existing.retiredAt) {
        return { id: input.id, retiredAt: existing.retiredAt };
      }
      await audited(context).write(
        {
          entity: "ration",
          entityId: input.id,
          action: "update",
          before: { name: existing.nameBn, retiredAt: null },
          after: { name: existing.nameBn, retiredAt: now.toISOString() },
        },
        (tx) =>
          tx
            .update(ration)
            .set({ retiredAt: now })
            .where(
              and(eq(ration.id, input.id), eq(ration.farmId, context.farm.id))
            )
      );
      return { id: input.id, retiredAt: now };
    }),

  /** Puts a retired Ration back on the list a Pen may be put on, as it was when it was retired. */
  bringBackRation: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const existing = await context.db.query.ration.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true, nameBn: true, retiredAt: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such ration" });
      }
      if (!existing.retiredAt) {
        return { id: input.id };
      }
      await audited(context).write(
        {
          entity: "ration",
          entityId: input.id,
          action: "update",
          before: {
            name: existing.nameBn,
            retiredAt: existing.retiredAt.toISOString(),
          },
          after: { name: existing.nameBn, retiredAt: null },
        },
        (tx) =>
          tx
            .update(ration)
            .set({ retiredAt: null })
            .where(
              and(eq(ration.id, input.id), eq(ration.farmId, context.farm.id))
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
        band: bandOf(row),
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
      const problems = [
        ...findRationProblems(input),
        ...(input.band ? findBandProblems(input.band) : []),
      ];
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
          before: async (tx) =>
            rationId ? await readRation(tx, rationId) : null,
          after: (tx) => readRation(tx, rationId),
        },
        async (tx) => {
          const known = await tx.query.feedItem.findMany({
            where: {
              farmId: context.farm.id,
              id: { in: input.items.map((line) => line.feedItemId) },
            },
            columns: { id: true, unit: true, retiredAt: true },
          });
          if (known.length !== input.items.length) {
            throw new ORPCError("NOT_FOUND", {
              message: "That is not one of this farm's feeds",
            });
          }
          // A Ration is what the Pen is fed from now on, and a retired feed is one the farm no longer keeps.
          if (known.some((one) => one.retiredAt !== null)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "A retired feed is not fed; bring it back first",
              data: { refusal: "feed_retired" },
            });
          }
          // "Three for every hundred kilos of body weight" is a quantity; bundles are counted, by the head.
          const unitOf = new Map(known.map((one) => [one.id, one.unit]));
          const countedByWeight = input.items.some(
            (line) =>
              isByWeight(line) &&
              !mayGoByWeight(unitOf.get(line.feedItemId) ?? "kg")
          );
          if (countedByWeight) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "A feed counted in bundles is given by the head, not by weight",
              data: { refusal: "bundles_by_the_head" },
            });
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
              .set({
                nameBn: input.name.bn,
                nameEn: input.name.en ?? null,
                ...(input.band ? bandColumns(input.band) : {}),
              })
              .where(eq(ration.id, rationId));
          } else {
            rationId = uuidv7(now);
            await tx.insert(ration).values({
              id: rationId,
              farmId: context.farm.id,
              nameBn: input.name.bn,
              nameEn: input.name.en ?? null,
              ...(input.band ? bandColumns(input.band) : {}),
              createdAt: now,
            });
          }
          number = await publishRationVersion(tx, {
            farmId: context.farm.id,
            rationId,
            items: input.items,
            note: input.note ?? null,
            actorId: context.actor.id,
            roleUsed: context.roleUsed,
            now,
          });
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
            columns: { id: true, retiredAt: true },
          });
          if (!known) {
            throw new ORPCError("NOT_FOUND", { message: "No such ration" });
          }
          if (known.retiredAt) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "That ration is retired: bring it back to feed a Pen on it",
              data: { refusal: "ration_retired" },
            });
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
      requirePenInScope(context.scope, input.penId);
      const found = await feedingTargetForPen(
        context.db,
        context.farm.id,
        input.penId,
        input.rationAsOf ?? context.clock.now()
      );
      if (!found) {
        // A Pen on no Ration, or a Playbook that does not feed yet: things the screen says,
        // not zeros it shows.
        return {
          ration: null,
          animals: 0,
          herd: null,
          sessionsPerDay: 0,
          items: [],
        };
      }
      return {
        ration: {
          id: found.rationId,
          versionId: found.rationVersionId,
          name: found.name,
          number: found.number,
        },
        animals: found.animals,
        herd: found.herd,
        sessionsPerDay: found.sessionsPerDay,
        items: found.items,
      };
    }),

  /**
   * What each Pen left in the trough of each Feed Item over the last days, what that feed cost, and where it stands —
   * so a Ration giving more than a Pen eats is seen and cut, and one never leaving a scrap is looked at. Priced, so
   * the Owner's and the Manager's alone, as the farm's money is.
   */
  leftovers: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z
        .object({
          days: z
            .union(LEFTOVER_PERIODS.map((days) => z.literal(days)))
            .default(7),
        })
        .default({ days: 7 })
    )
    .handler(async ({ context, input }) => {
      const until = context.clock.now();
      const since = new Date(until.getTime() - input.days * ONE_DAY_MS);
      return await leftoversOf(context.db, context.farm.id, { since, until });
    }),
};
