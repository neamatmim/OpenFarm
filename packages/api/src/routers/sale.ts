import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { sale } from "@OpenFarm/db/schema/fattening";
import {
  farmDayOf,
  startOfFarmDay,
  underMeatWithdrawal,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { correct } from "../corrections/correction";
import { saleCorrection, saleCorrectionInput } from "../corrections/sale";
import { counterpartyNamed } from "../counterparty-store";
import { leaves, loadLiveAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { paymentMethodInput } from "../money-inputs";
import { bookingOf } from "../money-store";
import { fatteningRows } from "../ready-store";
import { requireOnly, requireRole } from "../roles";
import { bookSaleMoney, buyerInput, priceInput, readSale } from "../sale-store";

const tagInput = z.string().trim().min(1).max(32);

const DAY_MS = 24 * 60 * 60 * 1000;

const MANAGER_ONLY = {
  message:
    "Selling an animal is the Manager's to record; the Owner approves what it fetched",
  reason: "manager_only",
} as const;

export const saleRouter = {
  /**
   * The animals that can actually be sold this morning: confirmed Ready, and not inside their
   * days.
   *
   * Answered here rather than filtered on the phone, because the phone cannot see a withdrawal
   * — and a beast confirmed Ready last week and treated on Thursday would sit in the list
   * looking sellable and refuse whoever pressed the button.
   */
  sellable: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const rows = await fatteningRows(
        context.db,
        context.farm.id,
        { states: ["ready_for_sale"] },
        now
      );
      return rows.flatMap((row) =>
        underMeatWithdrawal(row, now)
          ? []
          : [
              {
                id: row.id,
                tagNumber: row.tagNumber,
                penName: row.penName,
                /** What she last weighed, as the figure the Manager starts from. */
                latestKg: row.view.latestKg,
              },
            ]
      );
    }),

  /**
   * Sells an Animal: who took her, for how much, what she weighed on the day, where she went
   * and what carried her.
   *
   * **Hard-gated by meat Withdrawal.** Not warned about and not overridable: this is the one
   * gate that stops a farm selling meat it cannot say is safe, and the refusal names the day she
   * is fit so somebody can plan around it rather than argue with it. She is read live and inside
   * the transaction, so a dose recorded while this request was in flight still stops the sale.
   *
   * The gate is asked about **the day she went**, not the day somebody typed it up. A sale made
   * inside her days and written up a fortnight later is still a sale made inside her days, and
   * back-dating is exactly how it would otherwise be got around.
   *
   * A cull that ends at a butcher is one of these and not a Mortality (the Owner's decision,
   * 2026-09-12): one exit, one record, and the reason she was culled in the note.
   *
   * The Manager's alone (roles matrix: Intake / Sale is `C R U` to the Manager and `R; approve
   * above threshold` to the Owner). The Owner's part is the check above the Approval Threshold,
   * which arrives with finance in increment 6.
   */
  record: protectedProcedure
    .use(requireOnly("manager", MANAGER_ONLY))
    .input(
      z.object({
        tagNumber: tagInput,
        buyer: buyerInput,
        priceBdt: priceInput,
        /** What she weighed on the day, which is what the price was struck on. */
        weightKg: z.number().positive().max(2000),
        destination: z.string().trim().min(1).max(200),
        vehicle: z.string().trim().min(1).max(60),
        driver: z.string().trim().min(1).max(120),
        /** Why she went, when there is a reason worth writing — a culled cow's belongs here. */
        note: z.string().trim().max(300).optional(),
        /** When she left, for a sale written up that evening. */
        soldAt: z.coerce.date().optional(),
        /** How the buyer paid. */
        paymentMethod: paymentMethodInput,
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
          // Belt as well as braces: the unique index is the guarantee, and this is the message
          // somebody reads when two phones sell one beast in the same minute.
          const already = await tx.query.sale.findFirst({
            where: { animalId: her.id },
            columns: { id: true },
          });
          if (already) {
            throw new ORPCError("BAD_REQUEST", {
              message: "She has already been sold",
              data: { refusal: "already_sold" },
            });
          }
          if (underMeatWithdrawal(her, soldAt)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "She is still inside her meat withdrawal",
              data: {
                refusal: "meat_withdrawal",
                fitOn: her.meatWithdrawalUntil?.toISOString() ?? null,
              },
            });
          }
          const buyerId = await counterpartyNamed(
            tx,
            context.farm.id,
            input.buyer,
            now
          );
          await tx.insert(sale).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            counterpartyId: buyerId,
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
          await bookSaleMoney(
            tx,
            bookingOf(context, context.roleUsed, now),
            id,
            input.paymentMethod
          );
          ({ workClosed: closed } = await leaves(tx, context.farm.id, her, {
            state: "sold",
            at: soldAt,
            now,
          }));
        }
      );
      return { id, tagNumber, state: "sold" as const, workClosed: closed };
    }),

  /**
   * Puts right what a Sale says she fetched, who bought her, or how he paid — and with it the Money Event,
   * rather than a second one. A Correction like any other: a reason, the Role's Correction Window, and
   * the trail holding what it said before. She stays sold: the way she left is not what is corrected.
   *
   * The Manager's, as recording is, and the Owner's — whose Correction Window never closes (Owner, 2026-09-14: the
   * spec's "Owner always" over the matrix's read-only Owner).
   */
  correct: protectedProcedure
    .use(requireRole(...saleCorrection.roles))
    .input(saleCorrectionInput)
    .handler(({ context, input }) => correct(context, saleCorrection, input)),

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
      const from = startOfFarmDay(farmDayOf(now));
      const row = await context.db.query.sale.findFirst({
        where: {
          farmId: context.farm.id,
          // Both ends of the day. A lower bound alone would reach forward as well as back and
          // offer the buyer of a sale written up with a later date than today's.
          soldAt: { gte: from, lt: new Date(from.getTime() + DAY_MS) },
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
