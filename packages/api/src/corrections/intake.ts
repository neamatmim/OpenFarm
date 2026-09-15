import { eq } from "@OpenFarm/db/operators";
import { intake } from "@OpenFarm/db/schema/fattening";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import {
  bookIntakeMoney,
  purchasePriceInput,
  readArrival,
  sellerInput,
} from "../intake-store";
import { bookingOf, paymentMethodOf } from "../money-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, paymentMethodChange } from "./correction";

const loadIntake = (tx: Tx, farmId: string, id: string) =>
  tx.query.intake.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      animalId: true,
      purchasePriceBdt: true,
      recordedBy: true,
      createdAt: true,
    },
    with: { seller: { columns: { name: true } } },
  });

/** What an Intake's Correction may change: what the farm paid, who sold the animal, and how he was paid. */
export const intakeCorrectionInput = correctionInput({
  purchasePriceBdt: changeOf(purchasePriceInput, z.number()),
  seller: changeOf(sellerInput, z.string().nullable()),
  paymentMethod: paymentMethodChange,
});

/**
 * An Intake put right — and with it the Money Event, rather than a second one. Filed under the Animal it made, as the
 * Intake itself was, so the Correction supersedes the event that recorded her arriving.
 */
export const intakeCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadIntake>>>,
  z.infer<typeof intakeCorrectionInput>["changes"]
> = {
  entity: "animal",
  table: intake,
  roles: ["owner", "manager"],
  missing: "No such intake",
  load: loadIntake,
  entityIdOf: (row) => row.animalId,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    purchasePriceBdt: Number(row.purchasePriceBdt),
    seller: row.seller?.name ?? null,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "intake", row.id),
  }),
  shownAs: { seller: (to) => to.name },
  trail: (tx, row) => readArrival(tx, row.animalId),
  apply: async (tx, row, to, { context, now }) => {
    await tx
      .update(intake)
      .set({
        ...(to.purchasePriceBdt === undefined
          ? {}
          : { purchasePriceBdt: to.purchasePriceBdt.toFixed(2) }),
        ...(to.seller === undefined
          ? {}
          : {
              counterpartyId: await counterpartyNamed(
                tx,
                row.farmId,
                to.seller,
                now
              ),
            }),
      })
      .where(eq(intake.id, row.id));
    await bookIntakeMoney(
      tx,
      bookingOf(context, context.roleUsed, now),
      row.id,
      to.paymentMethod
    );
  },
};
