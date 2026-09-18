import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { internalSale } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import {
  agreementPaper,
  ventureBankCheck,
  investmentAgreement,
  venture,
  ventureMovement,
} from "@OpenFarm/db/schema/venture";
import {
  farmDayOf,
  monthOf,
  roundTaka,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { correct } from "../corrections/correction";
import {
  ventureMovementCorrection,
  ventureMovementCorrectionInput,
} from "../corrections/venture-movement";
import { consumedBy, farmCosts } from "../cost-store";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { theOwnersOf } from "../intake-store";
import {
  countedInvestors,
  readAgreement,
  theFarmsShare,
  unitsTaken,
} from "../investor-store";
import { monthInput } from "../money-inputs";
import { bookMoney, bookingOf } from "../money-store";
import { photoInput } from "../photo-input";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import {
  balanceAtMonthEnd,
  balanceOf,
  heldByEach,
  NEVER_CHECKED,
  bankStandingOf,
  readBankCheck,
  ownersOverTime,
  readInternalSale,
  whatSheLastWeighed,
  whatTheFloatBought,
  readMovement,
  readVenture,
  takenAgainst,
  signedForEach,
  ventureView,
  lockTheFarm,
} from "../venture-store";

/** Taka. A Venture is planned in lakhs; the column keeps poisha so the money can be added up. */
const money = z.number().min(0).max(1_000_000_000);

const openInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    targetCapitalBdt: money,
    /** The least capital this is worth starting on. The farm's own percentage unless the Owner says. */
    floorBdt: money.optional(),
    /** The day the Floor must be met by. */
    decideBy: farmDay,
    targetWindowStart: farmDay,
    targetWindowEnd: farmDay,
    unitPriceBdt: money,
    /** How many Units there are. As many as the unit price divides the capital into, unless the Owner
     *  says otherwise: a Venture may leave Units unsold and take less than it hoped. */
    units: z.number().int().min(1).max(10_000).optional(),
    /** The part of the capital meant for buying animals; the rest keeps them. The farm's own share
     *  unless the Owner says. */
    cattleBudgetBdt: money.optional(),
  })
  .refine((one) => one.targetWindowStart <= one.targetWindowEnd, {
    message: "A Target Window needs its days in order",
  });

/** The plan as it stands once the farm's own parameters have filled in what the Owner did not say. */
const planned = (
  input: z.infer<typeof openInput>,
  settings: { ventureFloorPercent: number; ventureRunningPercent: number }
) => ({
  floorBdt:
    input.floorBdt ??
    Math.round((input.targetCapitalBdt * settings.ventureFloorPercent) / 100),
  units:
    input.units ??
    Math.max(1, Math.round(input.targetCapitalBdt / input.unitPriceBdt)),
  cattleBudgetBdt:
    input.cattleBudgetBdt ??
    Math.round(
      (input.targetCapitalBdt * (100 - settings.ventureRunningPercent)) / 100
    ),
});

const signInput = z.object({
  ventureId: z.string(),
  investorId: z.string(),
  /** Whole Units, and no more than the Venture has left. */
  units: z.number().int().min(1).max(10_000),
  /** What the Investors take of the profit; the Farm takes the rest. */
  investorsPercent: z.number().int().min(0).max(100),
  arbitrator: z.string().trim().min(1).max(200),
  /** What the stamp cost. A stamped instrument with no stamp on it is not one. */
  stampValueBdt: money.refine((taka) => taka > 0, {
    message: "A stamped paper has a stamp value",
  }),
  stampedOn: farmDay,
  stampSerial: z.string().trim().min(1).max(60),
});

const capitalInput = z.object({
  agreementId: z.string(),
  amountBdt: money.refine((taka) => taka > 0, {
    message: "Capital in is money arriving",
  }),
  /** The day the bank moved it, on the farm's own clock. */
  movedOn: farmDay,
  /** The farm's own word for how money moved. The door takes all three so it can refuse two of them in
   *  the reader's own language: a schema that only knew "bank" would answer cash with a type error. */
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** The transfer, cheque or deposit slip, and what it is numbered. */
  reference: z.string().trim().min(1).max(120),
});

/** What a Venture may be moved to by hand, and from where. Everything else moves by what the farm does. */
const MOVES = {
  buying: "open",
  fattening: "buying",
} as const;

/** The context a gated handler has: the Role is settled and the Farm is certain. */
type Context = Parameters<typeof audited>[0] & { farm: { id: string } };

/** This Farm's Venture, or nothing the caller may act on. */
const ours = async (context: Context, id: string) => {
  const row = await context.db.query.venture.findFirst({
    where: { id, farmId: context.farm.id },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  return row;
};

/** This Farm's Investor, or nothing the caller may sign for. Without this, another Farm's Investor could
 *  be signed onto our Venture: they would count against our cap and never appear on our own list. */
const theirs = async (context: Context, id: string) => {
  const row = await context.db.query.investor.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  return row;
};

/**
 * Holds the Farm's row for the rest of this transaction, so counts made against a Venture's money are
 * still true when the write lands. Signings and Floats are rare and the lock is cheap; two phones
 * agreeing on a rule that may not be overridden is not.
 */
/**
 * That a Venture may still trade animals: it has started and has not finished. A Venture that is
 * selling is counting what it holds, and one settled or called off has nothing left to move.
 */
const assertVentureMayTrade = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  id: string | null,
  side: "buyer" | "seller"
) => {
  if (id === null) {
    return;
  }
  const row = await tx.query.venture.findFirst({
    where: { id, farmId },
    columns: { state: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  if (row.state !== "buying" && row.state !== "fattening") {
    // Which side is at fault, because "the Venture is not where it would have to be" is no help when
    // there are two of them.
    throw new ORPCError("BAD_REQUEST", {
      message: `The ${side}'s Venture is ${row.state}, and does not trade animals`,
      data: {
        refusal:
          side === "buyer" ? "buyer_cannot_trade" : "seller_cannot_trade",
      },
    });
  }
};

/** A line of a Reimbursement with the name of the thing it was, in both languages the farm keeps. */
const named = (
  lines: readonly { id: string; bdt: number }[],
  names: Map<string, { bn: string; en: string | null }>
) =>
  lines.map((line) => ({
    ...line,
    nameBn: names.get(line.id)?.bn ?? "",
    nameEn: names.get(line.id)?.en ?? null,
  }));

/**
 * What one Venture's Animals consumed of what the Farm bought, over one month.
 *
 * Charged by who owned her the day she ate it. An Animal sold between purses mid-month is repaid for by
 * each owner for the days that owner had her; one sold to a buyer and gone is still charged to the
 * Venture that owned her while she was here.
 */
const whatItsAnimalsConsumed = async (
  context: Context,
  ventureId: string,
  month: string
) => {
  const nowOwned = await context.db.query.animal.findMany({
    where: { farmId: context.farm.id },
    columns: { id: true, ownerVentureId: true },
  });
  const ownsNow = new Map(nowOwned.map((one) => [one.id, one.ownerVentureId]));
  const changed = await ownersOverTime(context.db, context.farm.id);
  const ownedThenBy = (animalId: string, at: Date): string | null => {
    const hers = changed.get(animalId);
    if (!hers) {
      return ownsNow.get(animalId) ?? null;
    }
    // The last change on or before that day is who owned her then.
    let owner = hers[0]?.ventureId ?? null;
    for (const span of hers) {
      if (span.from <= at) {
        owner = span.ventureId;
      }
    }
    return owner;
  };
  const { from, until } = monthOf(startOfFarmDay(`${month}-01`));
  const costs = await farmCosts(context.db, context.farm.id);
  const consumed = consumedBy(costs, ownedThenBy, ventureId, { from, until });
  // Named, not numbered: "which Feed Items, which doses, which Herd Costs" is a list the Owner reads
  // aloud, and an id is not something anybody can read aloud.
  const [items, drugs, categories] = await Promise.all([
    context.db.query.feedItem.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
    context.db.query.drugProduct.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
    context.db.query.moneyCategory.findMany({
      where: { farmId: context.farm.id },
      columns: { id: true, nameBn: true, nameEn: true },
    }),
  ]);
  return {
    ...consumed,
    madeOf: {
      feed: named(
        consumed.madeOf.feed,
        new Map(
          items.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      medicine: named(
        consumed.madeOf.medicine,
        new Map(
          drugs.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
      herd: named(
        consumed.madeOf.herd,
        new Map(
          categories.map((one) => [one.id, { bn: one.nameBn, en: one.nameEn }])
        )
      ),
    },
  };
};

/**
 * One bank check has one id, made of the Farm, the Venture and the month rather than the clock.
 *
 * A month is read once and put right afterwards, never recorded twice — and an id minted per call would
 * let two readings race into a row one of them then updates under the other's id, leaving the trail with
 * a create that points at nothing.
 */
const idOfTheMonth = (farmId: string, ventureId: string, month: string) =>
  `${farmId}:${ventureId}:${month}`;

/** This Farm's Investment Agreement, or nothing the caller may move money against. */
const theAgreement = async (context: Context, id: string) => {
  const row = await context.db.query.investmentAgreement.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true, ventureId: true, units: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
  }
  return row;
};

/** Moves a Venture on, from the one state it may be moved from, and says why not when it may not. */
const moveTo = async (
  context: Context,
  id: string,
  to: keyof typeof MOVES
): Promise<{ state: keyof typeof MOVES }> => {
  const row = await ours(context, id);
  if (row.state !== MOVES[to]) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A Venture goes to ${to} from ${MOVES[to]}, and this one is ${row.state}`,
      data: { refusal: "venture_wrong_state" },
    });
  }
  if (to === "buying") {
    const held = await heldByEach(context.db, context.farm.id, [row.id]);
    // What it holds, not what once arrived: money sent back is not money to start on.
    const standing = held.get(row.id);
    if ((standing ? balanceOf(standing) : 0) < Number(row.floorBdt)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "The Venture holds less than its Floor",
        data: { refusal: "venture_under_floor" },
      });
    }
  }
  await audited(context).write(
    {
      entity: "venture",
      entityId: row.id,
      action: "update",
      before: (tx) => readVenture(tx, context.farm.id, row.id),
      after: (tx) => readVenture(tx, context.farm.id, row.id),
    },
    (tx) => tx.update(venture).set({ state: to }).where(eq(venture.id, row.id))
  );
  return { state: to };
};

export const venturesRouter = {
  /**
   * The Ventures the farm has, newest first, each with what it holds against what it was looking for.
   *
   * The Owner's alone. A Venture is money between her and the people who trusted her with it; the Manager
   * runs the shed and sees which Venture owns an Animal, which arrives with the buying increment.
   */
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      const rows = await context.db.query.venture.findMany({
        where: { farmId: context.farm.id },
        orderBy: { createdAt: "desc", id: "desc" },
      });
      const ids = rows.map((one) => one.id);
      const held = await heldByEach(context.db, context.farm.id, ids);
      const signed = await signedForEach(context.db, context.farm.id, ids);
      const checked = await bankStandingOf(context.db, context.farm.id, ids);
      return rows.map((one) =>
        ventureView(
          one,
          held.get(one.id),
          signed.get(one.id),
          context.farm.runningBudgetWarnBdt,
          checked.get(one.id) ?? NEVER_CHECKED
        )
      );
    }),

  /**
   * One Venture written up before anybody pays into it: what it is looking for, the Floor below which
   * buying is not worth starting, the day to decide by, the window it sells in, its Units and how its
   * capital is planned between buying the animals and keeping them.
   */
  open: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(openInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const plan = planned(input, context.farm);
      if (plan.floorBdt > input.targetCapitalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Floor cannot be more than the capital the Venture is after",
          data: { refusal: "venture_floor_over_target" },
        });
      }
      if (plan.cattleBudgetBdt > input.targetCapitalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Cattle Budget cannot be more than the capital it comes from",
          data: { refusal: "venture_budget_over_capital" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture",
          entityId: id,
          action: "create",
          after: (tx) => readVenture(tx, context.farm.id, id),
        },
        (tx) =>
          tx.insert(venture).values({
            id,
            farmId: context.farm.id,
            name: input.name,
            targetCapitalBdt: input.targetCapitalBdt.toFixed(2),
            floorBdt: plan.floorBdt.toFixed(2),
            decideBy: input.decideBy,
            targetWindowStart: input.targetWindowStart,
            targetWindowEnd: input.targetWindowEnd,
            unitPriceBdt: input.unitPriceBdt.toFixed(2),
            units: plan.units,
            cattleBudgetBdt: plan.cattleBudgetBdt.toFixed(2),
            openedBy: context.actor.id,
            openedByRole: context.roleUsed,
            createdAt: now,
          })
      );
      return { id };
    }),

  /**
   * The Owner says the money is in and the buying may start. Refused while what the Venture holds is under
   * its Floor: buying a handful of bulls on half the capital is not the run anybody signed for.
   */
  startBuying: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) => moveTo(context, input.id, "buying")),

  /** All bought: the Venture is feeding them now. */
  startFattening: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) => moveTo(context, input.id, "fattening")),

  /**
   * Who has signed for this Venture, and for how much. The stamped paper itself is not sent back — only
   * whether the farm holds it, which is what may be acted on.
   */
  agreements: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.investmentAgreement.findMany({
        where: { farmId: context.farm.id, ventureId: input.ventureId },
        orderBy: { createdAt: "asc", id: "asc" },
      });
      if (rows.length === 0) {
        return [];
      }
      const papers = await context.db.query.agreementPaper.findMany({
        where: {
          farmId: context.farm.id,
          agreementId: { in: rows.map((one) => one.id) },
        },
        columns: { agreementId: true },
      });
      const kept = new Set(papers.map((one) => one.agreementId));
      return rows.map((one) => ({
        id: one.id,
        investorId: one.investorId,
        units: one.units,
        investorsPercent: one.investorsPercent,
        farmPercent: theFarmsShare(one.investorsPercent),
        targetWindow: {
          start: one.targetWindowStart,
          end: one.targetWindowEnd,
        },
        arbitrator: one.arbitrator,
        stamp: {
          valueBdt: Number(one.stampValueBdt),
          on: one.stampedOn,
          serial: one.stampSerial,
        },
        hasPaper: kept.has(one.id),
      }));
    }),

  /**
   * One Investor signs for one Venture: the Units they take, the split those Units earn, the Arbitrator
   * both sides name, and the stamped instrument's value, day and serial.
   *
   * Refused once the Venture has left Open, so every share is fixed for the run; refused for more Units
   * than are left; and refused when it would take the farm past the Investors it may have.
   */
  sign: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(signInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      await theirs(context, input.investorId);
      if (row.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes signatures only while it is open",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "investment_agreement",
          entityId: id,
          action: "create",
          after: (tx) => readAgreement(tx, context.farm.id, id),
        },
        async (tx) => {
          // Both counts are made inside the write's own transaction, behind a lock on the Farm row:
          // the Units left and the Investors standing are only true until the next signature commits,
          // and a rule that may not be overridden may not be lost to two phones at once either.
          await lockTheFarm(tx, context.farm.id);
          const taken = await unitsTaken(tx, context.farm.id, input.ventureId);
          if (taken + input.units > row.units) {
            throw new ORPCError("BAD_REQUEST", {
              message: `Only ${row.units - taken} Units of this Venture are left`,
              data: { refusal: "venture_units_gone" },
            });
          }
          const counted = await countedInvestors(tx, context.farm.id);
          const newcomer = !counted.unitsOf.has(input.investorId);
          if (newcomer && counted.standing >= context.farm.investorCap) {
            throw new ORPCError("BAD_REQUEST", {
              message: `The farm may have ${context.farm.investorCap} Investors at a time`,
              data: { refusal: "investor_cap_reached" },
            });
          }
          await tx.insert(investmentAgreement).values({
            id,
            farmId: context.farm.id,
            ventureId: input.ventureId,
            investorId: input.investorId,
            units: input.units,
            investorsPercent: input.investorsPercent,
            // The window the Venture means to sell in, as it stands today, written onto this paper.
            targetWindowStart: row.targetWindowStart,
            targetWindowEnd: row.targetWindowEnd,
            arbitrator: input.arbitrator,
            stampValueBdt: input.stampValueBdt.toFixed(2),
            stampedOn: input.stampedOn,
            stampSerial: input.stampSerial,
            signedBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /** The photo of the stamped paper, kept against its Agreement. Replacing it replaces the one photo. */
  keepAgreementPaper: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(photoInput.extend({ agreementId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await context.db.query.investmentAgreement.findFirst({
        where: { id: input.agreementId, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
      }
      await audited(context).write(
        {
          entity: "investment_agreement",
          entityId: row.id,
          action: "update",
          before: (tx) => readAgreement(tx, context.farm.id, row.id),
          after: (tx) => readAgreement(tx, context.farm.id, row.id),
        },
        (tx) =>
          tx
            .insert(agreementPaper)
            .values({
              agreementId: row.id,
              farmId: context.farm.id,
              contentType: input.contentType,
              data: input.data,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: agreementPaper.agreementId,
              set: {
                contentType: input.contentType,
                data: input.data,
                updatedAt: now,
              },
            })
      );
      return { keptAt: now };
    }),

  /**
   * The Ventures an Animal may be written against, by name and the state they are in: one still buying
   * takes an Intake, and one buying or fattening takes an Internal Sale.
   *
   * The Manager's as well as the Owner's, because the Manager records the Intake and the roles matrix
   * gives her the owner on it. What a Venture is planned by, what it holds and who is in it stay the
   * Owner's: this says only which names may be written against a beast today.
   */
  takingAnimals: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.venture.findMany({
        where: {
          farmId: context.farm.id,
          state: { in: ["buying", "fattening"] },
        },
        columns: { id: true, name: true, state: true },
        orderBy: { createdAt: "desc", id: "desc" },
      });
      return rows;
    }),

  /**
   * The Investors' capital as it lands: which paper it came against, how much, the day the bank moved
   * it and the reference on the instrument.
   *
   * Never a Money Event. This is the Venture's money passing through an account in the Owner's name,
   * and the Farm's books would be lying if they counted it as income.
   */
  takeCapital: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(capitalInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.paymentMethod !== "bank") {
        // A Venture Account takes bank transfers, cheques and deposit slips. Cash nobody can prove is
        // exactly what an Investor's family would ask about years later.
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes capital by bank only",
          data: { refusal: "capital_must_be_by_bank" },
        });
      }
      const agreement = await theAgreement(context, input.agreementId);
      const row = await ours(context, agreement.ventureId);
      if (row.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture takes capital only while it is open",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const owed = agreement.units * Number(row.unitPriceBdt);
      const paidAlready = await takenAgainst(
        context.db,
        context.farm.id,
        agreement.id
      );
      if (paidAlready + input.amountBdt > owed) {
        // Capital divides by Units, so a Unit paid for twice would take twice its share of the profit
        // while holding one share of the Venture.
        throw new ORPCError("BAD_REQUEST", {
          message: `This Agreement is for ${owed - paidAlready} more taka`,
          data: { refusal: "capital_over_units" },
        });
      }
      const paper = await context.db.query.agreementPaper.findFirst({
        where: { agreementId: agreement.id, farmId: context.farm.id },
        columns: { agreementId: true },
      });
      if (!paper) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The stamped Agreement is not on file yet",
          data: { refusal: "agreement_has_no_paper" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        (tx) =>
          tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: agreement.ventureId,
            kind: "capital_in",
            agreementId: agreement.id,
            amountBdt: input.amountBdt.toFixed(2),
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          })
      );
      return { id };
    }),

  /**
   * The Buying Float: money drawn from a Venture Account for one Buying Trip, so the Manager goes to the
   * haat with money that is accounted for. By bank, like every movement of a Venture's money.
   *
   * Refused unless the Venture is buying, refused for more than its Cattle Budget is holding — feed
   * money is not spent on one more bull — and refused for a trip that has been given money already,
   * because a trip funded twice is a trip nobody can reconcile.
   */
  drawFloat: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        buyingTripId: z.string(),
        amountBdt: money.refine((taka) => taka > 0, {
          message: "A Float is money going out",
        }),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.paymentMethod !== "bank") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture Account moves money by bank only",
          data: { refusal: "capital_must_be_by_bank" },
        });
      }
      const row = await ours(context, input.ventureId);
      if (row.state !== "buying") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture draws a Float only while it is buying",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const trip = await context.db.query.buyingTrip.findFirst({
        where: { id: input.buyingTripId, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!trip) {
        throw new ORPCError("NOT_FOUND", { message: "No such outing" });
      }
      // An outing already bringing another Venture's animals home cannot be funded by this one: the
      // reconciliation counts the Animals bought on the trip for the Venture that paid, and money and
      // animals pointing at different Ventures is a sum nobody could ever make balance.
      const brought = await context.db.query.intake.findMany({
        where: { farmId: context.farm.id, buyingTripId: input.buyingTripId },
        columns: { animalId: true },
      });
      const owners = await theOwnersOf(
        context.db,
        brought.map((one) => one.animalId)
      );
      if (owners.some((owner) => owner !== null && owner !== row.id)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That outing is bringing another Venture's animals home",
          data: { refusal: "trip_is_another_ventures" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        async (tx) => {
          // Counted inside the write, behind the same lock every other Venture count takes: what the
          // Cattle Budget holds is only true until the next Float commits.
          await lockTheFarm(tx, context.farm.id);
          const standing = await tx.query.venture.findFirst({
            where: { id: row.id, farmId: context.farm.id },
          });
          if (!standing || standing.state !== "buying") {
            // Read again inside the lock: a Venture moved on or called off while this was being filled
            // in would otherwise still hand out money.
            throw new ORPCError("BAD_REQUEST", {
              message: "A Venture draws a Float only while it is buying",
              data: { refusal: "venture_wrong_state" },
            });
          }
          const held = await heldByEach(tx, context.farm.id, [row.id]);
          const view = ventureView(
            standing,
            held.get(row.id),
            undefined,
            context.farm.runningBudgetWarnBdt,
            NEVER_CHECKED
          );
          if (input.amountBdt > view.cattleBudgetHeldBdt) {
            throw new ORPCError("BAD_REQUEST", {
              message: `The Cattle Budget is holding ${view.cattleBudgetHeldBdt}`,
              data: { refusal: "cattle_budget_short" },
            });
          }
          const already = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              buyingTripId: input.buyingTripId,
              kind: "float_out",
            },
            columns: { id: true },
          });
          if (already) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That outing has been given a Float already",
              data: { refusal: "float_already_drawn" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "float_out",
            buyingTripId: input.buyingTripId,
            amountBdt: input.amountBdt.toFixed(2),
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /**
   * The Float counted when the trip comes home: what went out equals the Animals it bought for this
   * Venture, plus the outing's own costs, plus the cash brought back and deposited.
   *
   * A reconciliation that does not add up is refused, and says by how much and which way — a Float that
   * nearly balances is a Float nobody has actually counted. Once it is counted the outing is closed: no
   * animal and no cost may be added to it afterwards, because the sum it was counted against would stop
   * being true.
   */
  reconcileFloat: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        buyingTripId: z.string(),
        /** What came back and went into the bank. Nothing, when the whole Float was spent. */
        cashBackBdt: money,
        /** The day it was deposited, and the slip's number. Left out when nothing came back. */
        movedOn: farmDay.optional(),
        reference: z.string().trim().max(120).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.cashBackBdt > 0 && !(input.movedOn && input.reference)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Cash coming back needs the day and the deposit slip",
          data: { refusal: "cash_back_needs_a_slip" },
        });
      }
      const id = uuidv7(now);
      let counted = { animalsBdt: 0, tripBdt: 0, animals: 0 };
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          // What the Float was counted against, kept with the act rather than only returned to the
          // screen: an auditor years later asks what the Owner signed, not what she was shown.
          after: async (tx) => ({
            ...(await readMovement(tx, context.farm.id, id)),
            countedAgainst: counted,
          }),
        },
        async (tx) => {
          // Everything inside the write, behind the lock every count of a Venture's money takes: the
          // sum is only true until the next animal or the next cost lands on the outing.
          await lockTheFarm(tx, context.farm.id);
          const float = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              buyingTripId: input.buyingTripId,
              kind: "float_out",
            },
          });
          if (!float) {
            throw new ORPCError("NOT_FOUND", {
              message: "That outing was never given a Float",
            });
          }
          if (float.reconciledAt) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That Float has been reconciled already",
              data: { refusal: "float_already_reconciled" },
            });
          }
          const bought = await whatTheFloatBought(tx, context.farm.id, {
            buyingTripId: input.buyingTripId,
            ventureId: float.ventureId,
          });
          counted = bought;
          const accountedFor = roundTaka(
            bought.animalsBdt + bought.tripBdt + input.cashBackBdt
          );
          const outBdt = roundTaka(Number(float.amountBdt));
          if (accountedFor !== outBdt) {
            const gapBdt = roundTaka(Math.abs(accountedFor - outBdt));
            throw new ORPCError("BAD_REQUEST", {
              message: `That is ${gapBdt} ${
                accountedFor > outBdt ? "more than" : "short of"
              } the Float`,
              data: {
                refusal: accountedFor > outBdt ? "float_over" : "float_short",
                gapBdt,
              },
            });
          }
          // The homecoming is its own movement even when nothing came back, because the record that the
          // Float was counted, and against what, is the point of counting it.
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: float.ventureId,
            kind: "float_back",
            buyingTripId: input.buyingTripId,
            amountBdt: input.cashBackBdt.toFixed(2),
            movedOn: input.movedOn ?? float.movedOn,
            reference: input.reference ?? "",
            refundsId: float.id,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          await tx
            .update(ventureMovement)
            .set({ reconciledAt: now, reconciledBy: context.actor.id })
            .where(eq(ventureMovement.id, float.id));
        }
      );
      return { ...counted, cashBackBdt: input.cashBackBdt };
    }),

  /**
   * What a Buying Trip was given, and from which Venture. The Manager's as well as the Owner's: she is
   * the one taking it to the haat, and she may see what is in her hand without being able to draw it.
   */
  floatOf: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ buyingTripId: z.string() }))
    .handler(async ({ context, input }) => {
      const row = await context.db.query.ventureMovement.findFirst({
        where: {
          farmId: context.farm.id,
          buyingTripId: input.buyingTripId,
          kind: "float_out",
        },
        with: { venture: { columns: { name: true } } },
      });
      return row
        ? {
            id: row.id,
            ventureId: row.ventureId,
            ventureName: row.venture?.name ?? "",
            amountBdt: Number(row.amountBdt),
            movedOn: row.movedOn,
            reference: row.reference,
          }
        : null;
    }),

  /**
   * An Animal sold between the Farm's herd and a Venture, or between two Ventures.
   *
   * Priced at her latest Weigh-in times a live-weight rate the Owner enters that day, with a note of
   * where the rate came from — an Investor asking years later why his bull was worth that is owed a
   * figure and a reason. The money moves through the Venture Account, because it is a sale and not a
   * book entry, and her owner changes with it.
   *
   * Refused once the Venture is selling and refused for an Animal who is Ready for Sale: a finished
   * bull may not be lifted out of the pool at the moment she becomes worth having.
   */
  sellInternally: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(20),
        /** Who takes her on: a Venture, or left out for the Farm's own herd. */
        toVentureId: z.string().optional(),
        /** Taka per kilogramme of live weight, as the day's market gives it. */
        rateBdtPerKg: z.number().positive().max(100_000),
        /** Where the rate came from. Asked for, not optional. */
        note: z.string().trim().min(1).max(300),
        soldOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        /** The transfer, cheque or deposit slip the money moved on. */
        reference: z.string().trim().min(1).max(120),
        /** The price the Owner read before she committed. Refused when it is not the price the farm
         *  works out, because she may be looking at a weight taken before this morning's round. */
        priceBdt: z.number().positive().max(100_000_000),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.paymentMethod !== "bank") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture Account moves money by bank only",
          data: { refusal: "capital_must_be_by_bank" },
        });
      }
      const id = uuidv7(now);
      let struck = { weightKg: 0, priceBdt: 0 };
      await audited(context).write(
        {
          entity: "internal_sale",
          entityId: id,
          action: "create",
          reason: input.note,
          after: (tx) => readInternalSale(tx, context.farm.id, id),
        },
        async (tx) => {
          // Everything inside the write, behind the lock every count of a Venture's money takes: she
          // may be marked Ready for Sale, or a Venture moved on, between reading and writing.
          await lockTheFarm(tx, context.farm.id);
          const her = await tx.query.animal.findFirst({
            where: {
              farmId: context.farm.id,
              tagNumber: input.tagNumber.toUpperCase(),
            },
            columns: {
              id: true,
              side: true,
              state: true,
              source: true,
              ownerVentureId: true,
            },
          });
          if (!her) {
            throw new ORPCError("NOT_FOUND", { message: "No such animal" });
          }
          if (her.side !== "fattening") {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Investor money funds Fattening, and a Dairy cow is the Farm's",
              data: { refusal: "not_a_fattening_animal" },
            });
          }
          if (her.source !== "bought") {
            throw new ORPCError("BAD_REQUEST", {
              message: "A Venture owns bought-in animals and no others",
              data: { refusal: "not_a_ventures_animal" },
            });
          }
          if (her.state === "ready_for_sale") {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "She is ready for sale, and a finished bull is not moved between purses",
              data: { refusal: "she_is_ready_for_sale" },
            });
          }
          const from = her.ownerVentureId;
          const to = input.toVentureId ?? null;
          if (from === to) {
            throw new ORPCError("BAD_REQUEST", {
              message: "She is already theirs",
              data: { refusal: "already_that_purse" },
            });
          }
          await assertVentureMayTrade(tx, context.farm.id, from, "seller");
          await assertVentureMayTrade(tx, context.farm.id, to, "buyer");
          const weighed = await whatSheLastWeighed(tx, context.farm.id, her.id);
          if (!weighed) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "She has never been weighed, so there is no price to strike",
              data: { refusal: "never_weighed" },
            });
          }
          const priceBdt = roundTaka(weighed.weightKg * input.rateBdtPerKg);
          if (roundTaka(input.priceBdt) !== priceBdt) {
            // She was weighed again since the Owner read the figure: the price she is committing to is
            // not the price the farm would strike, and a sale is not something to guess at.
            throw new ORPCError("BAD_REQUEST", {
              message: `She last weighed ${weighed.weightKg} kg, so the price is ${priceBdt}`,
              data: { refusal: "weighed_again_since", priceBdt },
            });
          }
          struck = { weightKg: weighed.weightKg, priceBdt };
          if (to !== null) {
            // The buyer pays out of what it holds for cattle, exactly as it would at the haat.
            const held = await heldByEach(tx, context.farm.id, [to]);
            const buyer = await ours(context, to);
            const view = ventureView(
              buyer,
              held.get(to),
              undefined,
              context.farm.runningBudgetWarnBdt,
              NEVER_CHECKED
            );
            if (priceBdt > view.cattleBudgetHeldBdt) {
              throw new ORPCError("BAD_REQUEST", {
                message: `The Cattle Budget is holding ${view.cattleBudgetHeldBdt}`,
                data: { refusal: "cattle_budget_short" },
              });
            }
          }
          await tx.insert(internalSale).values({
            id,
            farmId: context.farm.id,
            animalId: her.id,
            fromVentureId: from,
            toVentureId: to,
            weightKg: weighed.weightKg.toFixed(2),
            weighInId: weighed.id,
            rateBdtPerKg: input.rateBdtPerKg.toFixed(2),
            priceBdt: priceBdt.toFixed(2),
            note: input.note,
            soldOn: input.soldOn,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          // One movement per Venture side. Where the Farm is one of the sides it has none: a Venture
          // Account is the only account here, and the Farm's own books are answered separately.
          const sides = [
            to === null
              ? null
              : { ventureId: to, kind: "internal_buy" as const },
            from === null
              ? null
              : { ventureId: from, kind: "internal_sell" as const },
          ].filter((side) => side !== null);
          for (const side of sides) {
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one statement at a time
            await tx.insert(ventureMovement).values({
              id: uuidv7(now),
              farmId: context.farm.id,
              ventureId: side.ventureId,
              kind: side.kind,
              internalSaleId: id,
              amountBdt: priceBdt.toFixed(2),
              movedOn: input.soldOn,
              reference: input.reference,
              recordedBy: context.actor.id,
              createdAt: now,
            });
          }
          // The Farm's own side is a Money Event, because taka really enters or leaves the Farm: it
          // sold a bull, or it bought one. Only where the Farm is a side — between two Ventures no
          // money of the Farm's has moved, and its books say nothing.
          if (from === null || to === null) {
            await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
              // The Farm letting her go is money in; the Farm taking her on is money out.
              source: from === null ? "internal_sale_in" : "internal_sale_out",
              sourceId: id,
              amountBdt: priceBdt,
              occurredAt: startOfFarmDay(input.soldOn),
              counterpartyId: null,
              paymentMethod: input.paymentMethod,
            });
          }
          await tx
            .update(animal)
            .set({ ownerVentureId: to, updatedAt: now })
            .where(eq(animal.id, her.id));
        }
      );
      return { id, ...struck, rateBdtPerKg: input.rateBdtPerKg };
    }),

  /**
   * What the farm thinks a Venture Account held at a month's end, so the Owner has something to hold the
   * bank's statement against before she writes anything down.
   */
  expectedAtMonthEnd: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string(), month: monthInput }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      const expectedBdt = await balanceAtMonthEnd(
        context.db,
        context.farm.id,
        row.id,
        input.month
      );
      const already = await context.db.query.ventureBankCheck.findFirst({
        where: {
          farmId: context.farm.id,
          ventureId: row.id,
          forMonth: input.month,
        },
      });
      return {
        expectedBdt,
        checked: already
          ? {
              readBdt: Number(already.readBdt),
              /** What the farm believed when she read the statement, which is not `expectedBdt` once
               *  something has moved in that month since. */
              expectedBdt: Number(already.expectedBdt),
              note: already.note,
              stale: roundTaka(expectedBdt - Number(already.expectedBdt)) !== 0,
            }
          : null,
      };
    }),

  /**
   * The month's bank check: what the Venture Account really held, off the bank's own statement, against
   * what the farm thinks it should have held.
   *
   * A month that disagrees is kept as disagreeing. The Owner writes down what she found out about it
   * rather than making it agree, and a Settlement will not close over one — a mistake caught in weeks is
   * one somebody can still remember, and the same mistake at settlement is a figure nobody can unpick.
   */
  checkTheBank: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        month: monthInput,
        /** What the statement said. Signed, because a statement can read below nothing and the farm
         *  would rather be told than have the figure refused. */
        readBdt: z.number().min(-1_000_000_000).max(1_000_000_000),
        /** What she has found out about a difference, where she has found out anything. */
        note: z.string().trim().max(400).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.ventureId);
      const { until } = monthOf(startOfFarmDay(`${input.month}-01`));
      if (until > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is not over yet",
          data: { refusal: "month_not_over" },
        });
      }
      if (input.month < farmDayOf(row.createdAt).slice(0, 7)) {
        // A month the Venture did not exist in would read straight against nothing, and a Venture
        // nobody has really checked would look as though somebody had.
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is before this Venture opened",
          data: { refusal: "month_before_the_venture" },
        });
      }
      let expectedBdt = 0;
      // Read for the label alone: whether the trail calls this a first reading or a month put right.
      // What is written is decided inside the lock, so a race can mislabel the act but never the row.
      const readBefore = await context.db.query.ventureBankCheck.findFirst({
        where: { id: idOfTheMonth(context.farm.id, row.id, input.month) },
        columns: { id: true },
      });
      await audited(context).write(
        {
          entity: "venture_bank_check",
          entityId: idOfTheMonth(context.farm.id, row.id, input.month),
          action: readBefore ? "update" : "create",
          reason: input.note,
          before: (tx) =>
            readBankCheck(
              tx,
              context.farm.id,
              idOfTheMonth(context.farm.id, row.id, input.month)
            ),
          after: (tx) =>
            readBankCheck(
              tx,
              context.farm.id,
              idOfTheMonth(context.farm.id, row.id, input.month)
            ),
        },
        async (tx) => {
          // Inside the write, behind the lock its neighbours take: the figure the farm believes is only
          // true until the next movement commits, and two readings of one month must not race into two
          // rows.
          await lockTheFarm(tx, context.farm.id);
          expectedBdt = await balanceAtMonthEnd(
            tx,
            context.farm.id,
            row.id,
            input.month
          );
          const already = await tx.query.ventureBankCheck.findFirst({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
            },
          });
          // A month found to disagree does not come right by being typed again. She may put a misread
          // figure right, but she says what she found out when she does — that is the difference
          // between correcting a reading and quietly making a problem go away.
          const disagreed =
            already !== undefined &&
            roundTaka(Number(already.readBdt) - Number(already.expectedBdt)) !==
              0;
          const agreesNow = roundTaka(input.readBdt - expectedBdt) === 0;
          // Said now, not once before: the note she wrote when it disagreed explains the disagreement,
          // and putting the month right is a different thing to explain.
          if (disagreed && !input.note) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Say what you found out about the month that did not agree",
              data: { refusal: "say_what_you_found_out" },
            });
          }
          await tx
            .insert(ventureBankCheck)
            .values({
              id: idOfTheMonth(context.farm.id, row.id, input.month),
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
              readBdt: input.readBdt.toFixed(2),
              expectedBdt: expectedBdt.toFixed(2),
              note: input.note ?? null,
              checkedBy: context.actor.id,
              checkedAt: now,
            })
            .onConflictDoUpdate({
              target: ventureBankCheck.id,
              set: {
                readBdt: input.readBdt.toFixed(2),
                expectedBdt: expectedBdt.toFixed(2),
                // Kept unless she says something new: re-reading a month must not erase what she
                // found out about it last time. Dropped once the month agrees, because what she found
                // out was about a difference that is no longer there.
                note:
                  input.note ?? (agreesNow ? null : (already?.note ?? null)),
                checkedBy: context.actor.id,
                checkedAt: now,
              },
            });
        }
      );
      return {
        expectedBdt,
        readBdt: input.readBdt,
        differenceBdt: roundTaka(input.readBdt - expectedBdt),
      };
    }),

  /**
   * The Owner's Advance: her own money into a Venture whose Running Budget has run out, so the animals
   * keep eating. Interest-free, never a charge against the Venture, and repaid at cost before any
   * capital returns — which the Settlement will do.
   *
   * It is a movement of the Venture's account and never a Money Event: the Farm has not spent anything
   * and has not earned anything, the Owner has lent her own money to a run she is looking after.
   */
  advance: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        amountBdt: money.refine((taka) => taka > 0, {
          message: "An Advance is money going in",
        }),
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.paymentMethod !== "bank") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture Account moves money by bank only",
          data: { refusal: "capital_must_be_by_bank" },
        });
      }
      const row = await ours(context, input.ventureId);
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          after: (tx) => readMovement(tx, context.farm.id, id),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          const standing = await tx.query.venture.findFirst({
            where: { id: row.id, farmId: context.farm.id },
            columns: { state: true },
          });
          // A Venture that has not started buying has eaten nothing, and one whose run is over has
          // nothing left to feed. An Advance into either would be the Owner's money with no way home:
          // calling a Venture off returns capital, and only capital.
          if (
            standing?.state !== "buying" &&
            standing?.state !== "fattening" &&
            standing?.state !== "selling"
          ) {
            throw new ORPCError("BAD_REQUEST", {
              message: "A Venture takes an Advance only while it is running",
              data: { refusal: "venture_wrong_state" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "advance",
            amountBdt: input.amountBdt.toFixed(2),
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /**
   * What a Venture's Animals consumed in a month, and what it is made of — before anything is moved, so
   * the Owner sees the figure and its parts and can read them to an Investor.
   */
  consumption: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string(), month: monthInput }))
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.ventureId);
      return await whatItsAnimalsConsumed(context, row.id, input.month);
    }),

  /**
   * The month's Reimbursement: what this Venture's Animals ate of the Farm's feed, were dosed with of
   * the Farm's medicine, cost in vet visits, and their share of the month's Herd Costs — moved from the
   * Venture Account to the Farm's.
   *
   * One act, both sides. A movement out of the Venture, and a Money Event **in** on the Farm's purse
   * under its own Category — gross, not netted: the Farm's expense when it bought the feed stands, and
   * the Venture's repayment stands beside it. This is also how home-grown fodder settles, which the Farm
   * never paid cash for and is genuinely selling.
   */
  reimburse: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        ventureId: z.string(),
        month: monthInput,
        movedOn: farmDay,
        paymentMethod: z.enum(PAYMENT_METHODS),
        reference: z.string().trim().min(1).max(120),
        /** The figure the Owner read before she committed. Refused when it is not what the farm works
         *  out now — a Feeding entered late, or a Category re-marked, moves the sum she was shown. */
        amountBdt: money,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      if (input.paymentMethod !== "bank") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture Account moves money by bank only",
          data: { refusal: "capital_must_be_by_bank" },
        });
      }
      const row = await ours(context, input.ventureId);
      if (row.state === "settled" || row.state === "cancelled") {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Venture whose run is over pays for nothing more",
          data: { refusal: "venture_wrong_state" },
        });
      }
      // The month has to be over. Reimbursing a month still running would take a part-month figure and
      // then lock the rest of it out for good, because a Venture is reimbursed once a month.
      const { until } = monthOf(startOfFarmDay(`${input.month}-01`));
      if (until > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is not over yet",
          data: { refusal: "month_not_over" },
        });
      }
      const consumed = await whatItsAnimalsConsumed(
        context,
        row.id,
        input.month
      );
      if (roundTaka(input.amountBdt) !== consumed.totalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message: `That month now comes to ${consumed.totalBdt}`,
          data: { refusal: "amount_changed", totalBdt: consumed.totalBdt },
        });
      }
      if (consumed.totalBdt <= 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Its animals consumed nothing that month",
          data: { refusal: "nothing_to_reimburse" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture_movement",
          entityId: id,
          action: "create",
          reason: input.month,
          after: async (tx) => ({
            ...(await readMovement(tx, context.farm.id, id)),
            madeOf: consumed.madeOf,
          }),
        },
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          const already = await tx.query.ventureMovement.findFirst({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              forMonth: input.month,
            },
            columns: { id: true },
          });
          if (already) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That month has been reimbursed already",
              data: { refusal: "month_already_reimbursed" },
            });
          }
          await tx.insert(ventureMovement).values({
            id,
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "reimbursement",
            forMonth: input.month,
            amountBdt: consumed.totalBdt.toFixed(2),
            movedOn: input.movedOn,
            reference: input.reference,
            recordedBy: context.actor.id,
            createdAt: now,
          });
          // The Farm's side, on the Farm's purse: it bought the feed and is being paid for it.
          await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
            source: "reimbursement",
            sourceId: id,
            amountBdt: consumed.totalBdt,
            occurredAt: startOfFarmDay(input.movedOn),
            counterpartyId: null,
            paymentMethod: input.paymentMethod,
          });
        }
      );
      return { id, ...consumed };
    }),

  /**
   * A movement of a Venture's money put right: how much moved, the day the bank moved it, or the
   * reference on the instrument. A Correction like any other — a reason, and the trail holding what it
   * said before.
   *
   * Refused where the farm has already built something on it: a Float counted home, a month reimbursed,
   * a Venture settled. Changing a figure underneath a decision somebody has already made is not putting
   * anything right.
   */
  correctMovement: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(ventureMovementCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, ventureMovementCorrection, input)
    ),

  /** Every movement of one Venture's money, oldest first: what came in, and what went back. */
  movements: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(async ({ context, input }) => {
      const rows = await context.db.query.ventureMovement.findMany({
        where: { farmId: context.farm.id, ventureId: input.ventureId },
        orderBy: { movedOn: "asc", id: "asc" },
      });
      if (rows.length === 0) {
        return [];
      }
      // Only the movements that belong to one Investor's paper have one; a Float belongs to none.
      const papers = rows.flatMap((one) =>
        one.agreementId ? [one.agreementId] : []
      );
      const agreements =
        papers.length === 0
          ? []
          : await context.db.query.investmentAgreement.findMany({
              where: { farmId: context.farm.id, id: { in: papers } },
              columns: { id: true, investorId: true },
            });
      const whose = new Map(
        agreements.map((one) => [one.id, one.investorId] as const)
      );
      return rows.map((one) => ({
        id: one.id,
        kind: one.kind,
        agreementId: one.agreementId,
        investorId: one.agreementId
          ? (whose.get(one.agreementId) ?? null)
          : null,
        buyingTripId: one.buyingTripId,
        amountBdt: Number(one.amountBdt),
        movedOn: one.movedOn,
        reference: one.reference,
        refundsId: one.refundsId,
      }));
    }),

  /**
   * A Venture called off: the Floor was not met by the day it had to be, so nothing is bought and every
   * taka goes back. Only from Open — once an animal has been bought with the money, it is not a plan any
   * more.
   *
   * Every capital movement it took needs its own refund, with the day and the reference of the transfer
   * that sent it: the Venture ends when the money is on its way back, not before.
   */
  cancel: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        id: z.string(),
        reason: z.string().trim().min(1).max(400),
        refunds: z
          .array(
            z.object({
              movementId: z.string(),
              movedOn: farmDay,
              reference: z.string().trim().min(1).max(120),
            })
          )
          .max(200)
          .default([]),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context, input.id);
      if (row.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only a Venture still open may be called off",
          data: { refusal: "venture_wrong_state" },
        });
      }
      const sendingBack = new Map(
        input.refunds.map((one) => [one.movementId, one] as const)
      );
      const auditing = audited(context);
      let sentBack = 0;
      await auditing.write(
        {
          entity: "venture",
          entityId: row.id,
          action: "update",
          reason: input.reason,
          before: (tx) => readVenture(tx, context.farm.id, row.id),
          after: (tx) => readVenture(tx, context.farm.id, row.id),
        },
        async (tx) => {
          // Read inside the transaction: capital committing while the Owner filled the refunds in would
          // otherwise be left behind in a Venture that is already called off.
          const taken = await tx.query.ventureMovement.findMany({
            where: {
              farmId: context.farm.id,
              ventureId: row.id,
              kind: "capital_in",
            },
          });
          const unaccounted = taken.filter((one) => !sendingBack.has(one.id));
          if (unaccounted.length > 0) {
            throw new ORPCError("BAD_REQUEST", {
              message: `${unaccounted.length} capital movements have no refund`,
              data: { refusal: "capital_not_sent_back" },
            });
          }
          const itsOwn = new Set(taken.map((one) => one.id));
          if (input.refunds.some((one) => !itsOwn.has(one.movementId))) {
            throw new ORPCError("BAD_REQUEST", {
              message: "A refund names money this Venture never took",
              data: { refusal: "refund_not_its_money" },
            });
          }
          const refunds = taken.map((one) => ({
            id: uuidv7(now),
            farmId: context.farm.id,
            ventureId: row.id,
            kind: "refund" as const,
            agreementId: one.agreementId,
            amountBdt: one.amountBdt,
            movedOn: sendingBack.get(one.id)?.movedOn ?? "",
            reference: sendingBack.get(one.id)?.reference ?? "",
            refundsId: one.id,
            recordedBy: context.actor.id,
            createdAt: now,
          }));
          if (refunds.length > 0) {
            await tx.insert(ventureMovement).values(refunds);
          }
          // One Audit Event per refund: "where is my money" is answered by the trail, a line per
          // transfer. They go one at a time because they share the transaction the cancel holds.
          for (const one of refunds) {
            // oxlint-disable-next-line no-await-in-loop -- one transaction, one statement at a time
            const after = await readMovement(tx, context.farm.id, one.id);
            // oxlint-disable-next-line no-await-in-loop -- as above
            await auditing.recordEvent(
              tx,
              {
                entity: "venture_movement",
                entityId: one.id,
                action: "create",
                reason: input.reason,
              },
              { after }
            );
          }
          sentBack = refunds.length;
          await tx
            .update(venture)
            .set({ state: "cancelled", cancelledReason: input.reason })
            .where(eq(venture.id, row.id));
        }
      );
      return { state: "cancelled" as const, refunded: sentBack };
    }),
};
