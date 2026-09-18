import { eq } from "@OpenFarm/db/operators";
import { ventureMovement } from "@OpenFarm/db/schema/venture";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { farmDay } from "../farm-clock";
import { amountInput } from "../money-inputs";
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
      amountBdt: true,
      movedOn: true,
      reference: true,
    },
  });

type MovementRow = NonNullable<Awaited<ReturnType<typeof findMovement>>>;

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
  if (venture?.state === "settled") {
    throw refuse(
      "That Venture is settled; raise a Settlement Adjustment instead",
      "venture_is_settled"
    );
  }
  if (venture?.state === "cancelled") {
    // Calling a Venture off sent every taka back, one refund against each payment. Change what came in and
    // the refund beside it stops matching, and the Venture reads as still holding somebody's money.
    throw refuse(
      "That Venture was called off and its money sent back",
      "venture_is_cancelled"
    );
  }
  if (row.internalSaleId) {
    // An Internal Sale is two movements and a price, and where the Farm is a side, a Money Event too. One of
    // them changed alone would leave two purses disagreeing about the same sale.
    throw refuse(
      "That is one side of an Internal Sale; the sale itself is what to put right",
      "one_side_of_a_sale"
    );
  }
  if (row.saleId) {
    // What a buyer paid is written from the Sale and moves when the Sale's price is put right. Changed
    // here instead, the Venture's account and the Sale would disagree about one payment.
    throw refuse(
      "That money comes from a Sale; put the Sale right",
      "correct_the_record"
    );
  }
  if (row.buyingTripId) {
    const counted = await tx.query.ventureMovement.findFirst({
      where: {
        farmId: row.farmId,
        buyingTripId: row.buyingTripId,
        kind: "float_out",
        reconciledAt: { isNotNull: true },
      },
      columns: { id: true },
    });
    if (counted) {
      throw refuse(
        "That outing's Float has been counted; it takes nothing more",
        "float_already_reconciled"
      );
    }
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
  amountBdt: changeOf(amountInput, z.number()),
  movedOn: changeOf(farmDay, z.string()),
  reference: changeOf(z.string().trim().min(1).max(120), z.string()),
});

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
  amountBdt: number
) => {
  if (row.kind !== "capital_in" || !row.agreementId) {
    return;
  }
  const agreement = await tx.query.investmentAgreement.findFirst({
    where: { id: row.agreementId, farmId: row.farmId },
    columns: { units: true },
  });
  const plan = await tx.query.venture.findFirst({
    where: { id: row.ventureId, farmId: row.farmId },
    columns: { unitPriceBdt: true },
  });
  const paid = await tx.query.ventureMovement.findMany({
    where: {
      farmId: row.farmId,
      agreementId: row.agreementId,
      kind: "capital_in",
      id: { ne: row.id },
    },
    columns: { amountBdt: true },
  });
  const owed = (agreement?.units ?? 0) * Number(plan?.unitPriceBdt ?? 0);
  const already = paid.reduce((sum, one) => sum + Number(one.amountBdt), 0);
  if (already + amountBdt > owed) {
    throw refuse(
      `This Agreement is for ${owed - already} more taka`,
      "capital_over_units"
    );
  }
};

/**
 * A movement of a Venture's money put right: what it says, not whether it happened.
 *
 * Never deleted and never replaced by a second movement — an Investor's money moving and then appearing
 * never to have moved is the one thing these records must not be able to say. What the correction changes
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
      amountBdt: Number(row.amountBdt),
      movedOn: row.movedOn,
      reference: row.reference,
    }),
  trail: (tx, row) => readMovement(tx, row.farmId, row.id),
  apply: async (tx, row, to) => {
    if (to.amountBdt !== undefined) {
      assertTheFigureIsHersToChange(row);
      await assertWithinItsUnits(tx, row, to.amountBdt);
    }
    const putRight = {
      ...(to.amountBdt === undefined
        ? {}
        : { amountBdt: to.amountBdt.toFixed(2) }),
      ...(to.movedOn === undefined ? {} : { movedOn: to.movedOn }),
      ...(to.reference === undefined ? {} : { reference: to.reference }),
    };
    if (somethingChanged(putRight)) {
      await tx
        .update(ventureMovement)
        .set(putRight)
        .where(eq(ventureMovement.id, row.id));
    }
  },
};
