import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { sale } from "@OpenFarm/db/schema/fattening";
import {
  receivableAtTheGate,
  farmDayOf,
  startOfFarmDay,
  underMeatWithdrawal,
  windowHasClosed,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  tellIfShrankTooMuch,
  tellIfSoldUnderCost,
} from "../animal-price-store";
import { audited } from "../audit";
import { assertTheHand } from "../cash-store";
import { correct } from "../corrections/correction";
import { saleCorrection, saleCorrectionInput } from "../corrections/sale";
import { counterpartyNamed } from "../counterparty-store";
import { leaves, loadLiveAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { tellTheOwnerAPaperIsDue } from "../investor-statement-notice";
import {
  farmAccountIdInput,
  paymentMethodInput,
  referenceInput,
} from "../money-inputs";
import { accountSaid, bookingOf } from "../money-store";
import { fatteningRows } from "../ready-store";
import {
  receivableOrRefuse,
  paidNowInput,
  promisedByInput,
} from "../receivable-store";
import { requireRole } from "../roles";
import {
  bookSaleMoney,
  brokerInput,
  buyerInput,
  readSale,
  salePriceInput,
} from "../sale-store";
import { lastWeighingsBefore } from "../shrink-store";
import { lockTheFarm, reachesSellingOnASale } from "../venture-store";

const tagInput = z.string().trim().min(1).max(32);

const DAY_MS = 24 * 60 * 60 * 1000;

export const saleRouter = {
  /**
   * What she last weighed on the farm, and when: her last Weigh-in, or else what she came in at. Beside the box for what
   * she weighs today, so the Manager sees her Shrink before saving — whichever animal it is, a cull by her tag too.
   */
  lastWeighed: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ tagNumber: tagInput }))
    .handler(async ({ context, input }) => {
      const her = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: input.tagNumber.toUpperCase(),
        },
        columns: { id: true },
      });
      if (!her) {
        return null;
      }
      const last = await lastWeighingsBefore(context.db, context.farm.id, [
        { animalId: her.id, at: context.clock.now() },
      ]);
      return last.get(her.id) ?? null;
    }),

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
                /** Her Eid has gone by and she is still here, confirmed Ready and unsold. */
                windowClosed: windowHasClosed(row.window, now),
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
   * The Manager's or the Owner's: the Owner may do anything the Manager does (the Owner,
   * 2026-09-17), and money the Owner books needs no approval of theirs.
   */
  record: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        buyer: buyerInput,
        priceMoney: salePriceInput,
        /** What she weighed on the day, which is what the price was struck on. */
        weightKg: z.number().positive().max(2000),
        destination: z.string().trim().min(1).max(200),
        vehicle: z.string().trim().min(1).max(60),
        driver: z.string().trim().min(1).max(120),
        /** Why she went, when there is a reason worth writing — a culled cow's belongs here. */
        note: z.string().trim().max(300).optional(),
        /** When she left, for a sale written up that evening. */
        soldAt: z.coerce.date().optional(),
        /** How the buyer paid what he paid. */
        paymentMethod: paymentMethodInput,
        /** Which Farm Account bKash or bank money went into or came out of. */
        farmAccountId: farmAccountIdInput,
        /** Its transaction ID, or the cheque's or slip's number. */
        reference: referenceInput,
        /** Whose hand took the cash, where it was not the writer's: the Owner writing up the Manager's sale. */
        heldBy: z.string().optional(),
        /** What he paid there and then; left out, all of it. Less than the price, and the rest is his Receivable. */
        paidNowMoney: paidNowInput.optional(),
        /** The day he promised to pay the rest by. Asked whenever anything is left owing: a trader promises a day. */
        promisedBy: promisedByInput.optional(),
        /** What the broker at the haat took for this sale, where one was used: paid by the Farm, charged to her. */
        brokerMoney: brokerInput.optional(),
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
      // Asked before anything is written: what he owes is a fact about the handshake, not about the farm.
      const receivable = receivableOrRefuse(
        receivableAtTheGate({
          worthMoney: input.priceMoney,
          paidNowMoney: input.paidNowMoney,
          promisedBy: input.promisedBy,
          leftOn: farmDayOf(soldAt),
          promiseRequired: true,
        })
      );
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
          // First, as everything that counts a Venture's money does: what she fetches may land in a
          // Venture Account, and a count read out from under this write is a count that was true a
          // moment ago.
          await lockTheFarm(tx, context.farm.id);
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
            priceMoney: input.priceMoney,
            ...receivable,
            brokerMoney: input.brokerMoney ?? 0,
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
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["sale"], input)
            ),
            id,
            input.paymentMethod,
            await assertTheHand(
              tx,
              context.farm.id,
              {
                id: context.actor.id,
                roles: context.roles,
              },
              input.heldBy
            )
          );
          // Told, never refused: the haat is the Manager's call, and what she cost is the Owner's to read.
          await tellIfSoldUnderCost(tx, context.farm.id, id, now);
          await tellIfShrankTooMuch(tx, context.farm.id, id, now);
          ({ workClosed: closed } = await leaves(tx, context.farm.id, her, {
            state: "sold",
            at: soldAt,
            now,
            trail: audited(context).recordEvent,
          }));
          // A Venture keeps up with its own animals rather than waiting to be told: the Manager at the
          // haat is not asked whose animal this is, and the Owner is not asked to remember.
          if (her.ownerVentureId) {
            const started = await reachesSellingOnASale(
              tx,
              context.farm.id,
              her.ownerVentureId,
              audited(context).recordEvent
            );
            if (started) {
              // The first Sale: one of the four moments an Investor hears at.
              const its = await tx.query.venture.findFirst({
                where: { id: her.ownerVentureId, farmId: context.farm.id },
                columns: { id: true, name: true, state: true },
              });
              if (its) {
                await tellTheOwnerAPaperIsDue(
                  tx,
                  context.farm.id,
                  its,
                  { kind: "first_sale" },
                  now
                );
              }
            }
          }
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
