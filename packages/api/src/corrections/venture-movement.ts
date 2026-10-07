import { and, eq } from "@OpenFarm/db/operators";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import { ventureMovement } from "@OpenFarm/db/schema/venture-account";
import { capitalItMayHold, startOfFarmDay } from "@OpenFarm/domain";
import { currencyWords } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { farmsOwnOf } from "../farm-capital-store";
import { farmDay } from "../farm-clock";
import { amountInput } from "../money-inputs";
import { forgetTheMoneyOf } from "../money-store";
import { closePayInNotes } from "../pay-in-notes";
import { lockTheFarm, readMovement } from "../venture-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const refuse = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

const findMovement = (tx: Tx, farmId: string, id: string) =>
  tx.query.ventureMovement.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      ventureId: true,
      kind: true,
      agreementId: true,
      buyingTripId: true,
      internalSaleId: true,
      saleId: true,
      intakeId: true,
      amountMoney: true,
      movedOn: true,
      reference: true,
    },
  });

type MovementRow = NonNullable<Awaited<ReturnType<typeof findMovement>>>;

/**
 * The Settlement's own money — an Investor's payout, the Advance coming back, the Farm's share or its share of a loss —
 * is what the approved Settlement worked out, frozen; the Farm's Money Event for its share says the same figure. Its
 * amount typed over left the Venture settled at less or more than nothing and the Farm's books disagreeing with it:
 * only the day it moved and the reference on it are put right.
 */
const SETTLEMENT_MONEY: ReadonlySet<string> = new Set([
  "payout",
  "advance_repaid",
  "farm_share",
  "farm_loss_in",
]);

/** Why nothing about a Venture Movement may be put right, as the farm says it — or null, where it may be. */
export interface WhyItStands {
  message: string;
  refusal: string;
}

/**
 * Whether the farm has already built something on this movement that a change would silently falsify — asked of
 * what is already known of it: the Venture's state, the row, and whether its outing's Float has been counted.
 *
 * Pure, so the list of a Venture's movements asks it too, row by row, and offers Correct only where this says
 * nothing: the button and the refusal are the one answer.
 */
export const whyItStands = (
  row: {
    kind: string;
    internalSaleId: string | null;
    saleId: string | null;
    intakeId: string | null;
    /** Whether it moved the Farm's own capital, whose Money Event stands on the Farm's books beside it: put right
     *  together with it, so no longer a reason it stands. */
    farmsOwn?: boolean;
  },
  ventureState: string | undefined,
  floatCounted: boolean
): WhyItStands | null => {
  // A settled Venture's own payouts are still put right in their day and reference: neither moves a figure the
  // Settlement froze, and a mistyped reference on the last payout otherwise stood for good.
  if (ventureState === "settled" && !SETTLEMENT_MONEY.has(row.kind)) {
    return {
      message: "That Venture is settled; raise a Settlement Adjustment instead",
      refusal: "venture_is_settled",
    };
  }
  if (ventureState === "cancelled") {
    // Calling a Venture off sent every taka back, one refund against each payment. Change what came in and
    // the refund beside it stops matching, and the Venture reads as still holding somebody's money.
    return {
      message: "That Venture was called off and its money sent back",
      refusal: "venture_is_cancelled",
    };
  }
  if (row.internalSaleId) {
    // An Internal Sale is two movements and a price, and where the Farm is a side, a Money Event too. One of
    // them changed alone would leave two purses disagreeing about the same sale.
    return {
      message:
        "That is one side of an Internal Sale; the sale itself is what to put right",
      refusal: "one_side_of_a_sale",
    };
  }
  if (row.kind === "made_good") {
    // A lost animal made good is the Farm's own money in, with the Farm's Money Event out beside it. Changed here alone,
    // the Venture and the Farm's books would disagree about one transfer.
    return {
      message:
        "That made a lost animal good from the Farm's own money; it is not put right on the Venture's side alone",
      refusal: "made_good_with_the_farms_money",
    };
  }
  if (row.intakeId) {
    // A bull bought by bank with no outing: the movement is written from her Intake and moves when the Intake's price
    // is put right. Changed here instead, the account and what she cost would disagree.
    return {
      message: "That money paid for a bull at the gate; put her Intake right",
      refusal: "correct_the_record",
    };
  }
  if (row.saleId) {
    // What a buyer paid is written from the Sale and moves when the Sale's price is put right. Changed
    // here instead, the Venture's account and the Sale would disagree about one payment.
    return {
      message: "That money comes from a Sale; put the Sale right",
      refusal: "correct_the_record",
    };
  }
  if (floatCounted) {
    return {
      message: "That outing's Float has been counted; it takes nothing more",
      refusal: "float_already_reconciled",
    };
  }
  return null;
};

/**
 * Whether the farm has already built something on this movement that a change would silently falsify.
 *
 * Asked while the row is loaded, before anything else the Correction checks, so that what she meets is the
 * farm's own word for why this movement is not hers to change — rather than a window, or an answer about a
 * figure having moved since she opened it. A movement no Correction may touch at all is refused here; what
 * depends on the change she is making is refused where the change is known.
 */
const assertNothingRestsOnIt = async (tx: Tx, row: MovementRow) => {
  const venture = await tx.query.venture.findFirst({
    where: { id: row.ventureId, farmId: row.farmId },
    columns: { state: true },
  });
  const counted = row.buyingTripId
    ? await tx.query.ventureMovement.findFirst({
        where: {
          farmId: row.farmId,
          buyingTripId: row.buyingTripId,
          kind: "float_out",
          reconciledAt: { isNotNull: true },
        },
        columns: { id: true },
      })
    : undefined;
  const itsOwn = await farmsOwnOf(
    tx,
    row.farmId,
    row.agreementId ? [row.agreementId] : []
  );
  const farmsOwn = itsOwn.size > 0;
  const stands = whyItStands(
    { ...row, farmsOwn },
    venture?.state,
    counted !== undefined
  );
  if (stands) {
    throw refuse(stands.message, stands.refusal);
  }
};

const loadMovement = async (tx: Tx, farmId: string, id: string) => {
  const row = await findMovement(tx, farmId, id);
  if (row) {
    await assertNothingRestsOnIt(tx, row);
  }
  return row;
};

/**
 * What a Venture Movement's Correction may change: how much moved, the day the bank moved it, and the
 * reference on the instrument. Never which Venture it was, nor what kind of movement — a capital payment
 * that was really an Advance is two different acts, and one is not the other put right. Never nothing
 * either: the amount is `amountInput`, which is above zero, because a movement corrected to zero is a
 * movement deleted in all but the row.
 */
export const ventureMovementCorrectionInput = correctionInput({
  amountMoney: changeOf(amountInput, z.number()),
  movedOn: changeOf(farmDay, z.string()),
  reference: changeOf(z.string().trim().min(1).max(120), z.string()),
  /** An Investor's capital payment written twice: voided by the Owner with a reason, kept in the trail as voided (the
   *  Owner, 2026-10-07). Only that: any other movement is an act that happened, put right but never undone. */
  voided: changeOf(z.literal(true), z.boolean()),
});

/** Refuses a void of anything but a capital payment, and of one a Pay-in Note was confirmed into: the note says it came. */
const assertMayBeVoided = async (tx: Tx, row: MovementRow) => {
  if (row.kind !== "capital_in") {
    throw refuse(
      "Only a capital payment written twice is voided; this money moved",
      "only_capital_is_voided"
    );
  }
  const note = await tx.query.payInNote.findFirst({
    where: { farmId: row.farmId, movementId: row.id },
    columns: { id: true },
  });
  if (note) {
    throw refuse(
      "This payment was confirmed from the Investor's own Pay-in Note; void the other one",
      "confirmed_from_a_note"
    );
  }
};

const assertNotASettlementFigure = (row: MovementRow) => {
  if (SETTLEMENT_MONEY.has(row.kind)) {
    throw refuse(
      "That is the Settlement's own figure: its day and reference are put right, never its amount",
      "settlement_figure"
    );
  }
};

/**
 * A Reimbursement's figure is what that month's costs came to, and the month may not be reimbursed again, so
 * a figure typed over it is one nothing can be recomputed from. What she typed herself — the day it moved
 * and the reference on it — is still hers to put right.
 */
const assertTheFigureIsHersToChange = (row: MovementRow) => {
  if (row.kind === "reimbursement") {
    throw refuse(
      "A month's reimbursement is what its costs came to; put the costs right instead",
      "reimbursement_is_computed"
    );
  }
};

/**
 * That the Agreement is still only paid for the Units it holds. The same door the payment came through: an
 * Investor pays for his Units and no more, because a Unit paid for twice would take twice its share of the
 * profit while holding one share — and a Correction may not walk round a rule the payment was refused by.
 */
const assertWithinItsUnits = async (
  tx: Tx,
  row: MovementRow,
  amountMoney: number
): Promise<{ filled: boolean }> => {
  if (row.kind !== "capital_in" || !row.agreementId) {
    return { filled: false };
  }
  const agreement = await tx.query.investmentAgreement.findFirst({
    where: { id: row.agreementId, farmId: row.farmId },
    columns: { units: true },
  });
  const plan = await tx.query.venture.findFirst({
    where: { id: row.ventureId, farmId: row.farmId },
    columns: {
      state: true,
      capitalPaid: true,
      unitPriceMoney: true,
      cattlePartMoney: true,
    },
  });
  const paid = await tx.query.ventureMovement.findMany({
    where: {
      farmId: row.farmId,
      agreementId: row.agreementId,
      kind: "capital_in",
      id: { ne: row.id },
    },
    columns: { amountMoney: true },
  });
  // Its Units' whole price, or their Cattle Part while a Venture paid by the month gathers its capital — as the payment
  // itself was held to.
  const units = agreement?.units ?? 0;
  const owed = plan ? capitalItMayHold(units, plan) : 0;
  const cattlePartOnly = plan ? owed < units * plan.unitPriceMoney : false;
  const already = paid.reduce((sum, one) => sum + one.amountMoney, 0);
  if (already + amountMoney > owed) {
    throw refuse(
      `This Agreement is for ${owed - already} more ${currencyWords("en").sum}`,
      cattlePartOnly ? "capital_over_cattle_part" : "capital_over_units"
    );
  }
  return { filled: already + amountMoney >= owed };
};

/**
 * A movement of a Venture's money put right: what it says, not whether it happened.
 *
 * Never replaced by a second movement, and never deleted but for a capital payment written twice — voided by the Owner,
 * the trail keeping what it said — because an Investor's money moving and then appearing never to have moved is the one
 * thing these records must not be able to say. What the correction changes
 * flows through everything read from the movements themselves: what the account holds, what each budget
 * holds, what the Venture owes the Owner, and the Floor it may start buying on.
 *
 * A month whose Bank Check was taken before the change is left to say so itself, rather than refused here: a
 * check exists to catch a figure typed wrong, and a check that then forbade putting it right would be the
 * wrong way round.
 */
export const ventureMovementCorrection: CorrectionKind<
  MovementRow,
  z.infer<typeof ventureMovementCorrectionInput>["changes"]
> = {
  entity: "venture_movement",
  table: ventureMovement,
  roles: ["owner"],
  lock: lockTheFarm,
  missing: "No such movement",
  load: loadMovement,
  // The Owner's window is open-ended, so nothing here turns on when it was entered or by whom.
  entry: null,
  shown: (_tx, row) =>
    Promise.resolve({
      amountMoney: row.amountMoney,
      movedOn: row.movedOn,
      reference: row.reference,
      voided: false,
    }),
  trail: (tx, row) => readMovement(tx, row.farmId, row.id),
  apply: async (tx, row, to, { context, now }) => {
    if (to.voided) {
      await assertMayBeVoided(tx, row);
      // The Farm's own capital written twice leaves its books with it.
      await forgetTheMoneyOf(tx, "venture_capital_out", row.id);
      await tx.delete(ventureMovement).where(eq(ventureMovement.id, row.id));
      return;
    }
    if (to.amountMoney !== undefined) {
      assertNotASettlementFigure(row);
      assertTheFigureIsHersToChange(row);
      const { filled } = await assertWithinItsUnits(tx, row, to.amountMoney);
      // Nothing left owing on its paper now, as when the money was first taken: a note still waiting is for money the
      // paper cannot take.
      if (filled && row.agreementId) {
        await closePayInNotes(
          tx,
          audited(context).recordEvent,
          row.farmId,
          { agreementId: row.agreementId },
          "nothing_owed",
          now
        );
      }
    }
    const putRight = {
      ...(to.amountMoney === undefined ? {} : { amountMoney: to.amountMoney }),
      ...(to.movedOn === undefined ? {} : { movedOn: to.movedOn }),
      ...(to.reference === undefined ? {} : { reference: to.reference }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(ventureMovement)
        .set(putRight)
        .where(eq(ventureMovement.id, row.id));
    }
    // The Farm's own side of it — its share, its loss, its own capital — is a Money Event named by this movement: its
    // day and reference move with it, and for the Farm's own capital its amount too, so the Farm's books and the
    // Venture's say the same transfer. (A Settlement's figures never reach here with an amount: refused above.)
    const followed = {
      ...(to.amountMoney === undefined ? {} : { amountMoney: to.amountMoney }),
      ...(to.movedOn === undefined
        ? {}
        : { occurredAt: startOfFarmDay(to.movedOn) }),
      ...(to.reference === undefined ? {} : { reference: to.reference }),
    };
    if (somethingChanged(followed)) {
      await tx
        .update(moneyEvent)
        .set(followed)
        .where(
          and(
            eq(moneyEvent.farmId, row.farmId),
            eq(moneyEvent.sourceId, row.id)
          )
        );
    }
  },
};
