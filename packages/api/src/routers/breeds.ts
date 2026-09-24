import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { breed } from "@OpenFarm/db/schema/herd";
import { LIVE_STATES } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { addStandardBreeds, missingStandardBreeds } from "../breed-store";
import type { Context } from "../context";
import type { FarmList } from "../farm-list";
import {
  assertNameFree,
  bringBackToList,
  giveStandardOnce,
  retireFromList,
} from "../farm-list";
import { protectedProcedure } from "../index";
import { requirePersonalSession, requireRole } from "../roles";

const nameInput = z.string().trim().min(1).max(60);

/** The breed as the trail records it either side of a change. */
const readBreed = async (tx: Tx, farmId: string, id: string) =>
  (await tx.query.breed.findFirst({ where: { id, farmId } })) ?? null;

/** The farm's list of breeds, as the one way a list is kept keeps it. */
const BREEDS = {
  entity: "breed",
  table: breed,
  read: readBreed,
  notFound: "No such breed",
  names: { bn: breed.nameBn, en: breed.nameEn },
  nameTaken: {
    refusal: "breed_exists",
    message: "The farm already has that breed",
  },
} satisfies FarmList & Parameters<typeof assertNameFree>[2];

const requireOurs = async (
  db: Pick<Tx, "query">,
  farmId: string,
  id: string
) => {
  const row = await db.query.breed.findFirst({
    where: { id, farmId },
    columns: { id: true, retiredAt: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such breed" });
  }
  return row;
};

/**
 * Gives the farm the standard breeds it has not been given — the first time its list is opened, or the first time a
 * register names one. Recorded as what was actually given: a second request that finds them already there writes
 * nothing, and says nothing.
 */
export const giveStandardBreeds = async (
  context: Context & { farm: { id: string } }
) => {
  await giveStandardOnce(context, {
    entity: "breed",
    missing: () => missingStandardBreeds(context.db, context.farm.id),
    give: (tx, keys, now) => addStandardBreeds(tx, context.farm.id, keys, now),
  });
};

/**
 * The farm's list of breeds, which an animal is written down under: the standard ones — given the first time the list
 * is opened — and the farm's own. Retired, never removed. The Owner's and the Manager's to keep, as the herd is.
 */
export const breedsRouter = {
  /** Every breed on the list, retired ones included, with how many animals on the farm are of it. */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      await giveStandardBreeds(context);
      const [rows, herd] = await Promise.all([
        context.db.query.breed.findMany({
          where: { farmId: context.farm.id },
          orderBy: { nameBn: "asc", id: "asc" },
        }),
        context.db.query.animal.findMany({
          where: { farmId: context.farm.id, state: { in: [...LIVE_STATES] } },
          columns: { breedId: true },
        }),
      ]);
      const counted = new Map<string, number>();
      for (const one of herd) {
        if (one.breedId) {
          counted.set(one.breedId, (counted.get(one.breedId) ?? 0) + 1);
        }
      }
      return rows.map((row) => ({
        id: row.id,
        key: row.key,
        nameBn: row.nameBn,
        nameEn: row.nameEn,
        retiredAt: row.retiredAt,
        /** How many animals on the farm now are of it. */
        animals: counted.get(row.id) ?? 0,
      }));
    }),

  /** A breed of the farm's own. */
  add: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ nameBn: nameInput, nameEn: nameInput.optional() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "breed",
          entityId: id,
          action: "create",
          after: (tx) => readBreed(tx, context.farm.id, id),
        },
        async (tx) => {
          await assertNameFree(tx, context.farm.id, BREEDS, {
            bn: input.nameBn,
            en: input.nameEn,
          });
          await tx.insert(breed).values({
            id,
            farmId: context.farm.id,
            key: null,
            nameBn: input.nameBn,
            nameEn: input.nameEn ?? null,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /** Puts a breed's names right. Every animal of it is renamed with it, since she names the breed, not the words. */
  rename: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        id: z.string(),
        nameBn: nameInput,
        nameEn: nameInput.nullable().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const existing = await requireOurs(context.db, context.farm.id, input.id);
      await audited(context).write(
        {
          entity: "breed",
          entityId: existing.id,
          action: "update",
          before: (tx) => readBreed(tx, context.farm.id, existing.id),
          after: (tx) => readBreed(tx, context.farm.id, existing.id),
        },
        async (tx) => {
          await assertNameFree(
            tx,
            context.farm.id,
            BREEDS,
            { bn: input.nameBn, en: input.nameEn },
            existing.id
          );
          await tx
            .update(breed)
            .set({ nameBn: input.nameBn, nameEn: input.nameEn ?? null })
            .where(eq(breed.id, existing.id));
        }
      );
      return { id: existing.id };
    }),

  /** Retires a breed: nothing new is written down under it, and every animal already of it keeps it. */
  retire: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await retireFromList(context, BREEDS, input.id);
      return { id: input.id };
    }),

  /** Brings a retired breed back onto the list animals are written down from. */
  restore: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await bringBackToList(context, BREEDS, input.id);
      return { id: input.id };
    }),
};
