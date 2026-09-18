import { eq } from "@OpenFarm/db/operators";
import { buyingTrip } from "@OpenFarm/db/schema/trip";
import { z } from "zod";

import type { Tx } from "../audit";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import { bookTripMoney, readTrip, tripCostInput } from "../trip-store";
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
      brokerBdt: true,
      transportBdt: true,
      keepBdt: true,
      recordedBy: true,
      createdAt: true,
    },
  });

/** What an outing's Correction may change: where it went, what each part of it cost, and how it was paid. */
export const buyingTripCorrectionInput = correctionInput({
  wentTo: changeOf(z.string().trim().min(1).max(120), z.string()),
  brokerBdt: changeOf(tripCostInput, z.number()),
  transportBdt: changeOf(tripCostInput, z.number()),
  keepBdt: changeOf(tripCostInput, z.number()),
  paymentMethod: paymentMethodChange,
});

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
  ventureOf: async (tx, row) => {
    const float = await tx.query.ventureMovement.findFirst({
      where: { farmId: row.farmId, buyingTripId: row.id, kind: "float_out" },
      columns: { ventureId: true },
    });
    return float?.ventureId ?? null;
  },
  missing: "No such outing",
  load: loadTrip,
  entityIdOf: (row) => row.id,
  supersedes: false,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    wentTo: row.wentTo,
    brokerBdt: Number(row.brokerBdt),
    transportBdt: Number(row.transportBdt),
    keepBdt: Number(row.keepBdt),
    paymentMethod: await paymentMethodOf(tx, row.farmId, "buying_trip", row.id),
  }),
  trail: (tx, row) => readTrip(tx, row.farmId, row.id),
  apply: async (tx, row, to, { context, now }) => {
    await assertTripIsOpen(tx, row.farmId, row.id);
    const putRight = {
      ...(to.wentTo === undefined ? {} : { wentTo: to.wentTo }),
      ...(to.brokerBdt === undefined
        ? {}
        : { brokerBdt: to.brokerBdt.toFixed(2) }),
      ...(to.transportBdt === undefined
        ? {}
        : { transportBdt: to.transportBdt.toFixed(2) }),
      ...(to.keepBdt === undefined ? {} : { keepBdt: to.keepBdt.toFixed(2) }),
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
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
  },
};
