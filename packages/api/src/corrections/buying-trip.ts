import { eq } from "@OpenFarm/db/operators";
import { buyingTrip } from "@OpenFarm/db/schema/trip";
import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { farmAccountChange, paymentMethodChange } from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  farmAccountShownOf,
  paymentMethodOf,
} from "../money-store";
import {
  bookTripMoney,
  fundedBy,
  readTrip,
  tripCostInput,
} from "../trip-store";
import { assertTripIsOpen } from "../venture-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadTrip = (tx: Tx, farmId: string, id: string) =>
  tx.query.buyingTrip.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      wentTo: true,
      brokerMoney: true,
      transportMoney: true,
      keepMoney: true,
      wentOn: true,
      recordedBy: true,
      createdAt: true,
    },
  });

/** What an outing's Correction may change: where it went, the day it went, what each part of it cost, and how it was
 *  paid. */
export const buyingTripCorrectionInput = correctionInput({
  wentTo: changeOf(z.string().trim().min(1).max(120), z.string()),
  /** The day it really went: an outing written up the next morning without its day kept the day it was written. */
  wentOn: changeOf(z.coerce.date(), z.coerce.date()),
  brokerMoney: changeOf(tripCostInput, z.number()),
  transportMoney: changeOf(tripCostInput, z.number()),
  keepMoney: changeOf(tripCostInput, z.number()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account mobile money or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
});

/**
 * Refuses an outing's day moved to one that has not come, or past the day any animal it brought came home: she cannot
 * have come home before the lorry went (`arrived_before_the_trip`, as on recording).
 */
const assertTheDayHolds = async (
  tx: Tx,
  row: { id: string },
  wentOn: Date,
  now: Date
) => {
  if (wentOn > now) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A lorry cannot have gone on a day that has not come yet",
      data: { refusal: "went_in_the_future" },
    });
  }
  const broughtHome = await tx.query.intake.findMany({
    where: { buyingTripId: row.id },
    columns: { arrivedAt: true },
  });
  const wentFrom = startOfFarmDay(farmDayOf(wentOn));
  if (broughtHome.some((one) => one.arrivedAt < wentFrom)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "An animal cannot have come home before the outing that brought her went",
      data: { refusal: "arrived_before_the_trip" },
    });
  }
};

/**
 * An outing put right — and with it its Money Event, rather than a second one. Every Animal that came home
 * on it carries her share of the new figure at once: no share is stored, so nothing has to be re-charged.
 */
export const buyingTripCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadTrip>>>,
  z.infer<typeof buyingTripCorrectionInput>["changes"]
> = {
  entity: "buying_trip",
  table: buyingTrip,
  roles: ["owner", "manager"],
  // An outing's own costs are split across the Animals it brought in, so they are charges against
  // whichever Venture's Float paid for it.
  venturesOf: async (tx, row) => {
    const paying = await fundedBy(tx, row.farmId, row.id);
    return paying ? [paying] : [];
  },
  missing: "No such outing",
  load: loadTrip,
  entityIdOf: (row) => row.id,
  supersedes: false,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    farmAccount: await farmAccountShownOf(
      tx,
      row.farmId,
      "buying_trip",
      row.id
    ),
    wentTo: row.wentTo,
    wentOn: row.wentOn,
    brokerMoney: row.brokerMoney,
    transportMoney: row.transportMoney,
    keepMoney: row.keepMoney,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "buying_trip", row.id),
  }),
  trail: (tx, row) => readTrip(tx, row.farmId, row.id),
  apply: async (tx, row, to, { context, now }) => {
    await assertTripIsOpen(tx, row.farmId, row.id);
    if (to.wentOn) {
      await assertTheDayHolds(tx, row, to.wentOn, now);
    }
    const putRight = {
      ...(to.wentTo === undefined ? {} : { wentTo: to.wentTo }),
      ...(to.wentOn === undefined ? {} : { wentOn: to.wentOn }),
      ...(to.brokerMoney === undefined ? {} : { brokerMoney: to.brokerMoney }),
      ...(to.transportMoney === undefined
        ? {}
        : { transportMoney: to.transportMoney }),
      ...(to.keepMoney === undefined ? {} : { keepMoney: to.keepMoney }),
    };
    // Nothing of the record itself may have changed: a Correction may name only how it was paid
    // for, and an update with no values to set is a database error rather than a no-op.
    if (somethingChanged(putRight)) {
      await tx
        .update(buyingTrip)
        .set(putRight)
        .where(eq(buyingTrip.id, row.id));
    }
    await bookTripMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount
          ? accountSaid(["buying_trip"], to.farmAccount)
          : undefined
      ),
      row.id,
      to.paymentMethod
    );
  },
};
