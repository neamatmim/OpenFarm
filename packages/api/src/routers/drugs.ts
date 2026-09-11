import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { drugProduct } from "@OpenFarm/db/schema/health";
import {
  MAX_WITHDRAWAL_DAYS,
  findWithdrawalProblems,
  mayBePrescribed,
  whyNotPrescribable,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const name = z.object({
  bn: z.string().trim().min(1).max(120),
  en: z.string().trim().max(120).optional(),
});

const days = z.number().int().min(0).max(MAX_WITHDRAWAL_DAYS);

/** The product as it stands, for the trail to record either side of a change. */
const readProduct = async (
  tx: Parameters<Parameters<ReturnType<typeof audited>["write"]>[1]>[0],
  id: string
) => {
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

export const drugsRouter = {
  /** The farm's Drug List, and which of it may actually be prescribed. */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.drugProduct.findMany({
        where: { farmId: context.farm.id },
        orderBy: { nameBn: "asc" },
      });
      return rows.map((row) => ({
        ...row,
        prescribable: mayBePrescribed(row) && row.retiredAt === null,
        /** Why not, in the words somebody would use — the screens and the refusal both
         *  say the same thing, because they ask the same question. */
        whyNot: whyNotPrescribable(row),
      }));
    }),

  /**
   * Adds a product. The Manager may add one the day it is bought with the days blank —
   * buying is not blocked on the Vet being reachable — and the Vet may add one outright.
   */
  add: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(
      z.object({
        name,
        /** Given only by the Vet: a Manager adds the product, the Vet adds the days. */
        milkWithdrawalDays: days.optional(),
        meatWithdrawalDays: days.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = uuidv7(now);
      const setting =
        input.milkWithdrawalDays !== undefined &&
        input.meatWithdrawalDays !== undefined;
      // Only the Vet says what the days are. A Manager adding a product writes down what
      // the farm owns; what it costs the milk is the prescriber's to state.
      if (setting && context.roleUsed !== "vet") {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Only the Vet writes the withdrawal days; add the product and the Vet will fill them in",
        });
      }
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
            daysSetBy: setting ? context.actor.id : null,
            daysSetAt: setting ? now : null,
            addedBy: context.actor.id,
            addedByRole: context.roleUsed,
            createdAt: now,
          })
      );
      return { id };
    }),

  /** The Vet writes the withdrawal days off the label. Only the Vet: these days are what
   *  the farm will show a slaughter vet, and they are the prescriber's statement. */
  setWithdrawal: protectedProcedure
    .use(requireRole("vet"))
    .input(
      z.object({
        id: z.string(),
        milkWithdrawalDays: days,
        meatWithdrawalDays: days,
      })
    )
    .handler(async ({ context, input }) => {
      const problems = findWithdrawalProblems(input);
      if (problems.length > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Those days do not look right — ${problems.join("; ")}`,
        });
      }
      const now = context.clock.now();
      const existing = await context.db.query.drugProduct.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such product" });
      }
      await audited(context).write(
        {
          entity: "drug_product",
          entityId: input.id,
          action: "update",
          before: (tx) => readProduct(tx, input.id),
          after: (tx) => readProduct(tx, input.id),
        },
        (tx) =>
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
      );
      return { id: input.id };
    }),

  /** Retired, never removed: a Treatment given last March still names its product. */
  retire: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const existing = await context.db.query.drugProduct.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "No such product" });
      }
      await audited(context).write(
        {
          entity: "drug_product",
          entityId: input.id,
          action: "update",
          before: (tx) => readProduct(tx, input.id),
          after: (tx) => readProduct(tx, input.id),
        },
        (tx) =>
          tx
            .update(drugProduct)
            .set({ retiredAt: now })
            .where(
              and(
                eq(drugProduct.id, input.id),
                eq(drugProduct.farmId, context.farm.id)
              )
            )
      );
      return { id: input.id };
    }),
};
