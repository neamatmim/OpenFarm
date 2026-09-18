import { eq } from "@OpenFarm/db/operators";
import { intake } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import {
  assertAVentureMayOwnHer,
  assertTripIsOurs,
  assertVentureIsBuying,
  bookIntakeMoney,
  hasilInput,
  ownerOf,
  purchasePriceInput,
  readIntake,
  sellerInput,
} from "../intake-store";
import { paymentMethodChange } from "../money-inputs";
import { bookingOf, paymentMethodOf } from "../money-store";
import { bookSaleMoney } from "../sale-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

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
  /** Whose animal she is. A slip at the haat is fixable here and nowhere else: once the window has
   *  closed, only an Internal Sale moves her between owners. */
  owner: changeOf(z.string().nullable(), z.string().nullable()),
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
    owner: await ownerOf(tx, row.animalId),
    seller: row.seller?.name ?? null,
    paymentMethod: await paymentMethodOf(tx, row.farmId, "intake", row.id),
  }),
  shownAs: { seller: (to) => to.name },
  trail: (tx, row) => readIntake(tx, row.animalId),
  apply: async (tx, row, to, { context, now }) => {
    await assertTripIsOurs(tx, row.farmId, to.buyingTrip ?? undefined);
    if (to.owner !== undefined) {
      await assertVentureIsBuying(tx, row.farmId, to.owner ?? undefined, {
        correcting: true,
      });
      if (to.owner !== null) {
        await assertAVentureMayOwnHer(tx, row.animalId);
      }
      // On the Animal, where an owner lives: her Intake says who bought her, but it is she who belongs
      // to somebody. Written before the money is booked again, so what she cost follows her.
      await tx
        .update(animal)
        .set({ ownerVentureId: to.owner })
        .where(eq(animal.id, row.animalId));
    }
    const putRight = {
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
    };
    // Nothing of the Intake itself may have changed: an owner lives on the Animal, and a Correction that
    // only moves her between owners leaves this row exactly as it was.
    if (somethingChanged(putRight)) {
      await tx.update(intake).set(putRight).where(eq(intake.id, row.id));
    }
    const booking = bookingOf(context, context.roleUsed, now);
    await bookIntakeMoney(tx, booking, row.id, to.paymentMethod);
    if (to.owner !== undefined) {
      // She may already have been sold inside the window. What she fetched belongs where she did, so
      // her Sale's money moves purses with her — cost and proceeds in two purses would make both
      // Ventures' figures wrong.
      const sold = await tx.query.sale.findFirst({
        where: { animalId: row.animalId, farmId: row.farmId },
        columns: { id: true },
      });
      if (sold) {
        await bookSaleMoney(tx, booking, sold.id);
      }
    }
  },
};
