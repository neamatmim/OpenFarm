import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { sale } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import {
  farmDayOf,
  startOfFarmDay,
  underMeatWithdrawal,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { closeOpenWorkAboutHer, loadLiveAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const tagInput = z.string().trim().min(1).max(32);

/** The Sale as the trail records it, so a Correction has the whole entry to supersede. */
const readSale = async (tx: Tx, id: string) => {
  const row = await tx.query.sale.findFirst({
    where: { id },
    columns: {
      priceBdt: true,
      weightKg: true,
      destination: true,
      vehicle: true,
      driver: true,
      note: true,
      soldAt: true,
    },
    with: { buyer: { columns: { name: true } } },
  });
  return row ?? null;
};

export const saleRouter = {
  /**
   * Sells an Animal: who took her, for how much, what she weighed on the day, where she went
   * and what carried her.
   *
   * **Hard-gated by meat Withdrawal.** Not warned about and not overridable: this is the one
   * gate that stops a farm selling meat it cannot say is safe, and the refusal names the day she
   * is fit so somebody can plan around it rather than argue with it. She is read live and inside
   * the transaction, so a dose recorded while this request was in flight still stops the sale.
   *
   * A cull that ends at a butcher is one of these and not a Mortality (the Owner's decision,
   * 2026-09-12): one exit, one record, and the reason she was culled in the note.
   *
   * The Manager records it; the Owner checks it above the Approval Threshold, which arrives with
   * finance in increment 6.
   */
  record: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        buyer: z.object({
          name: z.string().trim().min(1).max(120),
          address: z.string().trim().max(200).optional(),
          phone: z.string().trim().max(20).optional(),
        }),
        priceBdt: z.number().min(0).max(100_000_000),
        /** What she weighed on the day, which is what the price was struck on. */
        weightKg: z.number().positive().max(2000),
        destination: z.string().trim().min(1).max(200),
        vehicle: z.string().trim().min(1).max(60),
        driver: z.string().trim().min(1).max(120),
        /** Why she went, when there is a reason worth writing — a culled cow's belongs here. */
        note: z.string().trim().max(300).optional(),
        /** When she left, for a sale written up that evening. */
        soldAt: z.coerce.date().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const soldAt = input.soldAt ?? now;
      if (soldAt.getTime() > now.getTime()) {
        throw new ORPCError("BAD_REQUEST", {
          message: "An animal cannot have been sold tomorrow",
        });
      }
      const id = newId(now);
      let closed = 0;
      await audited(context).write(
        {
          // Keyed on the Sale, so putting it right later is a Correction pointing at this event
          // rather than an edit nothing links back to.
          entity: "sale",
          entityId: id,
          action: "create",
          after: (tx) => readSale(tx, id),
        },
        async (tx) => {
          // Live, because an animal who has already left cannot leave again — and a second exit
          // written over the first would lose which one the farm stands behind.
          const her = await loadLiveAnimal(tx, context.farm.id, tagNumber);
          if (underMeatWithdrawal(her, now)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "She is still inside her meat withdrawal",
              data: {
                refusal: "meat_withdrawal",
                fitOn: her.meatWithdrawalUntil?.toISOString() ?? null,
              },
            });
          }
          await tx.insert(sale).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            counterpartyId: await counterpartyNamed(
              tx,
              context.farm.id,
              input.buyer,
              now
            ),
            priceBdt: input.priceBdt.toFixed(2),
            weightKg: input.weightKg.toFixed(2),
            destination: input.destination,
            vehicle: input.vehicle,
            driver: input.driver,
            note: input.note ?? null,
            soldAt,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            createdAt: now,
          });
          await tx
            .update(animal)
            .set({ state: "sold", stateChangedAt: soldAt, updatedAt: now })
            .where(
              and(eq(animal.id, her.id), eq(animal.farmId, context.farm.id))
            );
          // Work about her outlives her otherwise: a weigh-in due next week going late and
          // telling somebody to fetch a beast that left on a lorry.
          const settled = await closeOpenWorkAboutHer(
            tx,
            context.farm.id,
            her.id
          );
          closed = settled.length;
        }
      );
      return { tagNumber, state: "sold" as const, workClosed: closed };
    }),

  /**
   * The last Sale of the farm's own day, for the next one to start from.
   *
   * At Eid several animals go to one buyer in one morning, and asking for his name, his address,
   * his lorry and his driver five times is how a farm ends up with five spellings of one man.
   * Null on a day nothing has been sold: yesterday's buyer is a different market.
   */
  lastToday: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const row = await context.db.query.sale.findFirst({
        where: {
          farmId: context.farm.id,
          soldAt: { gte: startOfFarmDay(farmDayOf(now)) },
        },
        orderBy: { soldAt: "desc", id: "desc" },
        columns: { destination: true, vehicle: true, driver: true },
        with: {
          buyer: { columns: { name: true, address: true, phone: true } },
        },
      });
      if (!row) {
        return null;
      }
      const { buyer, ...transport } = row;
      return {
        ...transport,
        buyerName: buyer.name,
        buyerAddress: buyer.address,
        buyerPhone: buyer.phone,
      };
    }),
};
