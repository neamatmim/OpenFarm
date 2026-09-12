import type { Database } from "@OpenFarm/db";
import type { FarmIdentity } from "@OpenFarm/domain";
import {
  farmDayOf,
  saleReceipt,
  startOfFarmDay,
  transportCard,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber, resolveLanguage } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** The language of whoever is making the paper, Bangla when they have never said. */
const languageOf = async (db: Database, userId: string): Promise<Language> => {
  const row = await db.query.user.findFirst({
    where: { id: userId },
    columns: { language: true },
  });
  return resolveLanguage(row);
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A buyer's animals on one day. More than this on one morning is a different kind of farm,
 *  and a paper that quietly left some off would be worse than one that refused. */
const LOAD_LIMIT = 200;

/**
 * What one buyer took on one day, and what went on one lorry.
 *
 * Two different questions, and the papers answer them differently. The **receipt** covers
 * everything he took that day — at Eid a man buys five beasts before breakfast, and handing him
 * five sheets is how one gets lost. The **transport card** covers one Load: the animals that went
 * to one destination, on one vehicle, with one driver. A card listing a day's worth of beasts
 * above one lorry's registration would assert a load that was never on that lorry, which is the
 * thing Meat Rules r.18 exists to prevent.
 */
const salesWith = async (
  db: Database,
  farmId: string,
  saleId: string,
  /** True for the transport card: narrow the day's sales to the one lorry-load. */
  oneLorry: boolean
) => {
  const one = await db.query.sale.findFirst({
    where: { id: saleId, farmId },
    columns: {
      counterpartyId: true,
      soldAt: true,
      destination: true,
      vehicle: true,
      driver: true,
    },
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
      ...(oneLorry
        ? {
            destination: one.destination,
            vehicle: one.vehicle,
            driver: one.driver,
          }
        : {}),
    },
    orderBy: { soldAt: "asc", id: "asc" },
    limit: LOAD_LIMIT + 1,
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
  if (rows.length > LOAD_LIMIT) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "That is more animals than one paper can carry; the farm would rather refuse than leave some off",
      data: { refusal: "too_many_for_one_paper", limit: LOAD_LIMIT },
    });
  }
  const [first] = rows;
  if (!first) {
    throw new ORPCError("NOT_FOUND", { message: "No such sale" });
  }
  return { rows, first, day: one.soldAt };
};

/** What the trail records about a paper that went with a buyer. The Registration number is part
 *  of it because every Export is stamped with it (CONTEXT: Export), and because "which
 *  registration did that card quote" is a question an inspector can ask years later. */
const exportedPaper = (
  farm: FarmIdentity,
  paper: "receipt" | "transport_card",
  tagNumbers: string[],
  extra: Record<string, unknown> = {}
) => ({
  paper,
  registrationNumber: farm.registrationNumber,
  // The tags are what the paper said; a count alone could not be checked against it.
  tagNumbers,
  ...extra,
});

export const papersRouter = {
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
        columns: {
          id: true,
          priceBdt: true,
          weightKg: true,
          soldAt: true,
          destination: true,
          vehicle: true,
        },
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
   * evidence, and "when did you write it, and what did it say" are questions with answers.
   */
  receipt: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ saleId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const { rows, first, day } = await salesWith(
        context.db,
        context.farm.id,
        input.saleId,
        false
      );
      // The receipt is the farm's own paper, so it reads in the language of whoever is making
      // it. The transport card does not get that choice: r.18 is a form for an authority.
      const language = await languageOf(context.db, context.actor.id);
      const animals = rows.map((row) => ({
        tagNumber: row.animal.tagNumber,
        weight: formatNumber(Number(row.weightKg), language),
        price: formatNumber(Number(row.priceBdt), language),
      }));
      const totalBdt = rows.reduce((sum, row) => sum + Number(row.priceBdt), 0);
      const text = saleReceipt({
        farm: context.farm,
        buyerName: first.buyer.name,
        buyerAddress: first.buyer.address,
        buyerPhone: first.buyer.phone,
        day: formatDate(day, language, "date"),
        animals,
        total: formatNumber(totalBdt, language),
        producedBy: context.actor.name,
        producedAt: formatDate(now, language, "dateTime"),
      });
      const tagNumbers = animals.map((one) => one.tagNumber);
      await audited(context).write(
        {
          entity: "sale",
          entityId: input.saleId,
          action: "export",
          after: exportedPaper(context.farm, "receipt", tagNumbers, {
            totalBdt,
          }),
        },
        () => Promise.resolve()
      );
      return { text, animals: tagNumbers, totalBdt };
    }),

  /**
   * The card one lorry carries: farm of origin with its registration number, the animals on that
   * vehicle by tag, where they are going and who is driving (Meat Rules 2021 r.18).
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
      const now = context.clock.now();
      const { rows, first, day } = await salesWith(
        context.db,
        context.farm.id,
        input.saleId,
        true
      );
      const tagNumbers = rows.map((row) => row.animal.tagNumber);
      // Bangla throughout, whoever is printing it: this is an authority's form, and the labels
      // carry their English alongside rather than swapping for it.
      const text = transportCard({
        farm: context.farm,
        buyerName: first.buyer.name,
        destination: first.destination,
        vehicle: first.vehicle,
        driver: first.driver,
        when: formatDate(day, "bn", "dateTime"),
        tagNumbers,
        count: formatNumber(tagNumbers.length, "bn"),
        producedBy: context.actor.name,
        producedAt: formatDate(now, "bn", "dateTime"),
      });
      await audited(context).write(
        {
          entity: "sale",
          entityId: input.saleId,
          action: "export",
          after: exportedPaper(context.farm, "transport_card", tagNumbers, {
            destination: first.destination,
            vehicle: first.vehicle,
          }),
        },
        () => Promise.resolve()
      );
      return { text, animalCount: tagNumbers.length, tagNumbers };
    }),
};
