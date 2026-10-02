import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { FARM_ACCOUNT_KINDS, farmAccount } from "@OpenFarm/db/schema/money";
import { maskedDigits } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";

// The Farm's own bKash numbers and bank accounts — its **Farm Accounts** — where its money by bKash or the bank goes in
// and comes out. The Owner's to list and retire; everyone who writes money picks one by its name and last digits.

/** A Farm Account as the trail records it. */
const readFarmAccount = async (tx: Tx, id: string) =>
  (await tx.query.farmAccount.findFirst({ where: { id } })) ?? null;

export const farmAccountsRouter = {
  /**
   * Every Farm Account, the retired ones last and said so: a Correction to old money may still name one. The number
   * whole for the Owner; for anybody else, every digit but the last four hidden, as an Investor's bank is.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.farmAccount.findMany({
        where: { farmId: context.farm.id },
        orderBy: { createdAt: "asc", id: "asc" },
      });
      const owner = context.roles.includes("owner");
      return rows
        .map((one) => ({
          id: one.id,
          kind: one.kind,
          name: one.name,
          number: owner ? one.number : maskedDigits(one.number),
          bank: one.bank,
          branch: one.branch,
          retired: one.retiredAt !== null,
        }))
        .toSorted((a, b) => Number(a.retired) - Number(b.retired));
    }),

  /** One of the Farm's bKash numbers or bank accounts listed. One per kind and number, retired or not. */
  add: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        kind: z.enum(FARM_ACCOUNT_KINDS),
        name: z.string().trim().min(1).max(80),
        number: z.string().trim().min(3).max(40),
        bank: z.string().trim().max(80).optional(),
        branch: z.string().trim().max(80).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "farm_account",
          entityId: id,
          action: "create",
          after: (tx) => readFarmAccount(tx, id),
        },
        async (tx) => {
          const same = await tx.query.farmAccount.findFirst({
            where: {
              farmId: context.farm.id,
              kind: input.kind,
              number: input.number,
            },
            columns: { id: true },
          });
          if (same) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That number is listed already",
              data: { refusal: "farm_account_listed_already" },
            });
          }
          await tx.insert(farmAccount).values({
            id,
            farmId: context.farm.id,
            kind: input.kind,
            name: input.name,
            number: input.number,
            bank: input.kind === "bank" ? (input.bank ?? null) : null,
            branch: input.kind === "bank" ? (input.branch ?? null) : null,
            createdBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /** Retired, never removed: money booked last year still names it, and no new money may. */
  retire: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "farm_account",
          entityId: input.id,
          action: "update",
          before: (tx) => readFarmAccount(tx, input.id),
          after: (tx) => readFarmAccount(tx, input.id),
        },
        async (tx) => {
          await tx
            .update(farmAccount)
            .set({ retiredAt: now })
            .where(
              and(
                eq(farmAccount.id, input.id),
                eq(farmAccount.farmId, context.farm.id)
              )
            );
        }
      );
      return { id: input.id };
    }),
};
