import type { Database } from "@OpenFarm/db";
import type { FarmIdentity } from "@OpenFarm/domain";
import {
  WITHDRAWAL_LOOK_BACK_DAYS,
  animalPassportPaper,
  farmDayOf,
  roundMoney,
  saleReceiptPaper,
  startOfFarmDay,
  transportCardPaper,
  withdrawalEndsAt,
  withdrawalSummaryPaper,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { herRecord } from "../animal-record";
import { audited } from "../audit";
import type { ExportedPaper } from "../export-store";
import { exportedPaper } from "../export-store";
import { farmDay } from "../farm-clock";
import { meatDaysOf, milkDaysOf } from "../health-store";
import { protectedProcedure } from "../index";
import { madeOn } from "../paper-values";
import {
  boughtFromOf,
  doseOnPaper,
  herWithdrawalStanding,
  leftOf,
  penSpellsOf,
} from "../paper-words";
import { owingNowOf } from "../receivable-store";
import { requireRole } from "../roles";
import { requireLookUp } from "../scope";
import { shrinkOfSales } from "../shrink-store";

const DAY_MS = 24 * 60 * 60 * 1000;

const tagInput = z.string().trim().min(1).max(32);

/** A buyer's animals on one day. More than this on one morning is a different kind of farm,
 *  and a paper that quietly left some off would be worse than one that refused. */
const LOAD_LIMIT = 200;

/**
 * What the buyer paid that day and still owed, for the paper he signs, or nothing when he paid in full: the day he
 * promised for each tag he still owed on, which the paper says once where it is one day.
 */
const receivableOnTheReceipt = (
  rows: readonly {
    receivableMoney: number;
    promisedBy: string | null;
    animal: { tagNumber: string };
  }[],
  totalMoney: number
) => {
  const owing = rows.filter((row) => row.receivableMoney > 0);
  if (owing.length === 0) {
    return null;
  }
  const owedMoney = roundMoney(
    owing.reduce((sum, row) => sum + row.receivableMoney, 0)
  );
  return {
    paidMoney: roundMoney(totalMoney - owedMoney),
    owedMoney,
    toBePaidBy: owing.map((row) => ({
      tagNumber: row.animal.tagNumber,
      day: row.promisedBy,
    })),
  };
};

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
      priceMoney: true,
      receivableMoney: true,
      promisedBy: true,
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

/** What the trail records about a paper that went with a buyer: the Export snapshot every paper
 *  carries, and the tags this one said — a count alone could not be checked against it. */
const aboutAnimals = (
  farm: FarmIdentity,
  paper: ExportedPaper,
  tagNumbers: string[],
  extra: Record<string, unknown> = {}
) => exportedPaper(farm, paper, { tagNumbers, ...extra });

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
      const her = await herRecord(
        context.db,
        context.farm.id,
        input.tagNumber,
        now
      );
      requireLookUp(context.scope, her);
      const document = animalPassportPaper({
        farm: context.farm,
        tagNumber: her.tagNumber,
        sex: her.sex === "female" ? "female" : "male",
        // A breed given no English is read in its Bangla (ADR 0021): nothing goes blank.
        breed: her.breed
          ? {
              bn: her.breed.nameBn,
              en: her.breed.nameEn?.trim() || her.breed.nameBn,
            }
          : null,
        // Her age as the farm can say it: from her birth date if it knows one, and otherwise from what the seller said
        // at Intake, which is a judgment and is labeled as one.
        born: her.birthDate ? farmDayOf(her.birthDate) : null,
        estimatedAgeMonths: her.intake?.estimatedAgeMonths ?? null,
        boughtFrom: boughtFromOf(her),
        // The day the Intake says she came, which is not the day she was written down: an animal bought last
        // week and entered today arrived last week. A calf born here has no arrival line.
        arrivedOn: her.intake ? farmDayOf(her.intake.arrivedAt) : null,
        // Her Pen Spells as her record works them out: the last one ends when she left, so the paper never says a
        // cow who has gone stands in a Pen still.
        pens: penSpellsOf(her.penSpells),
        doses: her.doses.map(doseOnPaper),
        withdrawal: herWithdrawalStanding(her.withdrawal),
        moreThanShown: her.moreThanShown,
        weighIns: her.weighIns.map((one) => ({
          kg: Number(one.weightKg),
          on: farmDayOf(one.weighedAt),
        })),
        // Where she went, not who took her: R7 names the destination, and one buyer's name is
        // not the next holder's business.
        leftFor: her.sale?.destination ?? null,
        left: leftOf(her.exit),
        producedAt: madeOn(now),
        producedBy: context.actor.name,
      });
      await audited(context).write(
        {
          entity: "animal",
          entityId: her.id,
          action: "export",
          after: aboutAnimals(context.farm, "passport", [her.tagNumber], {
            doses: her.doses.length,
          }),
        },
        () => Promise.resolve()
      );
      return { document, tagNumber: her.tagNumber };
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
      // And any older dose still holding her: the farm's products may hold her for up to a year, and a paper saying
      // "not clear" over an empty list explains nothing.
      const stillHolds = (dose: (typeof her.doses)[number]) =>
        [milkDaysOf(dose), meatDaysOf(dose)].some(
          (days) => days !== null && withdrawalEndsAt(dose.givenAt, days) > now
        );
      const lately = her.doses.filter(
        (dose) => dose.givenAt >= since || stillHolds(dose)
      );
      const held = herWithdrawalStanding(her.withdrawal);
      const doses = lately.map(doseOnPaper);
      const document = withdrawalSummaryPaper({
        farm: context.farm,
        tagNumber: her.tagNumber,
        asOf: farmDayOf(now),
        withdrawal: held,
        doses,
        lookBackDays: WITHDRAWAL_LOOK_BACK_DAYS,
        producedAt: madeOn(now),
        producedBy: context.actor.name,
      });
      await audited(context).write(
        {
          entity: "animal",
          entityId: her.id,
          action: "export",
          after: aboutAnimals(
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
      return { document, clear: held.clear, doses };
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
          animalId: true,
          priceMoney: true,
          receivableMoney: true,
          brokerMoney: true,
          promisedBy: true,
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
      // What each buyer still owes on her today, as his payments have left it.
      const owing = await owingNowOf(
        context.db,
        context.farm.id,
        rows.filter((one) => one.receivableMoney > 0).map((one) => one.id)
      );
      // What each lost between her last weighing on the farm and the sale's scale.
      const shrink = await shrinkOfSales(
        context.db,
        context.farm.id,
        rows.map((one) => ({
          animalId: one.animalId,
          weightKg: Number(one.weightKg),
          soldAt: one.soldAt,
        }))
      );
      return rows.map(({ animal: beast, buyer, animalId, ...row }) => ({
        ...row,
        shrink: shrink.get(animalId) ?? null,
        owingMoney: owing.get(row.id) ?? 0,
        priceMoney: row.priceMoney,
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
      const animals = rows.map((row) => ({
        tagNumber: row.animal.tagNumber,
        weightKg: Number(row.weightKg),
        priceMoney: row.priceMoney,
      }));
      const totalMoney = rows.reduce((sum, row) => sum + row.priceMoney, 0);
      const document = saleReceiptPaper({
        farm: context.farm,
        buyer: {
          name: first.buyer.name,
          address: first.buyer.address,
          phone: first.buyer.phone,
        },
        day: farmDayOf(day),
        animals,
        receivable: receivableOnTheReceipt(rows, totalMoney),
        producedAt: madeOn(now),
        producedBy: context.actor.name,
      });
      const tagNumbers = animals.map((one) => one.tagNumber);
      await audited(context).write(
        {
          entity: "sale",
          entityId: input.saleId,
          action: "export",
          after: aboutAnimals(context.farm, "receipt", tagNumbers, {
            totalMoney,
          }),
        },
        () => Promise.resolve()
      );
      return { document, animals: tagNumbers, totalMoney };
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
      const document = transportCardPaper({
        farm: context.farm,
        buyerName: first.buyer.name,
        destination: first.destination,
        vehicle: first.vehicle,
        driver: first.driver,
        at: day,
        tagNumbers,
        producedAt: madeOn(now),
        producedBy: context.actor.name,
      });
      await audited(context).write(
        {
          entity: "sale",
          entityId: input.saleId,
          action: "export",
          after: aboutAnimals(context.farm, "transport_card", tagNumbers, {
            destination: first.destination,
            vehicle: first.vehicle,
          }),
        },
        () => Promise.resolve()
      );
      return { document, animalCount: tagNumbers.length, tagNumbers };
    }),
};
