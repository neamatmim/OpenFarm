import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { drugProduct } from "@OpenFarm/db/schema/health";
import {
  MAX_WITHDRAWAL_DAYS,
  mayBePrescribed,
  whyNotPrescribable,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";
import {
  forbidden,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";

const name = z.object({
  bn: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).optional(),
});

const days = z.number().int().min(0).max(MAX_WITHDRAWAL_DAYS);

/** The product as it stands, for the trail to record either side of a change. */
const readProduct = async (tx: Tx, id: string) => {
  const row = await tx.query.drugProduct.findFirst({
    where: { id },
    columns: {
      nameBn: true,
      milkWithdrawalDays: true,
      meatWithdrawalDays: true,
      retiredAt: true,
    },
  });
  return row ?? null;
};

/**
 * One change to one product, audited, refusing inside the transaction when it changed
 * nothing. Checking first and updating afterwards would let the trail record a change to a
 * row that was not there — a trail that says something happened is worse than no trail.
 */
const changeProduct = async (
  context: Parameters<typeof audited>[0],
  id: string,
  apply: (tx: Tx) => Promise<{ id: string }[]>
): Promise<void> => {
  await audited(context).write(
    {
      entity: "drug_product",
      entityId: id,
      action: "update",
      before: (tx) => readProduct(tx, id),
      after: (tx) => readProduct(tx, id),
    },
    async (tx) => {
      const [changed] = await apply(tx);
      if (!changed) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such product, or it is already as you are asking for",
        });
      }
    }
  );
};

/** The Drug List is the Vet's to keep (roles matrix): the withdrawal days are the
 *  prescriber's statement and the farm's evidence at slaughter. */
const VET_ONLY = {
  message:
    "Only the Vet keeps the Drug List; a product can be added for them to fill in",
  reason: "vet_only",
} as const;

/**
 * For the one place the Vet's part is a field rather than the whole procedure: a Manager may
 * add a product, but not say what it costs the milk. A person may hold several Roles and
 * their permissions are the union, so this asks what they hold rather than which Role the
 * request happens to be acting under — an in-house Vet who is also the Manager is still
 * the Vet.
 */
const assertIsVet = (context: { roles: readonly string[] }) => {
  if (!context.roles.includes("vet")) {
    throw forbidden(VET_ONLY);
  }
};

export const drugsRouter = {
  /** The farm's Drug List, and which of it may actually be prescribed. */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.drugProduct.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc" },
        with: { setBy: { columns: { name: true } } },
      });
      return rows.map(({ setBy, ...row }) => ({
        ...row,
        /** Who said what the days are: evidence, so it is shown and not only stored. */
        daysSetByName: setBy?.name ?? null,
        prescribable: mayBePrescribed(row),
        /** Why not — the same answer the refusal will give, because it is the same
         *  question. A reason rather than a sentence: the words belong to the reader. */
        whyNot: whyNotPrescribable(row),
      }));
    }),

  /**
   * Adds a product. The Manager may add one the day it is bought, with the days blank —
   * buying is not blocked on the Vet being reachable — and the Vet may add one outright.
   * The Owner reads the list and does not keep it (roles matrix).
   */
  add: protectedProcedure
    .use(requireRole("manager", "vet"))
    .input(
      z
        .object({
          name,
          milkWithdrawalDays: days.optional(),
          meatWithdrawalDays: days.optional(),
        })
        // Both or neither. One day on its own is half a Withdrawal, which is not a thing
        // the farm can act on and not a thing anybody meant to say.
        .refine(
          (given) =>
            (given.milkWithdrawalDays === undefined) ===
            (given.meatWithdrawalDays === undefined),
          {
            message:
              "Give both withdrawal days or neither: one on its own is half a withdrawal",
          }
        )
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const withDays = input.milkWithdrawalDays !== undefined;
      if (withDays) {
        assertIsVet(context);
      }
      const already = await context.db.query.drugProduct.findFirst({
        where: { farmId: context.farm.id, nameBn: input.name.bn },
        columns: { id: true, retiredAt: true },
      });
      if (already) {
        // Naming it again is how somebody re-buys a product the farm retired, so say what
        // is there rather than failing on a unique index nobody can read.
        throw new ORPCError("CONFLICT", {
          message: already.retiredAt
            ? "That product is already on the list, retired; bring it back rather than adding it twice"
            : "That product is already on the list",
          data: { productId: already.id, retired: Boolean(already.retiredAt) },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "drug_product",
          entityId: id,
          action: "create",
          after: {
            nameBn: input.name.bn,
            milkWithdrawalDays: input.milkWithdrawalDays ?? null,
            meatWithdrawalDays: input.meatWithdrawalDays ?? null,
          },
        },
        (tx) =>
          tx.insert(drugProduct).values({
            id,
            farmId: context.farm.id,
            nameBn: input.name.bn,
            nameEn: input.name.en ?? null,
            milkWithdrawalDays: input.milkWithdrawalDays ?? null,
            meatWithdrawalDays: input.meatWithdrawalDays ?? null,
            daysSetBy: withDays ? context.actor.id : null,
            daysSetAt: withDays ? now : null,
            addedBy: context.actor.id,
            addedByRole: context.roleUsed,
            createdAt: now,
          })
      );
      return { id };
    }),

  /**
   * The Vet writes the withdrawal days off the label — and only from their own account, not
   * from a Shed Phone with somebody PIN-switched in: these days are the prescriber's
   * statement and the farm's evidence at slaughter.
   */
  setWithdrawal: protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        id: z.string(),
        milkWithdrawalDays: days,
        meatWithdrawalDays: days,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await changeProduct(context, input.id, (tx) =>
        tx
          .update(drugProduct)
          .set({
            milkWithdrawalDays: input.milkWithdrawalDays,
            meatWithdrawalDays: input.meatWithdrawalDays,
            daysSetBy: context.actor.id,
            daysSetAt: now,
          })
          .where(
            and(
              eq(drugProduct.id, input.id),
              eq(drugProduct.farmId, context.farm.id)
            )
          )
          .returning({ id: drugProduct.id })
      );
      return { id: input.id };
    }),

  /** Retired, never removed: a Treatment given last March still names its product. Taking
   *  something out of what may be prescribed is the Vet's call (roles matrix). */
  retire: protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await changeProduct(context, input.id, (tx) =>
        tx
          .update(drugProduct)
          .set({ retiredAt: now })
          .where(
            and(
              eq(drugProduct.id, input.id),
              eq(drugProduct.farmId, context.farm.id),
              isNull(drugProduct.retiredAt)
            )
          )
          .returning({ id: drugProduct.id })
      );
      return { id: input.id };
    }),

  /** A retired product bought again. The Vet's, like retiring it. */
  bringBack: protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      await changeProduct(context, input.id, (tx) =>
        tx
          .update(drugProduct)
          .set({ retiredAt: null })
          .where(
            and(
              eq(drugProduct.id, input.id),
              eq(drugProduct.farmId, context.farm.id)
            )
          )
          .returning({ id: drugProduct.id })
      );
      return { id: input.id };
    }),
};
