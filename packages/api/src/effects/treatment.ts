import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { treatment } from "@OpenFarm/db/schema/health";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import { recomputeWithdrawal } from "../health-store";
import { lotOfTheLatestDose } from "../medicine-stock";
import { tell } from "../notice";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { asPublished, writtenNote } from "./evidence";

type TreatmentFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "animalId"
  | "evidence"
  | "skipped"
  | "completionId"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/** What a Step records when it gives a dose, or takes one back. */
interface DoseGiven {
  completionId: string | null;
  givenBy: string | null;
  givenAt: Date | null;
}

/**
 * Which of the two shapes of dose this Step is recording, decided once.
 *
 * A **prescribed** dose is one the course already owed: its row was written when the Vet wrote
 * the Prescription, and the work is about the one animal it names. A **campaign** dose is one
 * this Version gives every animal in the Pen, and nothing was owed until the Pen was walked.
 */
const doseShape = (input: TreatmentFacts) => {
  const { effect } = input.step;
  const productId = effect?.kind === "treatment" ? effect.productId : undefined;
  if (!productId) {
    return { campaign: false as const, animalId: input.instance.animalId };
  }
  // A campaign's Step is done animal by animal (the published Version says so), so it always names one.
  return {
    campaign: true as const,
    productId,
    animalId: asPublished(input.animalId, "the animal it doses"),
  };
};

/**
 * A vaccine dose has to be traceable to the vial it came from: from her own Lot Number, written at her dose, or
 * from the Campaign's, asked once for the Pen. With neither, the dose is refused rather than recorded as a
 * vaccination nobody can trace.
 */
const assertCampaignHasLotNumber = async (
  tx: Tx,
  instanceId: string,
  productName: string
): Promise<void> => {
  const recorded = await tx.query.campaignLotNumber.findFirst({
    where: { instanceId },
    columns: { id: true },
  });
  if (!recorded) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${productName} is a vaccine: write the Campaign's Lot Number first, or this dose's own`,
      data: { refusal: "lot_number_missing" },
    });
  }
};

/**
 * The dose a campaign gives her now. Nothing was owed beforehand, so the row is written by the
 * Step that gives it — and written again over itself if two phones send the same dose at once,
 * which the unique index on the work and the animal is there to catch.
 */
const recordCampaignDose = async (
  tx: Tx,
  input: TreatmentFacts,
  {
    productId,
    animalId,
    given,
  }: { productId: string; animalId: string; given: DoseGiven }
) => {
  // What the Version named may have been retired from the Drug List since it was published,
  // and a Version never changes (ADR 0001). Retired is fine — the farm may still have stock,
  // and its days are still written down — but a product the farm cannot say the withdrawal of
  // must not go into an animal.
  const product = await tx.query.drugProduct.findFirst({
    where: { id: productId, farmId: input.instance.farmId },
    columns: {
      nameBn: true,
      milkWithdrawalDays: true,
      meatWithdrawalDays: true,
      vaccine: true,
    },
  });
  // Only a dose being given needs its days: a Correction back to a skip takes nothing into her.
  if (!product || (product.milkWithdrawalDays === null && !input.skipped)) {
    throw new ORPCError("BAD_REQUEST", {
      message: product
        ? `${product.nameBn} has no withdrawal days written down, so it cannot be given`
        : "That product is no longer on the farm's drug list",
      data: { refusal: "no_withdrawal_days" },
    });
  }
  // A note at a vaccine's dose is her own Lot Number; at any other product's it is only a note.
  const lotNumber = product.vaccine ? writtenNote(input) : null;
  if (product.vaccine && !input.skipped && lotNumber === null) {
    await assertCampaignHasLotNumber(tx, input.instance.id, product.nameBn);
  }
  const id = uuidv7(input.now);
  await tx
    .insert(treatment)
    .values({
      id,
      farmId: input.instance.farmId,
      prescriptionId: null,
      productId,
      animalId,
      instanceId: input.instance.id,
      number: 1,
      dueAt: input.instance.dueAt,
      createdAt: input.now,
      lotNumber,
      ...given,
    })
    .onConflictDoUpdate({
      target: [treatment.instanceId, treatment.animalId],
      set: { ...given, lotNumber },
    });
  return { id, number: 1, prescriptionId: null, animalId };
};

/** How many doses the course this one belongs to calls for — one, for a campaign. */
const dosesInTheCourse = async (
  tx: Tx,
  prescriptionId: string | null
): Promise<number> => {
  if (!prescriptionId) {
    return 1;
  }
  const course = await tx.query.prescription.findFirst({
    where: { id: prescriptionId },
    columns: { times: true, days: true },
  });
  return course ? course.times.length * course.days : 1;
};

/**
 * Says so when a dose just given came out of a Lot already past its day — warned of, not refused: an animal that
 * needed treating was treated, and the Vet, who answers for what went into her, and the Manager, who keeps the box
 * it came out of, hear of it at once. Keyed on the dose, so a phone sending it twice tells nobody twice.
 */
const tellIfItsLotHadExpired = async (
  tx: Tx,
  input: TreatmentFacts,
  doseId: string
) => {
  const dose = await tx.query.treatment.findFirst({
    where: { id: doseId },
    columns: { productId: true, givenAt: true },
    with: {
      product: { columns: { nameBn: true } },
      animal: { columns: { tagNumber: true } },
    },
  });
  if (!dose?.givenAt) {
    return;
  }
  const lot = await lotOfTheLatestDose(
    tx,
    input.instance.farmId,
    dose.productId
  );
  // The farm's own days, which sort as text. A Lot may still be used on its last day.
  const givenOn = farmDayOf(dose.givenAt);
  const pastItsDay = lot?.expiresOn ? lot.expiresOn < givenOn : false;
  if (!(lot?.expiresOn && pastItsDay)) {
    return;
  }
  await tell(
    tx,
    input.instance.farmId,
    {
      kind: "expired_dose_given",
      about: { id: doseId },
      facts: {
        tag: dose.animal?.tagNumber ?? "",
        name: dose.product.nameBn,
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn,
      },
    },
    input.now
  );
};

/**
 * Records that a dose was actually given — or, when the Step was skipped, that it was not
 * after all — and works her Withdrawals out afresh from everything she has had.
 *
 * The row is keyed on the work and the animal, so a phone sending the same dose twice records
 * it once, and a Correction back to a skip takes it off her again.
 */
const giveTheDose = async (
  tx: Tx,
  input: TreatmentFacts
): Promise<EffectResult> => {
  const shape = doseShape(input);
  const owed = await tx.query.treatment.findFirst({
    where: {
      instanceId: input.instance.id,
      ...(shape.animalId ? { animalId: shape.animalId } : {}),
    },
    columns: { id: true, number: true, prescriptionId: true, animalId: true },
  });
  if (!(owed || shape.campaign)) {
    // The Treatment SOP was raised by something other than a Prescription — a schedule
    // somebody added to it, say. There is no dose to give, and saying so is better than
    // writing a Treatment that belongs to no course.
    throw new ORPCError("BAD_REQUEST", {
      message: "This work is not a dose of any prescription",
    });
  }
  const given: DoseGiven = input.skipped
    ? { completionId: null, givenBy: null, givenAt: null }
    : {
        completionId: input.completionId,
        givenBy: input.recordedBy,
        givenAt: input.recordedAt,
      };

  let dose = owed;
  if (shape.campaign) {
    // Written over itself on a Correction, so a lot put right at her dose lands with it.
    dose = await recordCampaignDose(tx, input, {
      productId: shape.productId,
      animalId: shape.animalId,
      given,
    });
  } else if (owed) {
    await tx.update(treatment).set(given).where(eq(treatment.id, owed.id));
  }
  // From the doses she has actually had, every time — a dose corrected back to a skip has to
  // shorten the hold again, and the farm's milk gate reads the answer.
  const { milkUntil } = await recomputeWithdrawal(
    tx,
    input.instance.farmId,
    dose?.animalId ?? shape.animalId ?? ""
  );
  if (dose && !input.skipped) {
    await tellIfItsLotHadExpired(tx, input, dose.id);
  }
  return {
    kind: "treatment",
    number: dose?.number ?? 1,
    of: await dosesInTheCourse(tx, dose?.prescriptionId ?? null),
    given: !input.skipped,
    milkWithdrawalUntil: milkUntil,
  };
};

/** A Step that gives a dose — of a Prescription's course, or of a Campaign. May be skipped: "the bottle was empty". */
export const treatmentEffect: EffectKind<TreatmentFacts> = {
  kind: "treatment",
  apply: giveTheDose,
};
