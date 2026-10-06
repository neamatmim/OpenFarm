import { eq, inArray } from "@OpenFarm/db/operators";
import { sale, sellingTripAnimal } from "@OpenFarm/db/schema/fattening";
import { moneyEvent, moneyReceipt } from "@OpenFarm/db/schema/money";
import { sellingTrip } from "@OpenFarm/db/schema/trip";
import {
  receivablePutRight,
  farmDayOf,
  paidAtTheGate,
  underMeatWithdrawal,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  tellIfShrankTooMuch,
  tellIfSoldUnderCost,
} from "../animal-price-store";
import type { Tx } from "../audit";
import { audited } from "../audit";
import { assertTheHand, handOfTheRecord } from "../cash-store";
import { counterpartyNamed } from "../counterparty-store";
import { comesBackFromAVoidedExit, correctHowSheLeft } from "../herd-store";
import { farmAccountChange, paymentMethodChange } from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  farmAccountShownOf,
  paymentMethodOf,
} from "../money-store";
import {
  assertNothingStandsAgainst,
  assertOwedCoversPaid,
  assertOwedCoversWrittenOff,
  paidOnItem,
  receivableOrRefuse,
  paidNowInput,
  promisedByInput,
} from "../receivable-store";
import {
  bookSaleMoney,
  brokerInput,
  buyerInput,
  salePriceInput,
  readSale,
} from "../sale-store";
import { assertNotSettledUp } from "../venture-act";
import { backFromSellingOnAVoid, lockTheFarm } from "../venture-store";
import type { CorrectionKind, Corrector, NewValues } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadSale = (tx: Tx, farmId: string, id: string) =>
  tx.query.sale.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      priceMoney: true,
      receivableMoney: true,
      brokerMoney: true,
      promisedBy: true,
      weightKg: true,
      soldAt: true,
      animalId: true,
      counterpartyId: true,
      stateBefore: true,
      stateChangedBefore: true,
      ventureStateBefore: true,
      recordedBy: true,
      createdAt: true,
    },
    with: { buyer: { columns: { name: true } } },
  });

/** A Venture's cash from this Sale already deposited into its account, with its slip: the figure is the bank's now. */
const assertNotDeposited = async (tx: Tx, saleId: string) => {
  const deposited = await tx.query.ventureMovement.findFirst({
    where: { saleId, handoverId: { isNotNull: true } },
    columns: { id: true },
  });
  if (deposited) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Its cash is in the Venture Account already; the bank holds what the slip said",
      data: { refusal: "money_moved_since" },
    });
  }
};

/**
 * A Sale written against the wrong animal, voided by the Owner: what it booked is put to nothing — her price, the broker,
 * a Venture's proceeds — and taken off the books with the Sale itself, and she comes back as she was. Refused where
 * money has moved on it since: a buyer paying off what he owed, a write-off, a Venture settled on her.
 */
const voidTheSale = async (
  tx: Tx,
  row: NonNullable<Awaited<ReturnType<typeof loadSale>>>,
  context: Corrector,
  now: Date
) => {
  if (context.roleUsed !== "owner") {
    throw new ORPCError("FORBIDDEN", {
      message: "Only the Owner voids a Sale",
      data: { refusal: "owner_only" },
    });
  }
  if (!(row.stateBefore && row.stateChangedBefore)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Sale was written before a Sale could be voided",
      data: { refusal: "cannot_be_voided" },
    });
  }
  const paidOrWrittenOff =
    (await tx.query.receivableWriteOff.findFirst({
      where: { source: "sale", sourceId: row.id },
      columns: { id: true },
    })) ??
    // What his payments cleared of this Sale, not whether he ever paid the farm anything: a regular trader's mistaken
    // credit Sale is voided like any other until he pays something off it.
    (row.receivableMoney > 0 &&
    (await paidOnItem(tx, row.farmId, row.counterpartyId, row.id)) > 0
      ? { id: row.id }
      : undefined);
  // Her Venture's Settlement approved — not only settled — holds what she fetched: a void after it took the proceeds
  // out of an account whose Settlement already counted them (venture-act's `assertNotSettledUp`).
  const hers = await tx.query.animal.findFirst({
    where: { id: row.animalId },
    columns: { ownerVentureId: true },
  });
  if (hers?.ownerVentureId) {
    await assertNotSettledUp(tx, row.farmId, hers.ownerVentureId);
  }
  if (paidOrWrittenOff) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Money has moved on this Sale since; put it right instead",
      data: { refusal: "money_moved_since" },
    });
  }
  // Cash deposited into the Venture Account is in the bank: voiding the Sale would take it off the account's books.
  await assertNotDeposited(tx, row.id);
  await tx
    .update(sale)
    .set({
      priceMoney: 0,
      receivableMoney: 0,
      promisedBy: null,
      brokerMoney: 0,
    })
    .where(eq(sale.id, row.id));
  await bookSaleMoney(tx, bookingOf(context, context.roleUsed, now), row.id);
  const events = await tx.query.moneyEvent.findMany({
    where: { sourceId: row.id, source: { in: ["sale", "sale_broker"] } },
    columns: { id: true },
  });
  const ids = events.map((one) => one.id);
  if (ids.length > 0) {
    await tx
      .delete(moneyReceipt)
      .where(inArray(moneyReceipt.moneyEventId, ids));
    await tx.delete(moneyEvent).where(inArray(moneyEvent.id, ids));
  }
  await tx.delete(sale).where(eq(sale.id, row.id));
  // The Venture this Sale made Selling goes back where it stood, unless another of its animals has been sold since.
  if (hers?.ownerVentureId && row.ventureStateBefore) {
    await backFromSellingOnAVoid(
      tx,
      row.farmId,
      hers.ownerVentureId,
      row.ventureStateBefore,
      audited(context).recordEvent
    );
  }
  await comesBackFromAVoidedExit(
    tx,
    row.farmId,
    { id: row.animalId },
    {
      state: row.stateBefore,
      since: row.stateChangedBefore,
      leftAt: row.soldAt,
      now,
      trail: audited(context).recordEvent,
    }
  );
};

/**
 * Moves the day she left, asking of the new day what the Sale was asked when written: not one still to come, not inside
 * her meat Withdrawal, not before a Selling Trip that carried her, and not before she was here.
 */
const moveTheDay = async (
  tx: Tx,
  row: { id: string; farmId: string; animalId: string },
  soldAt: Date,
  now: Date
) => {
  if (soldAt > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Sale cannot be on a day that has not come yet",
      data: { refusal: "sold_in_the_future" },
    });
  }
  // The gate the Sale was written through is asked again about the day it moves to: a Sale written up after her
  // days and corrected back into them is the back-dating the gate exists to stop (`sales.record`).
  const hers = await tx.query.animal.findFirst({
    where: { id: row.animalId },
    columns: { meatWithdrawalUntil: true },
  });
  if (hers && underMeatWithdrawal(hers, soldAt)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "On that day she was still inside her meat withdrawal",
      data: { refusal: "inside_withdrawal_that_day" },
    });
  }
  // A lorry that went to market after the day she is now said to have left could not have carried her.
  const lorries = await tx
    .select({ wentOn: sellingTrip.wentOn })
    .from(sellingTripAnimal)
    .innerJoin(sellingTrip, eq(sellingTrip.id, sellingTripAnimal.sellingTripId))
    .where(eq(sellingTripAnimal.animalId, row.animalId));
  const leftOn = farmDayOf(soldAt);
  if (lorries.some((one) => farmDayOf(one.wentOn) > leftOn)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "She was on a Selling Trip after that day",
      data: { refusal: "left_before_her_lorry" },
    });
  }
  // Her leaving moves with it — not before she was here (herd-store) — and the money is booked on the day again.
  await correctHowSheLeft(
    tx,
    row.farmId,
    { id: row.animalId },
    {
      at: soldAt,
      now,
    }
  );
  await tx.update(sale).set({ soldAt }).where(eq(sale.id, row.id));
};

/** What a Sale's Correction may change: what she fetched, what she weighed on the day, who bought her, how he paid,
 *  what he paid there and then, the day he promised to pay the rest by, and what the broker took. */
export const saleCorrectionInput = correctionInput({
  priceMoney: changeOf(salePriceInput, z.number()),
  buyer: changeOf(buyerInput, z.string()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account mobile money or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
  paidNowMoney: changeOf(paidNowInput, z.number()),
  promisedBy: changeOf(promisedByInput.nullable(), z.string().nullable()),
  brokerMoney: changeOf(brokerInput, z.number()),
  weightKg: changeOf(z.number().positive().max(2000), z.number()),
  /** Whose hand took the cash, put right on the rule a Sale is written on (`assertTheHand`). */
  heldBy: changeOf(z.string(), z.string().nullable()),
  /** The day she really left: a Sale written up the next morning without its day kept the day it was written. */
  soldAt: changeOf(z.coerce.date(), z.coerce.date()),
  /** Written against the wrong animal: the Owner voids it, and she comes back as she was (the Owner, 2026-10-06). */
  voided: changeOf(z.literal(true), z.boolean()),
});

/**
 * What her buyer owes once the Correction stands, and who he is — refused where it would leave him owing less than was
 * written off or than his payments have cleared, or name another buyer once anything stands against it.
 */
const owedAfter = async (
  tx: Tx,
  row: NonNullable<Awaited<ReturnType<typeof loadSale>>>,
  to: NewValues<z.infer<typeof saleCorrectionInput>["changes"]>,
  now: Date
) => {
  // What he paid stands unless the Correction says otherwise: a price mistyped is not cash handed back.
  const receivable = receivableOrRefuse(
    receivablePutRight({
      before: {
        worthMoney: row.priceMoney,
        receivableMoney: row.receivableMoney,
        promisedBy: row.promisedBy,
      },
      worthMoney: to.priceMoney ?? row.priceMoney,
      paidNowMoney: to.paidNowMoney,
      promisedBy: to.promisedBy,
      // The day she left as corrected: a promise of payment before she went is no promise.
      leftOn: farmDayOf(to.soldAt ?? row.soldAt),
      promiseRequired: true,
    })
  );
  const receivableMoved =
    receivable.receivableMoney !== row.receivableMoney ||
    receivable.promisedBy !== row.promisedBy;
  if (receivable.receivableMoney < row.receivableMoney) {
    await assertOwedCoversWrittenOff(
      tx,
      "sale",
      row.id,
      receivable.receivableMoney
    );
    await assertOwedCoversPaid(tx, row.farmId, row, receivable.receivableMoney);
  }
  const buyerId =
    to.buyer === undefined
      ? row.counterpartyId
      : await counterpartyNamed(tx, row.farmId, to.buyer, now);
  if (buyerId !== row.counterpartyId) {
    await assertNothingStandsAgainst(tx, row.farmId, row);
  }
  return { receivable, receivableMoved, buyerId };
};

/**
 * A Sale put right — and with it the Money Event, rather than a second one. She stays sold: the way she left is not
 * what is corrected.
 */
export const saleCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadSale>>>,
  z.infer<typeof saleCorrectionInput>["changes"]
> = {
  entity: "sale",
  table: sale,
  roles: ["owner", "manager"],
  // Putting one of these right can move a Venture Movement, so it takes the Farm lock first, as
  // everything that counts a Venture's money does.
  lock: lockTheFarm,
  // No `venturesOf`, on purpose. A Sale put right after a Settlement is the late news itself — refusing
  // it would leave what a buyer really paid nowhere to land — and what it changes is shown as a
  // Settlement Adjustment rather than moving the frozen figures.
  missing: "No such sale",
  load: loadSale,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    farmAccount: await farmAccountShownOf(tx, row.farmId, "sale", row.id),
    priceMoney: row.priceMoney,
    buyer: row.buyer.name,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "sale", row.id),
    paidNowMoney: paidAtTheGate(row.priceMoney, row.receivableMoney),
    promisedBy: row.promisedBy,
    brokerMoney: row.brokerMoney,
    weightKg: Number(row.weightKg),
    heldBy: await handOfTheRecord(tx, row.farmId, "sale", row.id),
    soldAt: row.soldAt,
    voided: false,
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readSale(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    if (to.voided) {
      await voidTheSale(tx, row, context, now);
      return;
    }
    if (to.soldAt) {
      await moveTheDay(tx, row, to.soldAt, now);
    }
    // A Venture's cash already deposited: the account holds what the slip said, and a new price would have it claim
    // money the bank never got. Refused, as the void is (the Owner, 2026-10-07).
    if (to.priceMoney !== undefined) {
      await assertNotDeposited(tx, row.id);
    }
    const { receivable, receivableMoved, buyerId } = await owedAfter(
      tx,
      row,
      to,
      now
    );
    const putRight = {
      ...(to.priceMoney === undefined ? {} : { priceMoney: to.priceMoney }),
      ...(to.brokerMoney === undefined ? {} : { brokerMoney: to.brokerMoney }),
      ...(to.weightKg === undefined
        ? {}
        : { weightKg: to.weightKg.toFixed(2) }),
      ...(receivableMoved ? receivable : {}),
      ...(to.buyer === undefined ? {} : { counterpartyId: buyerId }),
    };
    // Nothing of the record itself may have changed: a Correction may name only how it was paid
    // for, and an update with no values to set is a database error rather than a no-op.
    if (somethingChanged(putRight)) {
      await tx.update(sale).set(putRight).where(eq(sale.id, row.id));
    }
    await bookSaleMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount ? accountSaid(["sale"], to.farmAccount) : undefined
      ),
      row.id,
      to.paymentMethod,
      await assertTheHand(
        tx,
        row.farmId,
        { id: context.actor.id, roles: context.roles },
        to.heldBy
      )
    );
    // A price, a broker's fee, her weight or her day put right may take her under her cost or the market — a later day
    // has more of her keep in her cost, and another last weighing before it; told once about the Sale, as when it was
    // made.
    const worthMoved =
      to.soldAt !== undefined ||
      to.priceMoney !== undefined ||
      to.brokerMoney !== undefined ||
      to.weightKg !== undefined;
    if (worthMoved) {
      await tellIfSoldUnderCost(tx, row.farmId, row.id, now);
      await tellIfShrankTooMuch(tx, row.farmId, row.id, now);
    }
  },
};
