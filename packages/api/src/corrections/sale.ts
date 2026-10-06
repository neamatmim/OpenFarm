import { eq, inArray } from "@OpenFarm/db/operators";
import { sale } from "@OpenFarm/db/schema/fattening";
import { moneyEvent, moneyReceipt } from "@OpenFarm/db/schema/money";
import { receivablePutRight, farmDayOf, paidAtTheGate } from "@OpenFarm/domain";
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
  assertOwedCoversWrittenOff,
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
import { lockTheFarm } from "../venture-store";
import type { CorrectionKind, Corrector } from "./correction";
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
      recordedBy: true,
      createdAt: true,
    },
    with: { buyer: { columns: { name: true } } },
  });

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
    (row.receivableMoney > 0
      ? await tx.query.receivablePayment.findFirst({
          where: { counterpartyId: row.counterpartyId },
          columns: { id: true },
        })
      : undefined);
  const venture = await tx.query.ventureMovement.findFirst({
    where: { saleId: row.id },
    columns: { ventureId: true },
    with: { venture: { columns: { state: true } } },
  });
  if (paidOrWrittenOff || venture?.venture?.state === "settled") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Money has moved on this Sale since; put it right instead",
      data: { refusal: "money_moved_since" },
    });
  }
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
      if (to.soldAt > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A Sale cannot be on a day that has not come yet",
          data: { refusal: "sold_in_the_future" },
        });
      }
      // Her leaving moves with it — not before she was here (herd-store) — and the money is booked on the day again.
      await correctHowSheLeft(
        tx,
        row.farmId,
        { id: row.animalId },
        {
          at: to.soldAt,
          now,
        }
      );
      await tx
        .update(sale)
        .set({ soldAt: to.soldAt })
        .where(eq(sale.id, row.id));
    }
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
        leftOn: farmDayOf(row.soldAt),
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
    }
    const putRight = {
      ...(to.priceMoney === undefined ? {} : { priceMoney: to.priceMoney }),
      ...(to.brokerMoney === undefined ? {} : { brokerMoney: to.brokerMoney }),
      ...(to.weightKg === undefined
        ? {}
        : { weightKg: to.weightKg.toFixed(2) }),
      ...(receivableMoved ? receivable : {}),
      ...(to.buyer === undefined
        ? {}
        : {
            counterpartyId: await counterpartyNamed(
              tx,
              row.farmId,
              to.buyer,
              now
            ),
          }),
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
    // A price, a broker's fee or her weight put right may take her under her cost or the market; told once about the
    // Sale, as when it was made.
    const worthMoved =
      to.priceMoney !== undefined ||
      to.brokerMoney !== undefined ||
      to.weightKg !== undefined;
    if (worthMoved) {
      await tellIfSoldUnderCost(tx, row.farmId, row.id, now);
      await tellIfShrankTooMuch(tx, row.farmId, row.id, now);
    }
  },
};
