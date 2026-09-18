import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { farm } from "@OpenFarm/db/schema/farm";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import {
  agreementPaper,
  investmentAgreement,
  venture,
  ventureMovement,
} from "@OpenFarm/db/schema/venture";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  countedInvestors,
  readAgreement,
  theFarmsShare,
  unitsTaken,
} from "../investor-store";
import { photoInput } from "../photo-input";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import {
  balanceOf,
  heldByEach,
  readMovement,
  readVenture,
  takenAgainst,
  signedForEach,
  ventureView,
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
      return rows.map((one) =>
        ventureView(one, held.get(one.id), signed.get(one.id))
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
          await tx
            .select({ id: farm.id })
            .from(farm)
            .where(eq(farm.id, context.farm.id))
            .for("update");
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
      const agreements = await context.db.query.investmentAgreement.findMany({
        where: {
          farmId: context.farm.id,
          id: { in: rows.map((one) => one.agreementId) },
        },
        columns: { id: true, investorId: true },
      });
      const whose = new Map(
        agreements.map((one) => [one.id, one.investorId] as const)
      );
      return rows.map((one) => ({
        id: one.id,
        kind: one.kind,
        agreementId: one.agreementId,
        investorId: whose.get(one.agreementId) ?? null,
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
