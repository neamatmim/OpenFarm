import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { drugProduct } from "@OpenFarm/db/schema/health";
import { medicinePurchase } from "@OpenFarm/db/schema/money";
import {
  MAX_WITHDRAWAL_DAYS,
  mayBePrescribed,
  startOfFarmDay,
  whyNotPrescribable,
} from "@OpenFarm/domain";
import { expiryStanding, expiryWindow, runsLow } from "@OpenFarm/domain/lots";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { assertNotExpiredWhenBought, lotFields } from "../lot-input";
import { medicineStockOf, noMedicine } from "../medicine-stock";
import { amountInput, paymentMethodInput } from "../money-inputs";
import { bookMoney, bookingOf } from "../money-store";
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
      vaccine: true,
      retiredAt: true,
      lowStockAt: true,
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
    .use(requireRole("owner", "manager", "vet", { visitingVet: true }))
    .handler(async ({ context }) => {
      const rows = await context.db.query.drugProduct.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc" },
        with: { setBy: { columns: { name: true } } },
      });
      const stock = await medicineStockOf(
        context.db,
        context.farm.id,
        expiryWindow(context.clock.now(), context.farm.expiryWarnDays)
      );
      return rows.map(({ setBy, ...row }) => {
        const held = stock.get(row.id) ?? noMedicine();
        return {
          ...row,
          /** What the store holds of it, in doses and by Lot, and whether that is under the level set for it. */
          stock: {
            ...held,
            lowStockAt: row.lowStockAt,
            runningLow: runsLow({
              onHand: held.onHand,
              level: row.lowStockAt,
              retired: row.retiredAt !== null,
            }),
          },
          /** Who said what the days are: evidence, so it is shown and not only stored. */
          daysSetByName: setBy?.name ?? null,
          prescribable: mayBePrescribed(row),
          /** Why not — the same answer the refusal will give, because it is the same
           *  question. A reason rather than a sentence: the words belong to the reader. */
          whyNot: whyNotPrescribable(row),
        };
      });
    }),

  /**
   * Medicine bought for a product on the Drug List: how much in the words on the box, roughly how many
   * doses that is, what it cost, and who sold it. It becomes the Money Event for the medicine, and the
   * doses are what a dose given is later costed from (the Owner's decision, 2026-09-13).
   *
   * The Manager's to record, or the Owner's, who may do anything the Manager does (the Owner,
   * 2026-09-17). A retired product is not bought.
   */
  purchase: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        drugProductId: z.string(),
        quantity: z.string().trim().min(1).max(60),
        doses: z.number().int().positive().max(100_000),
        priceBdt: amountInput,
        seller: z.object({
          name: z.string().trim().min(1).max(120),
          address: z.string().trim().max(300).optional(),
          phone: z.string().trim().max(40).optional(),
        }),
        purchasedOn: farmDay,
        paymentMethod: paymentMethodInput,
        ...lotFields,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const purchasedOn = startOfFarmDay(input.purchasedOn);
      assertNotExpiredWhenBought(input.expiresOn, input.purchasedOn);
      if (purchasedOn > now) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Medicine cannot have been bought on a day that has not come yet",
          data: { refusal: "bought_in_the_future" },
        });
      }
      const product = await context.db.query.drugProduct.findFirst({
        where: { id: input.drugProductId, farmId: context.farm.id },
        columns: { id: true, retiredAt: true },
      });
      if (!product) {
        throw new ORPCError("NOT_FOUND", { message: "No such product" });
      }
      if (product.retiredAt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "That product is retired; the Vet brings it back before more is bought",
          data: { refusal: "drug_retired" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "medicine_purchase",
          entityId: id,
          action: "create",
          after: async (tx) =>
            (await tx.query.medicinePurchase.findFirst({ where: { id } })) ??
            null,
        },
        async (tx) => {
          const sellerId = await counterpartyNamed(
            tx,
            context.farm.id,
            input.seller,
            now
          );
          await tx.insert(medicinePurchase).values({
            id,
            farmId: context.farm.id,
            drugProductId: product.id,
            quantity: input.quantity,
            doses: input.doses,
            priceBdt: input.priceBdt,
            counterpartyId: sellerId,
            purchasedOn,
            lotNumber: input.lotNumber ?? null,
            expiresOn: input.expiresOn ?? null,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            recordedAt: now,
          });
          await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
            source: "medicine_purchase",
            sourceId: id,
            amountBdt: input.priceBdt,
            occurredAt: purchasedOn,
            counterpartyId: sellerId,
            paymentMethod: input.paymentMethod,
          });
        }
      );
      return { id };
    }),

  /** What the farm has bought of a product, newest first. The Owner's and the Manager's: it carries
   *  prices, and money is not the Vet's or Barn Staff's. */
  purchases: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ drugProductId: z.string() }))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.medicinePurchase.findMany({
        where: { farmId: context.farm.id, drugProductId: input.drugProductId },
        with: { seller: { columns: { name: true } } },
        orderBy: { purchasedOn: "desc", id: "desc" },
        limit: 100,
      });
      const window = expiryWindow(
        context.clock.now(),
        context.farm.expiryWarnDays
      );
      const stock = await medicineStockOf(context.db, context.farm.id, window);
      const lotOf = new Map(
        (stock.get(input.drugProductId)?.lots ?? []).map(
          (one) => [one.purchaseId, one] as const
        )
      );
      return rows.map((row) => ({
        id: row.id,
        quantity: row.quantity,
        doses: row.doses,
        priceBdt: row.priceBdt,
        sellerName: row.seller.name,
        purchasedOn: row.purchasedOn,
        lotNumber: row.lotNumber,
        expiresOn: row.expiresOn,
        /** Doses of this Lot still in the store, the first to expire taken first. */
        left: lotOf.get(row.id)?.left ?? row.doses,
        /** Where it stands against its day, by the farm's own warning. */
        standing:
          lotOf.get(row.id)?.standing ?? expiryStanding(row.expiresOn, window),
      }));
    }),

  /**
   * The doses on hand below which the store says a product is running low, or none. The Manager's, as a Feed
   * Item's level is: keeping the store stocked is who buys for it.
   */
  setLowStock: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        drugProductId: z.string(),
        threshold: z.number().int().min(0).max(100_000).nullable(),
      })
    )
    .handler(async ({ context, input }) => {
      await changeProduct(context, input.drugProductId, (tx) =>
        tx
          .update(drugProduct)
          .set({ lowStockAt: input.threshold })
          .where(
            and(
              eq(drugProduct.id, input.drugProductId),
              eq(drugProduct.farmId, context.farm.id)
            )
          )
          .returning({ id: drugProduct.id })
      );
      return { id: input.drugProductId };
    }),

  /**
   * Adds a product. The Manager may add one the day it is bought, with the days blank —
   * buying is not blocked on the Vet being reachable — and the Vet may add one outright. The
   * Owner may add one as the Manager does; the withdrawal days stay the Vet's to write.
   */
  add: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
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

  /**
   * The Vet says whether a product is a vaccine: its doses then go on the vaccination register, and a campaign
   * giving it asks which lot it came from. The Vet's, from their own phone, as the withdrawal days are — it is
   * the prescriber's statement of what the product is.
   */
  markVaccine: protectedProcedure
    .use(requireOnly("vet", VET_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), vaccine: z.boolean() }))
    .handler(async ({ context, input }) => {
      await changeProduct(context, input.id, (tx) =>
        tx
          .update(drugProduct)
          .set({ vaccine: input.vaccine })
          .where(
            and(
              eq(drugProduct.id, input.id),
              eq(drugProduct.farmId, context.farm.id)
            )
          )
          .returning({ id: drugProduct.id })
      );
      return { id: input.id, vaccine: input.vaccine };
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
