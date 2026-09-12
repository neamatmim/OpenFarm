import type { Database } from "@OpenFarm/db";
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { sale } from "@OpenFarm/db/schema/fattening";
import type { FarmOfOrigin } from "@OpenFarm/domain";
import {
  farmDayOf,
  saleReceipt,
  startOfFarmDay,
  transportCard,
  underMeatWithdrawal,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { loadLiveAnimal, recordExit } from "../herd-store";
import { protectedProcedure } from "../index";
import { fatteningRows } from "../ready-store";
import { requireOnly, requireRole } from "../roles";

const tagInput = z.string().trim().min(1).max(32);

/** A day's sales to one buyer. More than this on one morning is a different kind of farm. */
const LOAD_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * Every Sale to one buyer on the farm-day of a given Sale — which is what one receipt covers and
 * what one lorry carries.
 *
 * At Eid a man buys five beasts in a morning. Grouping by the buyer and the day is how the farm
 * hands him one piece of paper instead of five, and it is also how the lorry's card knows what is
 * on the lorry.
 */
const theLoad = async (db: Database, farmId: string, saleId: string) => {
  const one = await db.query.sale.findFirst({
    where: { id: saleId, farmId },
    columns: { counterpartyId: true, soldAt: true },
  });
  if (!one) {
    throw new ORPCError("NOT_FOUND", { message: "No such sale" });
  }
  const from = startOfFarmDay(farmDayOf(one.soldAt));
  const rows = await db.query.sale.findMany({
    where: {
      farmId,
      counterpartyId: one.counterpartyId,
      soldAt: { gte: from, lt: new Date(from.getTime() + DAY_MS) },
    },
    orderBy: { soldAt: "asc", id: "asc" },
    limit: LOAD_LIMIT,
    columns: {
      id: true,
      priceBdt: true,
      weightKg: true,
      destination: true,
      vehicle: true,
      driver: true,
      soldAt: true,
    },
    with: {
      animal: { columns: { tagNumber: true } },
      buyer: { columns: { name: true, address: true, phone: true } },
    },
  });
  const [first] = rows;
  if (!first) {
    throw new ORPCError("NOT_FOUND", { message: "No such sale" });
  }
  return { rows, first, day: one.soldAt };
};

/** The farm as both papers print it at their head. */
const farmOfOrigin = (farm: {
  name: string;
  address: string | null;
  phone: string | null;
  registrationNumber: string | null;
}): FarmOfOrigin => ({
  name: farm.name,
  address: farm.address,
  phone: farm.phone,
  registrationNumber: farm.registrationNumber,
});

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
    .use(
      requireOnly("manager", {
        message:
          "Selling an animal is the Manager's to record; the Owner approves what it fetched",
        reason: "manager_only",
      })
    )
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
          ({ workClosed: closed } = await recordExit(tx, context.farm.id, her, {
            state: "sold",
            at: soldAt,
            now,
          }));
        }
      );
      return { id, tagNumber, state: "sold" as const, workClosed: closed };
    }),

  /**
   * What the farm sold on a day, newest first — the list a receipt or a card is asked for from.
   */
  day: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ day: farmDay.optional() }).optional())
    .handler(async ({ context, input }) => {
      const from = startOfFarmDay(input?.day ?? farmDayOf(context.clock.now()));
      const rows = await context.db.query.sale.findMany({
        where: {
          farmId: context.farm.id,
          soldAt: { gte: from, lt: new Date(from.getTime() + DAY_MS) },
        },
        orderBy: { soldAt: "desc", id: "desc" },
        limit: LOAD_LIMIT,
        columns: { id: true, priceBdt: true, weightKg: true, soldAt: true },
        with: {
          animal: { columns: { tagNumber: true } },
          buyer: { columns: { name: true } },
        },
      });
      return rows.map(({ animal: beast, buyer, ...row }) => ({
        ...row,
        priceBdt: Number(row.priceBdt),
        weightKg: Number(row.weightKg),
        tagNumber: beast.tagNumber,
        buyerName: buyer.name,
      }));
    }),

  /**
   * The receipt for everything one buyer took on one day.
   *
   * Producing it is an Audit Event of its own — a paper that went with a buyer is the farm's
   * evidence, and "when did you write it" is a question with an answer.
   */
  receipt: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ saleId: z.string() }))
    .handler(async ({ context, input }) => {
      const { rows, first, day } = await theLoad(
        context.db,
        context.farm.id,
        input.saleId
      );
      const animals = rows.map((row) => ({
        tagNumber: row.animal.tagNumber,
        weight: formatNumber(Number(row.weightKg), "bn"),
        price: formatNumber(Number(row.priceBdt), "bn"),
      }));
      const totalBdt = rows.reduce((sum, row) => sum + Number(row.priceBdt), 0);
      const text = saleReceipt({
        farm: farmOfOrigin(context.farm),
        buyerName: first.buyer.name,
        buyerAddress: first.buyer.address,
        buyerPhone: first.buyer.phone,
        day: formatDate(day, "bn", "date"),
        animals,
        total: formatNumber(totalBdt, "bn"),
      });
      await audited(context).write(
        {
          entity: "sale",
          entityId: input.saleId,
          action: "export",
          after: {
            paper: "receipt",
            animals: animals.length,
            totalBdt,
            characters: text.length,
          },
        },
        () => Promise.resolve()
      );
      return {
        text,
        animals: animals.map((one) => one.tagNumber),
        totalBdt,
      };
    }),

  /**
   * The card the lorry carries for one buyer's load: farm of origin with its registration
   * number, the animals by tag, where they are going and who is driving (Meat Rules 2021 r.18).
   *
   * A farm that has not written its registration down is told what is missing rather than handed
   * a card with a hole in it — a card that looks lawful and is not is worse than no card.
   */
  transportCard: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ saleId: z.string() }))
    .handler(async ({ context, input }) => {
      if (!context.farm.registrationNumber?.trim()) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The farm's DLS registration number is not recorded, and a transport card cannot be written without it",
          data: {
            refusal: "farm_identity_incomplete",
            missing: "registrationNumber",
          },
        });
      }
      const { rows, first, day } = await theLoad(
        context.db,
        context.farm.id,
        input.saleId
      );
      const tagNumbers = rows.map((row) => row.animal.tagNumber);
      const text = transportCard({
        farm: farmOfOrigin(context.farm),
        buyerName: first.buyer.name,
        destination: first.destination,
        vehicle: first.vehicle,
        driver: first.driver,
        when: formatDate(day, "bn", "dateTime"),
        tagNumbers,
        count: formatNumber(tagNumbers.length, "bn"),
      });
      await audited(context).write(
        {
          entity: "sale",
          entityId: input.saleId,
          action: "export",
          after: {
            paper: "transport_card",
            animals: tagNumbers.length,
            characters: text.length,
          },
        },
        () => Promise.resolve()
      );
      return { text, animalCount: tagNumbers.length, tagNumbers };
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
