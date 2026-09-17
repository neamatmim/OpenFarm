import { eq } from "@OpenFarm/db/operators";
import { sellingTrip } from "@OpenFarm/db/schema/fattening";
import { z } from "zod";

import type { Tx } from "../audit";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import {
  bookSellingTripMoney,
  readSellingTrip,
  tripCostInput,
} from "../trip-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const loadSellingTrip = (tx: Tx, farmId: string, id: string) =>
  tx.query.sellingTrip.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      wentTo: true,
      transportBdt: true,
      keepBdt: true,
      recordedBy: true,
      createdAt: true,
    },
  });

/** What a selling outing's Correction may change: where it went, what the day cost, and how it was paid. */
export const sellingTripCorrectionInput = correctionInput({
  wentTo: changeOf(z.string().trim().min(1).max(120), z.string()),
  transportBdt: changeOf(tripCostInput, z.number()),
  keepBdt: changeOf(tripCostInput, z.number()),
  paymentMethod: paymentMethodChange,
});

/**
 * A selling outing put right — and with it its Money Event, rather than a second one. Every Animal taken on
 * it carries her share of the new figure at once: no share is stored, so nothing has to be re-charged.
 */
export const sellingTripCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadSellingTrip>>>,
  z.infer<typeof sellingTripCorrectionInput>["changes"]
> = {
  entity: "selling_trip",
  table: sellingTrip,
  roles: ["owner", "manager"],
  missing: "No such outing",
  load: loadSellingTrip,
  entityIdOf: (row) => row.id,
  supersedes: false,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    wentTo: row.wentTo,
    transportBdt: Number(row.transportBdt),
    keepBdt: Number(row.keepBdt),
    paymentMethod: await paymentMethodOf(
      tx,
      row.farmId,
      "selling_trip",
      row.id
    ),
  }),
  trail: (tx, row) => readSellingTrip(tx, row.farmId, row.id),
  apply: async (tx, row, to, { context, now }) => {
    await tx
      .update(sellingTrip)
      .set({
        ...(to.wentTo === undefined ? {} : { wentTo: to.wentTo }),
        ...(to.transportBdt === undefined
          ? {}
          : { transportBdt: to.transportBdt.toFixed(2) }),
        ...(to.keepBdt === undefined ? {} : { keepBdt: to.keepBdt.toFixed(2) }),
      })
      .where(eq(sellingTrip.id, row.id));
    await bookSellingTripMoney(
      tx,
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
  },
};
