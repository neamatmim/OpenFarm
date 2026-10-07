import { eq } from "@OpenFarm/db/operators";
import { intake } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import { EXIT_STATES, farmDayOf, weighedShort } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { targetWindowInput } from "../farm-clock";
import {
  assertAVentureMayOwnHer,
  assertSheBelongsWithTheFloat,
  assertTripIsOurs,
  assertVentureIsBuying,
  bookBoughtByBank,
  bookIntakeMoney,
  boughtByBankReference,
  marketTollInput,
  ownerOf,
  purchasePriceInput,
  readIntake,
  sellerInput,
} from "../intake-store";
import { farmAccountChange, paymentMethodChange } from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  farmAccountShownOf,
  paymentMethodOf,
} from "../money-store";
import { bookSaleMoney } from "../sale-store";
import {
  assertTripIsOpen,
  lockTheFarm,
  ventureWindowOf,
} from "../venture-store";
import type { CorrectionKind, NewValues } from "./correction";
import {
  changeOf,
  correctionInput,
  herVenturesAround,
  somethingChanged,
} from "./correction";
import { voidTheAnimal } from "./registration";

const loadIntake = (tx: Tx, farmId: string, id: string) =>
  tx.query.intake.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      farmId: true,
      animalId: true,
      purchasePriceMoney: true,
      marketTollMoney: true,
      buyingTripId: true,
      arrivedAt: true,
      weightKg: true,
      estimatedAgeMonths: true,
      targetWindowStart: true,
      targetWindowEnd: true,
      recordedBy: true,
      createdAt: true,
    },
    with: {
      seller: { columns: { name: true } },
      animal: { columns: { state: true } },
    },
  });

/**
 * The window she is sold in, as her page shows it today: her Venture's where she is one's, else what her Intake keeps.
 */
const windowShown = async (
  tx: Tx,
  row: { farmId: string; targetWindowStart: string; targetWindowEnd: string },
  owner: string | null,
  now: Date
) =>
  (await ventureWindowOf(
    tx,
    row.farmId,
    owner ?? undefined,
    farmDayOf(now)
  )) ?? {
    start: row.targetWindowStart,
    end: row.targetWindowEnd,
  };

/** Whose she is, once an Internal Sale has moved her, is the Sale's to say: her Intake set over it, her owner and her
 *  history of owners disagreed. */
const refuseAnOwnerSoldOnSince = async (tx: Tx, animalId: string) => {
  const soldOn = await tx.query.internalSale.findFirst({
    where: { animalId },
    columns: { id: true },
  });
  if (soldOn) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "She has been sold on since she was bought; her owner is the Internal Sale's to put right",
      data: { refusal: "sold_on_since" },
    });
  }
};

/**
 * The notice that the lorry came short, taken down when the weight she was bought at is put right to within the line
 * of her first weighing: the shortfall was a figure typed wrong at the gate.
 */
const clearIfNoLongerShort = async (
  tx: Tx,
  row: { id: string; farmId: string; animalId: string; arrivedAt: Date },
  arrivalKg: number,
  now: Date
) => {
  const [first, farm] = await Promise.all([
    tx.query.weighIn.findFirst({
      where: { animalId: row.animalId },
      orderBy: { weighedAt: "asc", id: "asc" },
      columns: { weightKg: true, weighedAt: true },
    }),
    tx.query.farm.findFirst({
      where: { id: row.farmId },
      columns: { arrivalShortPercent: true },
    }),
  ]);
  const short = first
    ? weighedShort(
        { arrivalKg, arrivedAt: row.arrivedAt },
        { weightKg: Number(first.weightKg), weighedAt: first.weighedAt },
        farm?.arrivalShortPercent ?? 5
      )
    : null;
  if (!short) {
    await clearNoticesAbout(tx, row.farmId, [row.id], now, [
      "arrival_weight_short",
    ]);
  }
};

/**
 * What an Intake's Correction may change: what the farm paid, the livestock market's toll on her, the outing she came
 * home on, who sold the animal, how he was paid, what she weighed off the lorry and how old she was judged, and — for
 * the Farm's own — the window she is sold in.
 */
export const intakeCorrectionInput = correctionInput({
  purchasePriceMoney: changeOf(purchasePriceInput, z.number()),
  marketTollMoney: changeOf(marketTollInput, z.number()),
  buyingTrip: changeOf(z.string().nullable(), z.string().nullable()),
  /** Whose animal she is. A slip at the livestock market is fixable here and nowhere else: once the window has
   *  closed, only an Internal Sale moves her between owners. */
  owner: changeOf(z.string().nullable(), z.string().nullable()),
  /** The window the Farm sells her in. A Venture's animal is sold in its Venture's, which only an Amendment moves; one
   *  a Correction makes the Farm's own is asked for one, because the Venture's was never the Farm's choice for her. */
  targetWindow: changeOf(
    targetWindowInput,
    z.object({ start: z.string(), end: z.string() })
  ),
  seller: changeOf(sellerInput, z.string().nullable()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account mobile money or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
  /** For a Venture's bull with no outing, paid from its account by bank: the transfer or cheque. Asked when a
   *  Correction makes her one, and put right like any other slip. */
  reference: changeOf(z.string().trim().min(1).max(120), z.string().nullable()),
  /** What she weighed off the lorry: the first point every gain of hers is measured from, so a figure typed wrong is put
   *  right here rather than carried into her Cost of Gain for good. */
  weightKg: changeOf(z.number().positive().max(2000), z.number()),
  estimatedAgeMonths: changeOf(z.number().int().min(0).max(360), z.number()),
  /** Written twice, or she never came: she and her Intake taken back while nothing else stands on her (`voidTheAnimal`),
   *  by whoever may correct it in their window, the Owner at any time (the Owner, 2026-10-07). */
  voided: changeOf(z.literal(true), z.boolean()),
});

/** Whose she will be after a Correction: the owner it names, else whose she was. */
const willBeOwnedByOf = (
  wasOwnedBy: string | null,
  named: string | null | undefined
): string | null => (named === undefined ? wasOwnedBy : named);

/**
 * That the window a Correction gives her is hers to be given. A Venture's animal is sold in the Venture's, which only an
 * Amendment moves. One made the Farm's own while she still stands is asked the window the Farm sells her in: the
 * Venture's was its Investors', and leaving her on it would be a choice nobody made. One already gone is sold in none.
 */
const assertTheWindowIsTheOwners = ({
  wasOwnedBy,
  willBeOwnedBy,
  standing,
  saysAWindow,
}: {
  wasOwnedBy: string | null;
  willBeOwnedBy: string | null;
  standing: boolean;
  saysAWindow: boolean;
}) => {
  if (saysAWindow && willBeOwnedBy !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A Venture's animal is sold in the Venture's Target Window; an Amendment moves it, not the Intake",
      data: { refusal: "window_is_the_ventures" },
    });
  }
  const madeTheFarms = wasOwnedBy !== null && willBeOwnedBy === null;
  if (madeTheFarms && standing && !saysAWindow) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "She is the Farm's own now: say the window the Farm sells her in",
      data: { refusal: "window_needed" },
    });
  }
};

/** The Intake's own columns as the Correction leaves them: nothing for what lives elsewhere, as her owner does. */
const putRightOf = async (
  tx: Tx,
  row: { farmId: string },
  to: NewValues<z.infer<typeof intakeCorrectionInput>["changes"]>,
  now: Date
) => ({
  ...(to.purchasePriceMoney === undefined
    ? {}
    : { purchasePriceMoney: to.purchasePriceMoney }),
  ...(to.marketTollMoney === undefined
    ? {}
    : { marketTollMoney: to.marketTollMoney }),
  ...(to.buyingTrip === undefined ? {} : { buyingTripId: to.buyingTrip }),
  ...(to.weightKg === undefined ? {} : { weightKg: to.weightKg.toFixed(2) }),
  ...(to.estimatedAgeMonths === undefined
    ? {}
    : { estimatedAgeMonths: to.estimatedAgeMonths }),
  ...(to.targetWindow === undefined
    ? {}
    : {
        targetWindowStart: to.targetWindow.start,
        targetWindowEnd: to.targetWindow.end,
      }),
  ...(to.seller === undefined
    ? {}
    : {
        counterpartyId: await counterpartyNamed(tx, row.farmId, to.seller, now),
      }),
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
  // Putting one of these right can move a Venture Movement, so it takes the Farm lock first, as
  // everything that counts a Venture's money does.
  lock: lockTheFarm,
  // An Intake carries her price, her Market toll and whose she is — every one of them a figure a Settlement
  // was worked out from.
  venturesOf: herVenturesAround((row) => row.createdAt),
  missing: "No such intake",
  load: loadIntake,
  entityIdOf: (row) => row.animalId,
  supersedes: false,
  entry: (row) => ({ enteredAt: row.createdAt, enteredBy: row.recordedBy }),
  shown: async (tx, row, { now }) => {
    const owner = await ownerOf(tx, row.animalId);
    return {
      purchasePriceMoney: row.purchasePriceMoney,
      marketTollMoney: row.marketTollMoney,
      buyingTrip: row.buyingTripId,
      owner,
      targetWindow: await windowShown(tx, row, owner, now),
      seller: row.seller?.name ?? null,
      paymentMethod: await paymentMethodOf(tx, row.farmId, "intake", row.id),
      farmAccount: await farmAccountShownOf(tx, row.farmId, "intake", row.id),
      reference: await boughtByBankReference(tx, row.farmId, row.id),
      weightKg: Number(row.weightKg),
      estimatedAgeMonths: row.estimatedAgeMonths,
      voided: false,
    };
  },
  shownAs: { seller: (to) => to.name },
  trail: (tx, row) => readIntake(tx, row.animalId),
  apply: async (tx, row, to, { context, now }) => {
    if (to.voided) {
      // A Float already counted was counted with her in it: the outing's sum would stop being true.
      await assertTripIsOpen(tx, row.farmId, row.buyingTripId);
      await voidTheAnimal(tx, row.farmId, row.animalId);
      return;
    }
    if (to.owner !== undefined) {
      await refuseAnOwnerSoldOnSince(tx, row.animalId);
    }
    // The outing she is on now, and the one she is being moved to: a Float already counted may neither
    // gain an animal nor lose one, because the sum it was counted against would stop being true.
    await assertTripIsOpen(tx, row.farmId, row.buyingTripId);
    // Not onto an outing that went after she came home, as on recording (`arrived_before_the_trip`).
    await assertTripIsOurs(
      tx,
      row.farmId,
      to.buyingTrip ?? undefined,
      row.arrivedAt
    );
    const wasOwnedBy = await ownerOf(tx, row.animalId);
    assertTheWindowIsTheOwners({
      wasOwnedBy,
      willBeOwnedBy: willBeOwnedByOf(wasOwnedBy, to.owner),
      standing: !(EXIT_STATES as readonly string[]).includes(row.animal.state),
      saysAWindow: to.targetWindow !== undefined,
    });
    // One purse to an outing, asked of the owner and the outing she will have after it, whichever of the two moves.
    if (to.owner !== undefined || to.buyingTrip !== undefined) {
      const willBeOn =
        to.buyingTrip === undefined ? row.buyingTripId : to.buyingTrip;
      await assertSheBelongsWithTheFloat(tx, row.farmId, {
        buyingTripId: willBeOn ?? undefined,
        ventureId: willBeOwnedByOf(wasOwnedBy, to.owner) ?? undefined,
      });
    }
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
    const putRight = await putRightOf(tx, row, to, now);
    // Nothing of the Intake itself may have changed: an owner lives on the Animal, and a Correction that
    // only moves her between owners leaves this row exactly as it was.
    if (somethingChanged(putRight)) {
      await tx.update(intake).set(putRight).where(eq(intake.id, row.id));
    }
    if (to.weightKg !== undefined) {
      await clearIfNoLongerShort(tx, row, to.weightKg, now);
    }
    const booking = bookingOf(
      context,
      context.roleUsed,
      now,
      to.farmAccount ? accountSaid(["intake"], to.farmAccount) : undefined
    );
    await bookIntakeMoney(tx, booking, row.id, to.paymentMethod);
    // Whether the Venture Account paid for her, decided from the Intake as it now stands.
    await bookBoughtByBank(tx, row.id, {
      reference: to.reference,
      mayWrite: context.roleUsed === "owner",
      withinTheCattleBudget: false,
      recordedBy: context.actor.id,
      now,
    });
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
