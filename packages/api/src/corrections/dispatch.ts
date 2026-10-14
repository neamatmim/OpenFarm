import { eq } from "@OpenFarm/db/operators";
import { dispatch } from "@OpenFarm/db/schema/milk";
import { receivablePutRight, farmDayOf, paidAtTheGate } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { clearDebtNoticesOf, clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import { assertNoStatementCovers } from "../buyer-statement-store";
import type { ChangeBy } from "../closed-month-store";
import { changeByOf } from "../closed-month-store";
import {
  assertNothingPaidToFollow,
  assertNotLater,
  bookDispatchMoney,
  buyerInput,
  buyerOnTheDay,
  dispatchFields,
  isPriceToFollow,
  readDispatch,
  twoPlaces,
  worthAsItStands,
  worthOfDispatch,
} from "../dispatch-store";
import { farmAccountChange, paymentMethodChange } from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  farmAccountShownOf,
  forgetTheMoneyOf,
  paymentMethodOf,
} from "../money-store";
import {
  answerForCredit,
  assertNothingStandsAgainst,
  creditOf,
  assertOwedCoversPaid,
  assertOwedCoversWrittenOff,
  receivableOrRefuse,
  paidNowInput,
  promisedByInput,
} from "../receivable-store";
import { refuse } from "../refuse";
import type { CorrectionKind, Corrector, NewValues } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadDispatch = (tx: Tx, farmId: string, id: string) =>
  tx.query.dispatch.findFirst({ where: { id, farmId } });

/** A figure the record keeps as text, as a screen shows it. */
const figureOf = (value: string | null) =>
  value === null ? null : Number(value);

/**
 * What a Dispatch's Correction may change: the liters, the time, the buyer, the delivery note, the price, the fat or SNF, the
 * note, how it was paid, what the buyer paid there and then, and the day he promised to pay the rest by. A delivery note, a
 * note, a fat, an SNF or a promise set to nothing is cleared: a figure written against the wrong lorry is put right by
 * taking it away.
 */
export const dispatchCorrectionInput = correctionInput({
  dispatchedAt: changeOf(dispatchFields.dispatchedAt, z.coerce.date()),
  liters: changeOf(dispatchFields.liters, z.number()),
  buyer: changeOf(buyerInput, z.string()),
  deliveryNote: changeOf(
    dispatchFields.deliveryNote.nullable(),
    z.string().nullable()
  ),
  /** A price gives milk sent with its price to follow one, all of it owed; changed to nothing (null), a price guessed at
   *  the gate is taken off and the milk goes back to its price to follow — refused while anything stands paid at the
   *  gate. */
  pricePerLiterMoney: changeOf(
    dispatchFields.pricePerLiterMoney.nullable(),
    z.number().nullable()
  ),
  fatPercent: changeOf(
    dispatchFields.fatPercent.nullable(),
    z.number().nullable()
  ),
  snfPercent: changeOf(
    dispatchFields.snfPercent.nullable(),
    z.number().nullable()
  ),
  note: changeOf(dispatchFields.note.nullable(), z.string().nullable()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account mobile money or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
  paidNowMoney: changeOf(paidNowInput, z.number()),
  promisedBy: changeOf(promisedByInput.nullable(), z.string().nullable()),
  /** Entered twice, or the lorry never came: taken off the books with its money and what the buyer was said to owe for
   *  it, by whoever may correct it in their window, the Owner at any time (the Owner, 2026-10-07) — refused while he
   *  has paid against it, or it was written off. */
  voided: changeOf(z.literal(true), z.boolean()),
});

/** A Dispatch taken back with its money. A buyer who paid against it, or a debt written off on it, stands on it: those
 *  are put right first. */
const voidTheDispatch = async (
  tx: Tx,
  row: { id: string; farmId: string; buyerId: string },
  by: ChangeBy
) => {
  const { now } = by;
  await assertNothingStandsAgainst(tx, row.farmId, {
    id: row.id,
    counterpartyId: row.buyerId,
  }).catch(() => {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "He has paid on it, or some was written off: put those right first",
      data: { refusal: "paid_on_it" },
    });
  });
  await forgetTheMoneyOf(tx, by, "dispatch", row.id);
  await tx.delete(dispatch).where(eq(dispatch.id, row.id));
  await clearNoticesAbout(tx, row.farmId, [row.id], now);
  await clearDebtNoticesOf(tx, row.farmId, row.id, now);
};

type DispatchChanges = z.infer<typeof dispatchCorrectionInput>["changes"];

/** Milk whose price is to follow, as a Correction leaves it: owing nothing yet, and refused where anything was paid
 *  at the gate — that money was a price after all. */
const priceToFollowStill = (paidMoney: number) => {
  assertNothingPaidToFollow(paidMoney);
  return { receivableMoney: 0, promisedBy: null };
};

/**
 * What of a Dispatch its Buyer Statement holds once it has priced it: when it left, its liters, its buyer, its price and
 * its money. Put right by the Owner voiding the statement first; its notes and the collector's figures stay the
 * Manager's to put right.
 */
const STATEMENT_HOLDS = [
  "dispatchedAt",
  "liters",
  "buyer",
  "pricePerLiterMoney",
  "paymentMethod",
  "farmAccount",
  "paidNowMoney",
  "promisedBy",
  "voided",
] as const satisfies readonly (keyof NonNullable<DispatchChanges>)[];

/** Refused where a Correction would change what a Buyer Statement priced. */
const assertNotHeldByAStatement = (
  row: { buyerStatementId: string | null },
  to: NewValues<DispatchChanges>
) => {
  if (
    row.buyerStatementId !== null &&
    STATEMENT_HOLDS.some((key) => to[key] !== undefined)
  ) {
    throw refuse(
      "priced_by_statement",
      "Its buyer's statement priced it: the owner voids the statement first"
    );
  }
};
type DispatchRow = NonNullable<Awaited<ReturnType<typeof loadDispatch>>>;

/**
 * Its price as the Correction leaves it, and what the buyer owes on it then. What he paid stands unless the Correction
 * says otherwise: liters or a price mistyped is not cash handed back. Milk whose price was to follow was paid nothing,
 * so priced now it is all owed unless he paid at the gate after all — never "paid in full" at a price it never had.
 */
const receivableAfter = (row: DispatchRow, to: NewValues<DispatchChanges>) => {
  const price =
    to.pricePerLiterMoney === undefined
      ? row.pricePerLiterMoney
      : to.pricePerLiterMoney;
  // Priced by its Buyer Statement, it owes what the statement said: only its notes are put right here.
  if (row.buyerStatementId !== null && to.pricePerLiterMoney === undefined) {
    return {
      price,
      receivable: {
        receivableMoney: row.receivableMoney,
        promisedBy: row.promisedBy,
      },
    };
  }
  const worthBefore = worthAsItStands(row) ?? 0;
  if (price === null) {
    return {
      price,
      receivable: priceToFollowStill(
        to.paidNowMoney ?? paidAtTheGate(worthBefore, row.receivableMoney)
      ),
    };
  }
  return {
    price,
    receivable: receivableOrRefuse(
      receivablePutRight({
        before: {
          worthMoney: worthBefore,
          receivableMoney: row.receivableMoney,
          promisedBy: row.promisedBy,
        },
        worthMoney: worthOfDispatch({
          liters: to.liters ?? row.liters,
          pricePerLiterMoney: price,
        }),
        paidNowMoney: to.paidNowMoney ?? (isPriceToFollow(row) ? 0 : undefined),
        promisedBy: to.promisedBy,
        leftOn: farmDayOf(to.dispatchedAt ?? row.dispatchedAt),
        promiseRequired: false,
      })
    ),
  };
};

/** Milk left, or now sent, with its price to follow is not put into days its buyer's statement has already priced. */
const assertToFollowStaysOut = async (
  tx: Tx,
  row: DispatchRow,
  to: NewValues<DispatchChanges>,
  {
    price,
    newBuyer,
  }: {
    price: string | number | null;
    newBuyer: { buyerId: string } | undefined;
  }
) => {
  const buyerId = newBuyer?.buyerId ?? row.buyerId;
  const moved =
    row.pricePerLiterMoney !== null ||
    to.dispatchedAt !== undefined ||
    buyerId !== row.buyerId;
  if (price === null && moved) {
    await assertNoStatementCovers(
      tx,
      row.farmId,
      buyerId,
      to.dispatchedAt ?? row.dispatchedAt
    );
  }
};

/** The Dispatch's own columns a Correction puts right, each only where it says so. */
const columnsPutRight = (to: NewValues<DispatchChanges>) => ({
  ...(to.dispatchedAt === undefined ? {} : { dispatchedAt: to.dispatchedAt }),
  ...(to.liters === undefined ? {} : { liters: to.liters.toFixed(2) }),
  ...(to.deliveryNote === undefined ? {} : { deliveryNote: to.deliveryNote }),
  ...(to.pricePerLiterMoney === undefined
    ? {}
    : { pricePerLiterMoney: twoPlaces(to.pricePerLiterMoney) }),
  ...(to.fatPercent === undefined
    ? {}
    : { fatPercent: twoPlaces(to.fatPercent) }),
  ...(to.snfPercent === undefined
    ? {}
    : { snfPercent: twoPlaces(to.snfPercent) }),
  ...(to.note === undefined ? {} : { note: to.note }),
});

/** A Dispatch put right — its figures, its buyer, what he owes — and with it the Money Event. */
const putTheDispatchRight = async (
  tx: Tx,
  row: DispatchRow,
  to: NewValues<DispatchChanges>,
  { context, now }: { context: Corrector; now: Date }
) => {
  if (to.dispatchedAt !== undefined) {
    assertNotLater(to.dispatchedAt, now);
  }
  const { price, receivable } = receivableAfter(row, to);
  const receivableMoved =
    receivable.receivableMoney !== row.receivableMoney ||
    receivable.promisedBy !== row.promisedBy;
  const item = { id: row.id, counterpartyId: row.buyerId };
  if (receivable.receivableMoney < row.receivableMoney) {
    await assertOwedCoversWrittenOff(
      tx,
      "dispatch",
      row.id,
      receivable.receivableMoney
    );
    await assertOwedCoversPaid(
      tx,
      row.farmId,
      item,
      receivable.receivableMoney
    );
  }
  const newBuyer =
    to.buyer === undefined
      ? undefined
      : await buyerOnTheDay(tx, row.farmId, to.buyer, now);
  if (newBuyer && newBuyer.buyerId !== row.buyerId) {
    await assertNothingStandsAgainst(tx, row.farmId, item);
  }
  await assertToFollowStaysOut(tx, row, to, { price, newBuyer });
  const putRight = {
    ...(receivableMoved ? receivable : {}),
    ...columnsPutRight(to),
    ...newBuyer,
  };
  // Nothing of the record itself may have changed: a Correction may name only how it was paid
  // for, and an update with no values to set is a database error rather than a no-op.
  if (somethingChanged(putRight)) {
    await tx.update(dispatch).set(putRight).where(eq(dispatch.id, row.id));
  }
  await bookDispatchMoney(
    tx,
    bookingOf(
      context,
      context.roleUsed,
      now,
      to.farmAccount ? accountSaid(["dispatch"], to.farmAccount) : undefined
    ),
    row.id,
    to.paymentMethod
  );
};

/** A Dispatch put right — and with it the Money Event, rather than a second one. */
export const dispatchCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadDispatch>>>,
  z.infer<typeof dispatchCorrectionInput>["changes"]
> = {
  entity: "dispatch",
  table: dispatch,
  money: true,
  roles: ["owner", "manager"],
  missing: "No such dispatch",
  load: loadDispatch,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    farmAccount: await farmAccountShownOf(tx, row.farmId, "dispatch", row.id),
    dispatchedAt: row.dispatchedAt,
    liters: Number(row.liters),
    buyer: row.buyerName,
    deliveryNote: row.deliveryNote,
    pricePerLiterMoney: figureOf(row.pricePerLiterMoney),
    fatPercent: figureOf(row.fatPercent),
    snfPercent: figureOf(row.snfPercent),
    note: row.note,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "dispatch", row.id),
    paidNowMoney: paidAtTheGate(worthAsItStands(row) ?? 0, row.receivableMoney),
    promisedBy: row.promisedBy,
    voided: false,
  }),
  shownAs: { buyer: (to) => to.name },
  trail: (tx, row) => readDispatch(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    assertNotHeldByAStatement(row, to);
    const by = changeByOf(context, now);
    const owedBefore = await creditOf(tx, row.farmId, "dispatch", row.id);
    await (to.voided
      ? voidTheDispatch(tx, row, by)
      : putTheDispatchRight(tx, row, to, { context, now }));
    // What he was left owing is the month's too, priced now or taken away: in a closed month, the Owner's alone.
    await answerForCredit(tx, by, "dispatch", row.id, owedBefore);
  },
};
