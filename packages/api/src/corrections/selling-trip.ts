import { eq } from "@OpenFarm/db/operators";
import { sellingTrip } from "@OpenFarm/db/schema/trip";
import { z } from "zod";

import type { Tx } from "../audit";
import { theOwnersOf } from "../intake-store";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import {
  bookSellingTripMoney,
  readSellingTrip,
  tripCostInput,
} from "../trip-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

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
  // An outing's own costs are split across the Animals it carried, so they are charges against every
  // Venture that had one on the lorry — whether or not anybody bought her.
  venturesOf: async (tx, row) => {
    const carried = await tx.query.sellingTripAnimal.findMany({
      where: { sellingTripId: row.id },
      columns: { animalId: true },
    });
    const hers = await theOwnersOf(
      tx,
      carried.map((one) => one.animalId)
    );
    return [...new Set(hers.filter((one) => one !== null))];
  },
  missing: "No such outing",
  load: loadSellingTrip,
  entityIdOf: (row) => row.id,
  supersedes: false,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    wentTo: row.wentTo,
    transportBdt: row.transportBdt,
    keepBdt: row.keepBdt,
    paymentMethod: await paymentMethodOf(
      tx,
      row.farmId,
      "selling_trip",
      row.id
    ),
  }),
  trail: (tx, row) => readSellingTrip(tx, row.farmId, row.id),
  apply: async (tx, row, to, { context, now }) => {
    const putRight = {
      ...(to.wentTo === undefined ? {} : { wentTo: to.wentTo }),
      ...(to.transportBdt === undefined
        ? {}
        : { transportBdt: to.transportBdt }),
      ...(to.keepBdt === undefined ? {} : { keepBdt: to.keepBdt }),
    };
    // Nothing of the record itself may have changed: a Correction may name only how it was paid
    // for, and an update with no values to set is a database error rather than a no-op.
    if (somethingChanged(putRight)) {
      await tx
        .update(sellingTrip)
        .set(putRight)
        .where(eq(sellingTrip.id, row.id));
    }
    await bookSellingTripMoney(
      tx,
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
  },
};
