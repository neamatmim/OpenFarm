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

const AGREEMENT_COLUMNS = {
  id: true,
  ventureId: true,
  units: true,
  stampKind: true,
} as const;

/** This Farm's Investment Agreement, or nothing the caller may move money against. */
export const theAgreement = async (
  context: { db: Pick<Tx, "query">; farm: { id: string } },
  id: string
) => {
  const row = await context.db.query.investmentAgreement.findFirst({
    where: { id, farmId: context.farm.id },
    columns: AGREEMENT_COLUMNS,
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
  }
  return row;
};

type VentureRow = NonNullable<
  Awaited<ReturnType<Tx["query"]["venture"]["findFirst"]>>
>;

/**
 * What a receipt is counted against, read behind the lock: its Venture, its paper, what the paper has taken already,
 * whether its stamped paper is on file, and every reference the Venture's capital holds — the last kept up to date as
 * each receipt lands, so a grid's later line is refused a reference an earlier one took.
 */
interface Known {
  venture: VentureRow;
  agreement: Awaited<ReturnType<typeof theAgreement>>;
  paidAlready: number;
  hasPaper: boolean;
  referencesTaken: Set<string>;
}

/** Every reference a Venture's capital already holds, as one transfer is read. */
const referencesOf = async (tx: Tx, farmId: string, ventureId: string) => {
  const taken = await tx.query.ventureMovement.findMany({
    where: { farmId, ventureId, kind: "capital_in" },
    columns: { reference: true },
  });
  return new Set(taken.map((one) => asOneReference(one.reference)));
};

/** The Venture's waiting Pay-in Note on this paper whose reference is the receipt's: the same money the Investor told of. */
const noteOfTheSameMoney = async (
  tx: Tx,
  farmId: string,
  agreementId: string,
  reference: string
) => {
  const waiting = await tx.query.payInNote.findMany({
    where: { farmId, agreementId, state: "waiting" },
    columns: { id: true, reference: true },
  });
  const said = asOneReference(reference);
  return waiting.find((one) => asOneReference(one.reference) === said)?.id;
};

/**
 * One receipt of capital, on a transaction already holding the Farm's lock, against what is known of its paper:
 * counted against what the paper may still take, its Monthly Sums allocated, refused under a reference this Venture
 * took before, the Investor's Pay-in Note for the same money answered received, and the Farm's own Units' money booked
 * off the Farm's own books as it lands. The capital sheet's and the month's grid's alike.
 *
 * Counted behind the lock, as signing counts its Units: what an Agreement has taken is only true until the next
 * payment commits, and two arriving together each read a figure that still leaves room for the other. Capital divides
 * by Units, so a Unit paid for twice would take twice its share of the profit while holding one share of the Venture.
 */
const receiveOne = async (
  context: Acting,
  tx: Tx,
  receipt: CapitalReceipt,
  { id, now }: { id: string; now: Date },
  known: Known
): Promise<{ id: string; allocation: Allocated | null; paidNow: number }> => {
  const { venture, agreement, paidAlready } = known;
  const owed = capitalItMayHold(agreement.units, venture);
  const paidNow = roundMoney(paidAlready + receipt.amountMoney);
  if (paidNow > owed) {
    throw new ORPCError("BAD_REQUEST", {
      message: `This Agreement is for ${Math.max(0, owed - paidAlready)} more ${currencyWords("en").sum}`,
      data: { refusal: "capital_over_units" },
    });
  }
  const { monthly } = paidForBy(venture);
  let allocation: Allocated | null = null;
  if (monthly) {
    const terms = {
      units: agreement.units,
      unitPriceMoney: venture.unitPriceMoney,
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
  if (!paperOnFile(agreement, known.hasPaper)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The stamped Agreement is not on file yet",
      data: { refusal: "agreement_has_no_paper" },
    });
  }
  // One transfer is one payment: the same reference taken twice raised an Investor's share of the profit by money he
  // never sent.
  const said = asOneReference(receipt.reference);
  if (known.referencesTaken.has(said)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Venture has already taken capital under that reference",
      data: { refusal: "capital_reference_taken" },
    });
  }
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
  known.referencesTaken.add(said);
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
  // The Investor's own word for the same money is answered: the note the Owner recorded it from, or — read off the
  // statement without it — the waiting note on this paper under the same reference. Left waiting, the same money could
  // be taken again from the note.
  const noteId =
    receipt.payInNoteId ??
    (await noteOfTheSameMoney(
      tx,
      context.farm.id,
      agreement.id,
      receipt.reference
    ));
  if (noteId) {
    await receiveTheNote(context, tx, {
      noteId,
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
  return { id, allocation, paidNow };
};

/** One receipt from the capital sheet, on a transaction already holding the Farm's lock: its paper read, then taken. */
export const receiveCapital = async (
  context: Acting,
  tx: Tx,
  receipt: CapitalReceipt,
  at: { id: string; now: Date }
): Promise<{ id: string; allocation: Allocated | null }> => {
  const agreement = await theAgreement(
    { ...context, db: tx },
    receipt.agreementId
  );
  // Asked behind the lock: a Venture canceled or moved on at the same moment takes nothing.
  const venture = await tx.query.venture.findFirst({
    where: { id: agreement.ventureId, farmId: context.farm.id },
  });
  if (!venture) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  assertTakesCapital(venture);
  const [paidAlready, photo, referencesTaken] = await Promise.all([
    takenAgainst(tx, context.farm.id, agreement.id),
    tx.query.agreementPaper.findFirst({
      where: { agreementId: agreement.id, farmId: context.farm.id },
      columns: { agreementId: true },
    }),
    referencesOf(tx, context.farm.id, agreement.ventureId),
  ]);
  const { id, allocation } = await receiveOne(context, tx, receipt, at, {
    venture,
    agreement,
    paidAlready,
    hasPaper: photo !== undefined,
    referencesTaken,
  });
  return { id, allocation };
};

/**
 * A month's capital from the grid: every row the Owner found on the statement, each its own receipt and its own entry
 * in the trail, all in one transaction behind one lock on the Farm. The Venture, its papers, what each has taken and the
 * references its capital holds are read once; what each receipt changes is carried on to the next.
 *
 * All or nothing. A statement is read once, top to bottom: a grid half written would leave the Owner to work out which
 * of its lines are in the books, and a row put right would go in after the others on a later day than the ones it was
 * read with. A refused row says which it is, and nothing of the grid is kept until it reads clean; a refusal of the
 * whole grid — the Venture takes no capital now — names no row.
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
  const farmId = context.farm.id;
  const named = [...new Set(receipts.map((one) => one.agreementId))];
  return seenWhenDone(
    context.db.transaction(async (tx) => {
      await lockTheFarm(tx, farmId);
      // Asked behind the lock: a Venture canceled or moved on at the same moment takes nothing.
      const venture = await tx.query.venture.findFirst({
        where: { id: ventureId, farmId },
      });
      if (!venture) {
        throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
      }
      assertTakesCapital(venture);
      const [papers, photos, moved] = await Promise.all([
        tx.query.investmentAgreement.findMany({
          where: { farmId, ventureId, id: { in: named } },
          columns: AGREEMENT_COLUMNS,
        }),
        tx.query.agreementPaper.findMany({
          where: { farmId, agreementId: { in: named } },
          columns: { agreementId: true },
        }),
        tx.query.ventureMovement.findMany({
          where: { farmId, ventureId, kind: "capital_in" },
          columns: { agreementId: true, amountMoney: true, reference: true },
        }),
      ]);
      const paperOf = new Map(papers.map((one) => [one.id, one]));
      const photographed = new Set(photos.map((one) => one.agreementId));
      const referencesTaken = new Set(
        moved.map((one) => asOneReference(one.reference))
      );
      const taken = new Map<string, number>();
      for (const one of moved) {
        if (one.agreementId) {
          taken.set(
            one.agreementId,
            roundMoney((taken.get(one.agreementId) ?? 0) + one.amountMoney)
          );
        }
      }
      const received: {
        id: string;
        agreementId: string;
        allocation: Allocated | null;
      }[] = [];
      for (const [index, receipt] of receipts.entries()) {
        const id = uuidv7(now);
        try {
          // A row on another Venture's paper, or none of this Farm's, is not this Venture's statement.
          const agreement = paperOf.get(receipt.agreementId);
          if (!agreement) {
            throw new ORPCError("NOT_FOUND", { message: "No such Agreement" });
          }
          // oxlint-disable-next-line no-await-in-loop -- one transaction, one receipt at a time, each counted after the last
          const { allocation, paidNow } = await receiveOne(
            context,
            tx,
            receipt,
            { id, now },
            {
              venture,
              agreement,
              paidAlready: taken.get(agreement.id) ?? 0,
              hasPaper: photographed.has(agreement.id),
              referencesTaken,
            }
          );
          taken.set(agreement.id, paidNow);
          // oxlint-disable-next-line no-await-in-loop -- the trail entry beside its own receipt
          await audited(context).recordEvent(tx, {
            entity: "venture_movement",
            entityId: id,
            action: "create",
            after: async (inner) => ({
              ...(await readMovement(inner, farmId, id)),
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
