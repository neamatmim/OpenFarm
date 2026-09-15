import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { weighIn } from "@OpenFarm/db/schema/fattening";
import {
  campaignLotNumber,
  dlsReport,
  treatment,
} from "@OpenFarm/db/schema/health";
import { observation } from "@OpenFarm/db/schema/observation";
import type {
  FeedingEntryLine,
  MilkDestination,
  PregnancyCheckResult,
  ServiceMethod,
  Step,
} from "@OpenFarm/domain";
import {
  HEAT,
  KG_DECIMALS,
  implausibleChange,
  roundKg,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx, Trail } from "./audit";
import type { PregnancyTimes } from "./breeding-store";
import type { CalvingRecorded } from "./calving-store";
import type { CalvingWorkFollowed } from "./calving-work";
import type { StandingAside } from "./effects/effect";
import { numberIn, writtenNote, choiceIn, penOf } from "./effects/evidence";
import { recomputeWithdrawal } from "./health-store";
import { callOffWorkRaisedBy } from "./herd-store";
import { heatKeyOf } from "./instances-store";
import {
  ensureSession,
  reReconcile,
  reconcileSession,
  removeMilkRecord,
  writeMilkRecord,
} from "./milk-store";
import type { RenewalEntry } from "./registration-store";
import { raiseNeedsReview } from "./review-store";
import type { StockAdjustment, StockCountLine } from "./stock-store";

/**
 * What a Step wrote into the farm's records beyond the Evidence itself — reported back so
 * the phone can show the person what the gate decided, and so the Audit Event's `after`
 * says what actually happened rather than what was asked for.
 */
export type EffectResult =
  | { kind: "milk_record"; destination: MilkDestination; forced: boolean }
  | {
      kind: "registration_renewal";
      expiresOn: Date;
      previousExpiresOn: Date | null;
      /** The Registration has moved on since this renewal, so the newer one is put right instead. */
      standsAside: StandingAside | null;
    }
  | {
      kind: "feeding";
      /** What the Pen was owed, and how far under it the session came. */
      shortfallPercent: number;
      flagged: boolean;
      /** The Pen is on no Ration now, so what was fed cannot be set against one. */
      standsAside: StandingAside | null;
    }
  | {
      kind: "observation";
      /** What was seen, as the Version's own choice value. */
      saw: string;
      /** True when this replaced one a Correction withdrew. */
      supersedes: boolean;
    }
  | {
      kind: "lot_number";
      /** The Lot Number the Campaign was given from. */
      lotNumber: string;
    }
  | {
      kind: "dls_report";
      /** What the office filed it under. Null when a Correction took the delivery back. */
      reference: string | null;
      /** False when a Correction took the delivery back: the report is owed again. */
      delivered: boolean;
    }
  | {
      kind: "treatment";
      /** Which dose of the course this was — 3 of 6 — so the phone can say where it got to. */
      number: number;
      of: number;
      /** False when the dose was skipped: what the course owes is still owed. */
      given: boolean;
      /** When her milk may go to the tank again. */
      milkWithdrawalUntil: Date | null;
    }
  | {
      kind: "move";
      fromPenId: string | null;
      toPenId: string;
      /** False when she was already standing there: the Step was done, no journey was made. */
      moved: boolean;
      /** She has been moved again since: the Effect left her where the farm last saw her. */
      standsAside: StandingAside | null;
    }
  | {
      kind: "bulk_total";
      sumBulkLitres: number;
      differenceLitres: number;
      differencePercent: number;
      flagged: boolean;
    }
  | {
      kind: "weigh_in";
      /** What the scale said, as the record now holds it. */
      weightKg: number;
      /** True when the farm doubted it and put it in front of the Manager. */
      flagged: boolean;
    }
  /** A service or a check — or, with nothing, one taken back — and the calving work that followed the
   *  date it changed. */
  | ({
      kind: "service";
      method: ServiceMethod | null;
      /** Taken back, but the Vet has checked it: the service stands, and the check is corrected first. */
      standsAside: StandingAside | null;
    } & CalvingWorkFollowed)
  | ({
      kind: "pregnancy_check";
      result: PregnancyCheckResult | null;
    } & CalvingWorkFollowed)
  | ({ kind: "calving"; standsAside: StandingAside | null } & Omit<
      CalvingRecorded,
      "actedOn"
    >)
  | {
      kind: "stock_count";
      /** The Feed Items whose count differed from what the store was thought to hold. */
      adjustments: StockAdjustment[];
    }
  | {
      kind: "dry_off";
      /** False when she was already Dry: the same Step again dries nobody twice. */
      dried: boolean;
      /** Corrected to a skip, but she cannot be put back in milk from here: what she was before,
       *  and since when, is the trail's to say and a person's to decide. */
      standsAside: StandingAside | null;
    }
  | null;

export interface EffectInput {
  step: Step;
  instance: {
    id: string;
    farmId: string;
    /** Null for work about the whole farm. */
    penId: string | null;
    /** The animal this work is about, for work raised about one — a dose of a Prescription is
     *  hers alone. Null for work about the whole Pen. */
    animalId: string | null;
    dueAt: Date;
    /** When the work was raised, which is the moment its Ration is read as of. */
    raisedAt: Date;
    /** What raised it, for work a happening raised — a Service reads which Heat it answered. */
    cause: string | null;
  };
  completionId: string;
  animalId: string | null;
  evidence: unknown[];
  destination: MilkDestination | undefined;
  skipped: boolean;
  tolerancePercent: number;
  /** How far under its Feeding Target a Pen may come before the farm says so. */
  feedTolerancePercent: number;
  /** The Audit Event this Completion is being written under, for an effect that has to put
   *  something in front of the Manager in the same transaction. */
  eventId: string;
  /** The Roles the person recording holds. Most effects do not ask — the Step's own gate is
   *  enough — but a Service is the Manager's alone whoever is standing at the Step. */
  roles: readonly RoleName[];
  /** The Role the Step is being recorded under, for a record an effect writes that names it. */
  roleUsed: RoleName | null;
  /** How long this farm's cows carry, and how long before calving its work falls — which Expected
   *  Calving, and the work that follows it, are worked out from. */
  pregnancyTimes: PregnancyTimes;
  /** What was actually put in front of the Pen, per Feed Item. */
  feeding: FeedingEntryLine[];
  /** What was counted of each Feed Item, for a Step that counts the store. */
  counts: StockCountLine[];
  /** The new expiry and the renewed certificate, for the Step that renews the Registration. */
  renewal?: RenewalEntry;
  /** How often this Playbook entry feeds — from the Version doing the feeding, so a farm with
   *  more than one feeding routine divides by the one that raised this work. */
  sessionsPerDay: number;
  recordedBy: string;
  recordedAt: Date;
  now: Date;
  /** The trail of the request recording it now — the person putting a Step right, not the one who first did it: work
   *  it calls off or raises again is written there. */
  trail: Trail;
}

/**
 * Records that the letter reached the Upazila Livestock Officer, and under what reference.
 *
 * The Step is completed when the letter is delivered, so the moment it was recorded is the
 * moment it went; the required note is the reference the office gave it back under. A report
 * that was sent and cannot be evidenced is a report that was not sent, which is why the
 * reference is the Step's evidence rather than something to fill in afterwards.
 */
const applyReportEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  const owed = await tx.query.dlsReport.findFirst({
    where: { instanceId: input.instance.id },
    columns: { id: true },
  });
  if (!owed) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This work is not the report of any diagnosis",
    });
  }
  // The reference is required evidence, so whether it was given at all is settled before the
  // effect runs — by the Version (publishing refuses a Step that lets it be blank) and by the
  // Completion (a required slot with nothing in it is not complete).
  const reference = writtenNote(input);
  await tx
    .update(dlsReport)
    .set(
      input.skipped
        ? {
            deliveredAt: null,
            reference: null,
            completionId: null,
            deliveredBy: null,
          }
        : {
            deliveredAt: input.recordedAt,
            reference,
            completionId: input.completionId,
            deliveredBy: input.recordedBy,
          }
    )
    .where(eq(dlsReport.id, owed.id));
  return {
    kind: "dls_report",
    reference,
    delivered: !input.skipped,
  };
};

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
const doseShape = (input: EffectInput) => {
  const { effect } = input.step;
  const productId = effect?.kind === "treatment" ? effect.productId : undefined;
  if (!productId) {
    return { campaign: false as const, animalId: input.instance.animalId };
  }
  // A campaign's Step is done animal by animal, so it always names one.
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "This step doses one animal, and it was not recorded against one",
    });
  }
  return { campaign: true as const, productId, animalId: input.animalId };
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
  input: EffectInput,
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
 * Records that a dose was actually given — or, when the Step was skipped, that it was not
 * after all — and works her Withdrawals out afresh from everything she has had.
 *
 * The row is keyed on the work and the animal, so a phone sending the same dose twice records
 * it once, and a Correction back to a skip takes it off her again.
 */
const applyTreatmentEffect = async (
  tx: Tx,
  input: EffectInput
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
    // Written over itself on a replay or a Correction, so a lot put right at her dose lands with it.
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
  return {
    kind: "treatment",
    number: dose?.number ?? 1,
    of: await dosesInTheCourse(tx, dose?.prescriptionId ?? null),
    given: !input.skipped,
    milkWithdrawalUntil: milkUntil,
  };
};

/**
 * The Lot Number a Campaign was given from, asked once for the Pen. Every vaccine dose of the Campaign without a
 * Lot Number of its own reads it from here, so a Correction to this Step puts all of them right at once.
 *
 * It is never taken back: a Step done once cannot be skipped, and its note is required, so a vaccination given
 * from this vial cannot be made untraceable after the fact.
 */
const applyLotNumberEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  const lotNumber = writtenNote(input);
  if (lotNumber === null) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "This step records the Lot Number off the vial, and none was written",
    });
  }
  const written = {
    lotNumber,
    completionId: input.completionId,
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt,
  };
  await tx
    .insert(campaignLotNumber)
    .values({
      id: uuidv7(input.now),
      farmId: input.instance.farmId,
      instanceId: input.instance.id,
      ...written,
    })
    .onConflictDoUpdate({ target: campaignLotNumber.instanceId, set: written });
  return { kind: "lot_number", lotNumber };
};

/**
 * A Heat the farm no longer believes in takes its AI work back with it.
 *
 * Withdrawing the Observation stops new work being raised on it — `recentHappenings` reads only
 * sightings that stand — but not work already raised, which would still send somebody to serve a
 * cow who was not in heat. If this sighting had begun her heat, its job closes; a later sighting
 * of the same heat that still stands will begin it instead, and raise afresh on the next pass.
 */
const unraiseIfHeat = async (
  tx: Tx,
  farmId: string,
  withdrawn: { id: string; saw: string },
  trail: Trail
) => {
  if (withdrawn.saw === HEAT) {
    await callOffWorkRaisedBy(tx, farmId, heatKeyOf(withdrawn.id), trail);
  }
};

/**
 * Records what somebody saw of one animal on the round — the farm's Observation, which starts
 * the health chain and which Breeding reads as a Heat when that is what was seen.
 *
 * Unlike the litres and the Moves, a Correction here never rewrites the row and never removes
 * it. It withdraws it and writes the new one beside it, pointing back: what somebody said they
 * saw is a fact about the round, and it stays true that they said it even after the farm
 * decides they were looking at the wrong cow.
 */
const applyObservationEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "This step records what was seen of an animal, and it was not recorded against one",
    });
  }
  const standing = await tx.query.observation.findFirst({
    where: { completionId: input.completionId, withdrawnAt: { isNull: true } },
    columns: { id: true, saw: true },
  });

  if (input.skipped) {
    if (standing) {
      await tx
        .update(observation)
        .set({ withdrawnAt: input.now })
        .where(eq(observation.id, standing.id));
      await unraiseIfHeat(tx, input.instance.farmId, standing, input.trail);
    }
    return null;
  }

  const chosen = choiceIn(
    input.step,
    input.evidence,
    "This step records what was seen, and nothing was chosen"
  );
  if (standing && standing.saw === chosen.value) {
    // The same entry again — a phone repeating itself, or a Correction that changed
    // something else about the Step. Nothing was seen twice.
    return { kind: "observation", saw: chosen.value, supersedes: false };
  }
  const id = uuidv7(input.now);
  if (standing) {
    await tx
      .update(observation)
      .set({ withdrawnAt: input.now, supersededById: id })
      .where(eq(observation.id, standing.id));
    await unraiseIfHeat(tx, input.instance.farmId, standing, input.trail);
  }
  await tx.insert(observation).values({
    id,
    farmId: input.instance.farmId,
    animalId: input.animalId,
    completionId: input.completionId,
    saw: chosen.value,
    sawLabel: chosen.label.bn,
    seenBy: input.recordedBy,
    seenAt: input.recordedAt,
    recordedAt: input.now,
  });
  return {
    kind: "observation",
    saw: chosen.value,
    supersedes: Boolean(standing),
  };
};

/**
 * Records what one animal weighed on the scale this round.
 *
 * The reading is kept and never overwritten by the next one: the whole of fattening is the
 * difference between two of these. A replayed entry or a Correction replaces this Completion's
 * own reading, because that is one weighing however many times the phone sends it.
 *
 * A jump nobody could have grown is **taken and flagged**, never refused (ADR 0002; story 85
 * names a weight out of range by hand). The barn wrote something down, and a farm that throws it
 * away on the phone's behalf has lost the only record of it — so the reading goes in, what the
 * farm found is kept beside it, and the Manager is asked. Only the farm can catch the jump at
 * all: a phone that has not synced does not know what she weighed a fortnight ago.
 */
const applyWeighInEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "This step weighs an animal, and it was not recorded against one",
    });
  }
  const standing = await tx.query.weighIn.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true },
  });
  if (input.skipped) {
    // An animal that would not go up the crush has no weight to her name this round.
    if (standing) {
      await tx.delete(weighIn).where(eq(weighIn.id, standing.id));
    }
    return null;
  }

  const weightKg = roundKg(numberIn(input.step, input.evidence));
  const weighedAt = input.recordedAt;
  // Her last reading before this one — not simply her latest, because an entry that synced
  // late belongs where it happened and is judged against what came before it.
  const previous = await tx.query.weighIn.findFirst({
    where: {
      animalId: input.animalId,
      weighedAt: { lt: weighedAt },
      completionId: { ne: input.completionId },
    },
    orderBy: { weighedAt: "desc" },
    columns: { weightKg: true, weighedAt: true },
  });
  const doubtful = implausibleChange(
    previous
      ? { weightKg: Number(previous.weightKg), weighedAt: previous.weighedAt }
      : null,
    { weightKg, weighedAt }
  );
  // The farm's own words, kept with the reading: a figure that looks wrong a year from now
  // should say what was doubtful about it without anybody having to work it out again.
  const flaggedNote = doubtful
    ? `${roundKg(doubtful.dailyKg)} kg/day over ${Math.round(doubtful.days)} days from ${doubtful.lastKg} kg`
    : null;
  const values = {
    farmId: input.instance.farmId,
    animalId: input.animalId,
    completionId: input.completionId,
    weightKg: weightKg.toFixed(KG_DECIMALS),
    flaggedNote,
    weighedAt,
    recordedBy: input.recordedBy,
  };
  await (standing
    ? tx.update(weighIn).set(values).where(eq(weighIn.id, standing.id))
    : tx
        .insert(weighIn)
        .values({ id: uuidv7(input.now), ...values, createdAt: input.now }));
  if (flaggedNote) {
    // In the same transaction as the reading. A doubt whose flag went missing is worse than
    // no doubt at all — the farm would be holding a figure it distrusts and saying nothing.
    await raiseNeedsReview(
      tx,
      input.instance.farmId,
      {
        entity: "weigh_in",
        entityId: input.completionId,
        reason: "implausible_weight",
        auditEventId: input.eventId,
        params: { weightKg, note: flaggedNote },
      },
      input.now
    );
  }
  return { kind: "weigh_in", weightKg, flagged: flaggedNote !== null };
};

/** Every effect that writes its own record, by kind. The milk effects are not here: they share a
 *  Milking Session, which only they may open. */
const RECORDING_EFFECTS: Partial<
  Record<
    NonNullable<Step["effect"]>["kind"],
    (tx: Tx, input: EffectInput) => Promise<EffectResult>
  >
> = {
  observation: applyObservationEffect,
  treatment: applyTreatmentEffect,
  dls_report: applyReportEffect,
  weigh_in: applyWeighInEffect,
  lot_number: applyLotNumberEffect,
};

/**
 * Runs the effect a Step declares, inside the Completion's own transaction: if the effect
 * fails, the Completion and its Audit Event fail with it. Every effect is keyed on the
 * Completion, so a phone that replays an entry — or a Manager who corrects one — replaces
 * what it wrote rather than adding to it (ADR 0002).
 */
export const runStepEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  const { effect } = input.step;
  // Only a Step that writes a Milk Record has anywhere for milk to go. A tank reading filed
  // as "calves" would be nonsense the record then has to carry.
  if (input.destination && effect?.kind !== "milk_record") {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step does not record where the milk went",
    });
  }
  if (!effect) {
    return null;
  }
  const apply = RECORDING_EFFECTS[effect.kind];
  if (apply) {
    return await apply(tx, input);
  }
  // Only the milk effects belong to a Milking Session, and only they may open one: a Step
  // that walks a cow to another Pen has no business creating a session nobody milked into.
  const sessionId = await ensureSession(
    tx,
    { ...input.instance, penId: penOf(input) },
    input.now
  );

  if (effect.kind === "milk_record") {
    if (input.skipped || !input.animalId) {
      // A cow skipped — or recorded before, then skipped — has no litres to her name.
      await removeMilkRecord(tx, input.completionId);
      await reReconcile(tx, sessionId, input.tolerancePercent, input.now);
      return null;
    }
    const written = await writeMilkRecord(tx, {
      farmId: input.instance.farmId,
      sessionId,
      completionId: input.completionId,
      animalId: input.animalId,
      litres: numberIn(input.step, input.evidence),
      requested: input.destination ?? "bulk",
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt,
      now: input.now,
    });
    // A cow corrected after the tank was read would otherwise leave a stale difference.
    await reReconcile(tx, sessionId, input.tolerancePercent, input.now);
    return { kind: "milk_record", ...written };
  }

  const result = await reconcileSession(
    tx,
    sessionId,
    numberIn(input.step, input.evidence),
    input.tolerancePercent,
    input.now
  );
  return { kind: "bulk_total", ...result };
};
