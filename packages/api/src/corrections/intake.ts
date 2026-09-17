import { eq } from "@OpenFarm/db/operators";
import { intake } from "@OpenFarm/db/schema/fattening";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import {
  assertTripIsOurs,
  bookIntakeMoney,
  hasilInput,
  purchasePriceInput,
  readIntake,
  sellerInput,
} from "../intake-store";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const loadIntake = (tx: Tx, farmId: string, id: string) =>
  tx.query.intake.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      animalId: true,
      purchasePriceBdt: true,
      hasilBdt: true,
      buyingTripId: true,
      recordedBy: true,
      createdAt: true,
    },
    with: { seller: { columns: { name: true } } },
  });

/**
 * What an Intake's Correction may change: what the farm paid, the haat's toll on her, the outing she came
 * home on, who sold the animal, and how he was paid.
 */
export const intakeCorrectionInput = correctionInput({
  purchasePriceBdt: changeOf(purchasePriceInput, z.number()),
  hasilBdt: changeOf(hasilInput, z.number()),
  buyingTrip: changeOf(z.string().nullable(), z.string().nullable()),
  seller: changeOf(sellerInput, z.string().nullable()),
  paymentMethod: paymentMethodChange,
});

/**
 * An Intake put right — and with it the Money Event, rather than a second one. Filed under the Animal it made, as the
 * Intake itself was.
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
  supersedes: false,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    purchasePriceBdt: Number(row.purchasePriceBdt),
    hasilBdt: Number(row.hasilBdt),
    buyingTrip: row.buyingTripId,
    seller: row.seller?.name ?? null,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "intake", row.id),
  }),
  shownAs: { seller: (to) => to.name },
  trail: (tx, row) => readIntake(tx, row.animalId),
  apply: async (tx, row, to, { context, now }) => {
    await assertTripIsOurs(tx, row.farmId, to.buyingTrip ?? undefined);
    await tx
      .update(intake)
      .set({
        ...(to.purchasePriceBdt === undefined
          ? {}
          : { purchasePriceBdt: to.purchasePriceBdt.toFixed(2) }),
        ...(to.hasilBdt === undefined
          ? {}
          : { hasilBdt: to.hasilBdt.toFixed(2) }),
        ...(to.buyingTrip === undefined ? {} : { buyingTripId: to.buyingTrip }),
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
