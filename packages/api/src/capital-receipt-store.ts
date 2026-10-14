// Capital as it lands in a Venture Account: one receipt from the capital sheet, or a month's from the grid, each the
// same receipt behind the same lock.

import { uuidv7 } from "@OpenFarm/db/ids";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import {
  capitalItMayHold,
  farmDayOf,
  monthlyPaymentAllocationOf,
  roundMoney,
  startOfFarmDay,
  takesCapital,
} from "@OpenFarm/domain";
import { currencyWords } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { isTheFarmsOwn } from "./farm-capital-store";
import { lockTheFarm } from "./farm-lock";
import { asOneReference, assertEachReferenceOnce, onRow } from "./grid-row";
import { paperOnFile } from "./investor-store";
import { accountSaid, bookMoney, bookingOf } from "./money-store";
import { closePayInNotes, receiveTheNote } from "./pay-in-notes";
import { paidForBy, readMovement, takenAgainst } from "./venture-store";
import { seenWhenDone } from "./writes-seen";

type Acting = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/** One receipt of capital: which paper, how much, the day the bank moved it and the reference it moved under. */
export interface CapitalReceipt {
  agreementId: string;
  amountMoney: number;
  /** The day the bank moved it, on the farm's own clock. */
  movedOn: string;
  /** The transfer, check or deposit slip, and what it is numbered. */
  reference: string;
  /** The Investor's Pay-in Note this is the money of, when the Owner records it from one (ADR 0018). */
  payInNoteId?: string;
  /** For the Farm's own Units: the Farm Account its capital left. */
  farmAccountId?: string;
}

/** What a receipt did to the paper's place against its Monthly Sums, for a Venture paid by the month. */
export interface Allocated {
  before: ReturnType<typeof monthlyPaymentAllocationOf>;
  after: ReturnType<typeof monthlyPaymentAllocationOf>;
}

/** Open, any Venture; paid by the month, its Monthly Sums too while it buys and fattens. Once it sells, a sum not yet
 *  paid is not paid, and the man shares by what he did pay (the advisers' answers, 2026-10-02). */
export const assertTakesCapital = (
  row: Parameters<typeof takesCapital>[0] & { capitalPaid: string }
) => {
  if (!takesCapital(row)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        row.capitalPaid === "by_the_month"
          ? "A Venture paid by the month takes its Monthly Sums only until it starts selling"
          : "A Venture takes capital only while it is open",
      data: { refusal: "venture_wrong_state" },
    });
  }
};

/** This Farm's Investment Agreement, or nothing the caller may move money against. */
export const theAgreement = async (
  context: { db: Pick<Tx, "query">; farm: { id: string } },
  id: string
) => {
  const row = await context.db.query.investmentAgreement.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true, ventureId: true, units: true, stampKind: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
  }
  return row;
};

/** Refuses capital under a reference this Venture's capital already holds: the same transfer written up twice. */
const assertReferenceNotTaken = async (
  tx: Tx,
  {
    farmId,
    ventureId,
    reference,
  }: { farmId: string; ventureId: string; reference: string }
) => {
  const taken = await tx.query.ventureMovement.findMany({
    where: { farmId, ventureId, kind: "capital_in" },
    columns: { reference: true },
  });
  const said = asOneReference(reference);
  if (taken.some((one) => asOneReference(one.reference) === said)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Venture has already taken capital under that reference",
      data: { refusal: "capital_reference_taken" },
    });
  }
};

/**
 * One receipt of capital, on a transaction already holding the Farm's lock: counted against what the paper may still
 * take, its Monthly Sums allocated, refused under a reference this Venture took before, and the Farm's own Units' money
 * booked off the Farm's own books as it lands. The capital sheet's and the month's grid's alike.
 *
 * Counted behind the lock, as signing counts its Units: what an Agreement has taken is only true until the next
 * payment commits, and two arriving together each read a figure that still leaves room for the other. Capital divides
 * by Units, so a Unit paid for twice would take twice its share of the profit while holding one share of the Venture.
 */
export const receiveCapital = async (
  context: Acting,
  tx: Tx,
  receipt: CapitalReceipt,
  { id, now }: { id: string; now: Date }
): Promise<{ id: string; allocation: Allocated | null }> => {
  const agreement = await theAgreement(
    { ...context, db: tx },
    receipt.agreementId
  );
  // Asked behind the lock: a Venture canceled or moved on at the same moment takes nothing.
  const standing = await tx.query.venture.findFirst({
    where: { id: agreement.ventureId, farmId: context.farm.id },
  });
  if (!standing) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  assertTakesCapital(standing);
  const owed = capitalItMayHold(agreement.units, standing);
  const paidAlready = await takenAgainst(tx, context.farm.id, agreement.id);
  const paidNow = roundMoney(paidAlready + receipt.amountMoney);
  if (paidNow > owed) {
    throw new ORPCError("BAD_REQUEST", {
      message: `This Agreement is for ${Math.max(0, owed - paidAlready)} more ${currencyWords("en").sum}`,
      data: { refusal: "capital_over_units" },
    });
  }
  const { monthly } = paidForBy(standing);
  let allocation: Allocated | null = null;
  if (monthly) {
    const terms = {
      units: agreement.units,
      unitPriceMoney: standing.unitPriceMoney,
      monthly,
      today: farmDayOf(now),
    };
    allocation = {
      before: monthlyPaymentAllocationOf({ ...terms, paidMoney: paidAlready }),
      after: monthlyPaymentAllocationOf({ ...terms, paidMoney: paidNow }),
    };
  }
  // Asked after the count, which is the order these two were refused in before the count moved inside the lock: a
  // payment that is both unpapered and over its Units hears the same of the two things it heard before.
  const photo = await tx.query.agreementPaper.findFirst({
    where: { agreementId: agreement.id, farmId: context.farm.id },
    columns: { agreementId: true },
  });
  if (!paperOnFile(agreement, photo !== undefined)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The stamped Agreement is not on file yet",
      data: { refusal: "agreement_has_no_paper" },
    });
  }
  // One transfer is one payment: the same reference taken twice raised an Investor's share of the profit by money he
  // never sent.
  await assertReferenceNotTaken(tx, {
    farmId: context.farm.id,
    ventureId: agreement.ventureId,
    reference: receipt.reference,
  });
  await tx.insert(ventureMovement).values({
    id,
    farmId: context.farm.id,
    ventureId: agreement.ventureId,
    kind: "capital_in",
    agreementId: agreement.id,
    amountMoney: receipt.amountMoney,
    movedOn: receipt.movedOn,
    reference: receipt.reference,
    recordedBy: context.actor.id,
    createdAt: now,
  });
  // The Farm's own Units are paid for with the Farm's own money: it leaves the Farm's books as it lands here.
  if (isTheFarmsOwn(agreement)) {
    await bookMoney(
      tx,
      bookingOf(
        context,
        "owner",
        now,
        accountSaid(["venture_capital_out"], {
          reference: receipt.reference,
          ...(receipt.farmAccountId === undefined
            ? {}
            : { farmAccountId: receipt.farmAccountId }),
        })
      ),
      {
        source: "venture_capital_out",
        sourceId: id,
        amountMoney: receipt.amountMoney,
        occurredAt: startOfFarmDay(receipt.movedOn),
        counterpartyId: null,
        paymentMethod: "bank",
      }
    );
  }
  if (receipt.payInNoteId) {
    await receiveTheNote(context, tx, {
      noteId: receipt.payInNoteId,
      agreementId: agreement.id,
      movementId: id,
    });
  }
  // Nothing left owing: a note still waiting is for money the paper cannot take.
  if (paidNow >= owed) {
    await closePayInNotes(
      tx,
      audited(context).recordEvent,
      context.farm.id,
      { agreementId: agreement.id },
      "nothing_owed",
      now
    );
  }
  return { id, allocation };
};

/**
 * A month's capital from the grid: every row the Owner found on the statement, each its own receipt and its own entry
 * in the trail, all in one transaction behind one lock on the Farm.
 *
 * All or nothing. A statement is read once, top to bottom: a grid half written would leave the Owner to work out which
 * of its lines are in the books, and a row put right would go in after the others on a later day than the ones it was
 * read with. A refused row says which it is, and nothing of the grid is kept until it reads clean.
 */
export const receiveMonthsCapital = (
  context: Acting,
  {
    ventureId,
    receipts,
  }: { ventureId: string; receipts: readonly CapitalReceipt[] }
) => {
  // The same transfer twice in one grid is refused before anything is read, naming the second line it was written on.
  assertEachReferenceOnce(receipts, "capital_reference_twice");
  const now = context.clock.now();
  return seenWhenDone(
    context.db.transaction(async (tx) => {
      await lockTheFarm(tx, context.farm.id);
      const received: {
        id: string;
        agreementId: string;
        allocation: Allocated | null;
      }[] = [];
      for (const [index, receipt] of receipts.entries()) {
        const id = uuidv7(now);
        try {
          // oxlint-disable-next-line no-await-in-loop -- one transaction, one receipt at a time, each counted after the last
          const agreement = await theAgreement(
            { ...context, db: tx },
            receipt.agreementId
          );
          // A row on another Venture's paper is not this Venture's statement.
          if (agreement.ventureId !== ventureId) {
            throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
          }
          // oxlint-disable-next-line no-await-in-loop -- one transaction, one receipt at a time, each counted after the last
          const { allocation } = await receiveCapital(context, tx, receipt, {
            id,
            now,
          });
          // oxlint-disable-next-line no-await-in-loop -- the trail entry beside its own receipt
          await audited(context).recordEvent(tx, {
            entity: "venture_movement",
            entityId: id,
            action: "create",
            after: async (inner) => ({
              ...(await readMovement(inner, context.farm.id, id)),
              ...(allocation ? { allocation } : {}),
            }),
          });
          received.push({ id, agreementId: receipt.agreementId, allocation });
        } catch (error) {
          throw onRow(error, index + 1);
        }
      }
      return { received };
    })
  );
};
