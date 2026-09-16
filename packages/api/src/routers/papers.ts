import type { Database } from "@OpenFarm/db";
import type { FarmIdentity } from "@OpenFarm/domain";
import {
  WITHDRAWAL_LOOK_BACK_DAYS,
  animalPassport,
  farmDayOf,
  saleReceipt,
  startOfFarmDay,
  transportCard,
  withdrawalSummary,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { herRecord } from "../animal-record";
import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  ageWords,
  doseWords,
  herWithdrawalWords,
  penSpellWords,
  sourceWords,
} from "../paper-words";
import { languageOf } from "../reader-language";
import { requireRole } from "../roles";
import { requireLookUp } from "../scope";

const DAY_MS = 24 * 60 * 60 * 1000;

const tagInput = z.string().trim().min(1).max(32);

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
  paper: "receipt" | "transport_card" | "passport" | "withdrawal_summary",
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
   * Everything the farm knows about one animal, on one page, for whoever asks — a buyer before
   * they buy, a slaughter vet afterwards.
   *
   * The Vet may produce it as well as the Owner and the Manager: the roles matrix gives them
   * health reports to export, and this is the one a slaughter vet asks the farm for. Barn Staff
   * may not — they give the doses and record what they see; what the farm tells the outside world
   * about an animal is not theirs to hand over.
   */
  passport: protectedProcedure
    .use(requireRole("owner", "manager", "vet", { visitingVet: true }))
    .input(z.object({ tagNumber: tagInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const her = await herRecord(
        context.db,
        context.farm.id,
        input.tagNumber,
        now
      );
      requireLookUp(context.scope, her);
      const text = animalPassport({
        farm: context.farm,
        tagNumber: her.tagNumber,
        sex: her.sex,
        breed: her.breed,
        age: ageWords(her, language),
        source: sourceWords(her),
        // The day the Intake says she came, which is not the day she was written down: an animal bought last
        // week and entered today arrived last week. A calf born here has no arrival line.
        arrived: her.arrival?.intake
          ? formatDate(her.arrival.intake.arrivedAt, language, "date")
          : null,
        // Her Pen Spells as her record works them out: the last one ends when she left, so the paper never says a
        // cow who has gone stands in a Pen still.
        pens: penSpellWords(her.penSpells, language),
        doses: her.doses.map((dose) => doseWords(dose, language)),
        ...herWithdrawalWords(her.withdrawal, language),
        moreThanShown: her.moreThanShown,
        weighIns: her.weighIns.map((one) => ({
          weight: formatNumber(Number(one.weightKg), language),
          on: formatDate(one.weighedAt, language, "date"),
        })),
        // Where she went, not who took her: R7 names the destination, and one buyer's name is
        // not the next holder's business.
        leftFor: her.exit?.sale?.destination ?? null,
        producedBy: context.actor.name,
        producedAt: formatDate(now, language, "dateTime"),
      });
      await audited(context).write(
        {
          entity: "animal",
          entityId: her.id,
          action: "export",
          after: exportedPaper(context.farm, "passport", [her.tagNumber], {
            doses: her.doses.length,
          }),
        },
        () => Promise.resolve()
      );
      return { text, tagNumber: her.tagNumber };
    }),

  /**
   * The sharp question on its own page: has she had anything lately, and may her meat be sold
   * today.
   *
   * Answered against the farm's own withdrawal record — the same one the Sale is gated on — so
   * the paper a buyer holds and the gate that refused a sale can never disagree.
   */
  withdrawalSummary: protectedProcedure
    .use(requireRole("owner", "manager", "vet", { visitingVet: true }))
    .input(z.object({ tagNumber: tagInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const language = await languageOf(context.db, context.actor.id);
      const her = await herRecord(
        context.db,
        context.farm.id,
        input.tagNumber,
        now
      );
      requireLookUp(context.scope, her);
      // Thirty farm days, not thirty times twenty-four hours: the rule is "the thirty days
      // before slaughter", and a regulator counts them on a calendar.
      const since = new Date(
        startOfFarmDay(farmDayOf(now)).getTime() -
          (WITHDRAWAL_LOOK_BACK_DAYS - 1) * DAY_MS
      );
      const lately = her.doses.filter((dose) => dose.givenAt >= since);
      const held = herWithdrawalWords(her.withdrawal, language);
      const doses = lately.map((dose) => doseWords(dose, language));
      const text = withdrawalSummary({
        farm: context.farm,
        tagNumber: her.tagNumber,
        asOf: formatDate(now, language, "date"),
        ...held,
        doses,
        lookBackDays: formatNumber(WITHDRAWAL_LOOK_BACK_DAYS, language),
        producedBy: context.actor.name,
        producedAt: formatDate(now, language, "dateTime"),
      });
      await audited(context).write(
        {
          entity: "animal",
          entityId: her.id,
          action: "export",
          after: exportedPaper(
            context.farm,
            "withdrawal_summary",
            [her.tagNumber],
            {
              clear: held.clear,
              doses: doses.length,
              // Whether the farm was leaning on a hold a Vet cut short, at the moment it said so.
              shortened: held.shortened !== null,
            }
          ),
        },
        () => Promise.resolve()
      );
      return { text, clear: held.clear, doses };
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
