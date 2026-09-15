import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { pregnancyCheck, service } from "@OpenFarm/db/schema/breeding";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { weighIn } from "@OpenFarm/db/schema/fattening";
import { feeding } from "@OpenFarm/db/schema/feed";
import {
  campaignLotNumber,
  dlsReport,
  treatment,
} from "@OpenFarm/db/schema/health";
import { observation } from "@OpenFarm/db/schema/observation";
import type {
  Choice,
  FeedingEntryLine,
  FeedingLine,
  MilkDestination,
  PregnancyCheckResult,
  ServiceMethod,
  Step,
} from "@OpenFarm/domain";
import {
  CALF_OUTCOMES,
  CALF_SEXES,
  CALVING_EASES,
  CALVING_EVIDENCE,
  CALVING_RECORDERS,
  HEAT,
  KG_DECIMALS,
  SERVICE_EVIDENCE,
  canTransition,
  isPregnancyCheckResult,
  isServiceMethod,
  implausibleChange,
  isShortFed,
  roundKg,
  shortfallPercent,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { PregnancyTimes } from "./breeding-store";
import {
  attemptThatRaisedWork,
  callOffWorkOfAttemptsNoLongerStanding,
  rederivePregnancy,
} from "./breeding-store";
import type { CalvingRecorded } from "./calving-store";
import { recordCalving } from "./calving-store";
import type { CalvingWorkFollowed } from "./calving-work";
import { feedingTargetForPen } from "./feed-store";
import { recomputeWithdrawal } from "./health-store";
import {
  callOffWorkRaisedBy,
  entersState,
  loadLiveAnimal,
  requirePen,
  walkByStep,
} from "./herd-store";
import { heatKeyOf, heatThatRaised, isOnTheFarm } from "./instances-store";
import {
  ensureSession,
  reReconcile,
  reconcileSession,
  removeMilkRecord,
  writeMilkRecord,
} from "./milk-store";
import type { RenewalEntry } from "./registration-store";
import { renewRegistration } from "./registration-store";
import { raiseNeedsReview } from "./review-store";
import { forbidden } from "./roles";
import type { StockAdjustment, StockCountLine } from "./stock-store";
import { recordStockCount } from "./stock-store";
import type { Who } from "./work-moves";

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
    }
  | {
      kind: "feeding";
      /** What the Pen was owed, and how far under it the session came. */
      shortfallPercent: number;
      flagged: boolean;
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
      /** She has been moved again since, so a Correction cannot walk this one back and a
       *  person has to decide what the truth is. */
      cannotUndo: boolean;
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
  | ({ kind: "service"; method: ServiceMethod | null } & CalvingWorkFollowed)
  | ({
      kind: "pregnancy_check";
      result: PregnancyCheckResult | null;
    } & CalvingWorkFollowed)
  | ({ kind: "calving" } & CalvingRecorded)
  | {
      kind: "stock_count";
      /** The Feed Items whose count differed from what the store was thought to hold. */
      adjustments: StockAdjustment[];
    }
  | {
      kind: "dry_off";
      /** False when she was already Dry: a phone replaying the entry dries nobody twice. */
      dried: boolean;
      /** Corrected to a skip, but she cannot be put back in milk from here: what she was before,
       *  and since when, is the trail's to say and a person's to decide. */
      cannotUndo: boolean;
    }
  | null;

/** The figure a record-writing Step asks for: the first `number` slot the Version declares.
 *  A Step that writes a record has exactly one figure to write — litres, kilograms, a dose. */
const numberIn = (step: Step, evidence: unknown[]): number => {
  const index = step.evidence.findIndex((item) => item.type === "number");
  const value = index === -1 ? undefined : evidence[index];
  const typed = Number(value);
  if (
    index === -1 ||
    value === undefined ||
    value === "" ||
    Number.isNaN(typed)
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step records a figure, and none was given",
    });
  }
  return typed;
};

/** What was written in the Step's note, trimmed, or nothing when it was left empty. */
const noteIn = (step: Step, evidence: unknown[]): string | null => {
  const index = step.evidence.findIndex((item) => item.type === "note");
  const value = index === -1 ? undefined : evidence[index];
  const written = typeof value === "string" ? value.trim() : "";
  return written === "" ? null : written;
};

/** The note a Step recorded, or nothing when the Step was skipped. */
const writtenNote = (input: EffectInput): string | null =>
  input.skipped ? null : noteIn(input.step, input.evidence);

/** What was chosen at one position, as the Version declares it there — or null when nothing was.
 *  A value the Version never offered at that position is refused, not ignored. */
const declaredChoiceAt = (
  step: Step,
  evidence: unknown[],
  position: number
): Choice | null => {
  const value = evidence[position];
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const declared = step.evidence[position]?.choices?.find(
    (choice) => choice.value === value
  );
  if (!declared) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is not one of the things this step offers",
    });
  }
  return declared;
};

/**
 * What the person chose, as the Version declares it — the value, and the Bangla they were
 * reading when they chose it. Checked against the Step's own choices, the way a Move's Pen is
 * checked against the farm's: a value no Version ever offered is not something anybody saw.
 */
const choiceIn = (
  step: Step,
  evidence: unknown[],
  nothingChosen: string
): Choice => {
  const index = step.evidence.findIndex((item) => item.type === "choice");
  const chosen = index === -1 ? null : declaredChoiceAt(step, evidence, index);
  if (!chosen) {
    throw new ORPCError("BAD_REQUEST", { message: nothingChosen });
  }
  return chosen;
};

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
  /** Who is recording it now — the person putting a Step right, not the one who first did it — as the trail of work it
   *  calls off names them. */
  who: Who;
}

/** The Pen a Pen's Step records into. Feeding a Pen and milking one are about a Pen, and work about the whole
 *  farm cannot carry them. */
const penOf = (input: EffectInput): string => {
  if (input.instance.penId === null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This Step records a Pen's work, and this work is in no Pen",
      data: { refusal: "work_in_no_pen" },
    });
  }
  return input.instance.penId;
};

/**
 * Records what a Pen was actually given against what its Ration owed it.
 *
 * The target is worked out from the Ration in force when the work was *raised* and the animals
 * standing in the Pen now, and both are written into the record with the figures — so a year
 * later the arithmetic can still be shown rather than re-derived from a farm that has changed.
 *
 * A session appreciably under target is flagged on the farm's own tolerance. That is the
 * first sign of a pen off its feed, a bag that ran out, or a job somebody did not do.
 */
const applyFeedingEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  // A whole-Pen Step cannot be skipped today — a meal that did not happen is the Manager
  // closing the work as Missed — so this is the guard for the day that rule changes, not a
  // path the farm can reach. A Feeding left standing beside a skip would be a meal the farm
  // believes it served, and feed the store believes it gave.
  if (input.skipped) {
    await tx
      .delete(feeding)
      .where(eq(feeding.completionId, input.completionId));
    return null;
  }
  const owed = await feedingTargetForPen(
    tx,
    input.instance.farmId,
    penOf(input),
    // When the work was raised, not when it fell due: an Instance raised this morning for
    // tonight is fed on the Ration the farm had this morning, whatever is published between.
    input.instance.raisedAt,
    input.sessionsPerDay
  );
  if (!owed) {
    // The phone had a Ration when it recorded this; the farm does not now. That is the world
    // moving under an entry, not an entry that was ever wrong (ADR 0002).
    throw new ORPCError("CONFLICT", {
      message:
        "This pen is on no ration now, so what was fed cannot be set against one",
      // The world moved under an entry that was good when it was written, which a phone's
      // outbox keeps and puts in front of a person rather than throwing away (ADR 0002).
      data: { late: true },
    });
  }
  const given = new Map(input.feeding.map((line) => [line.feedItemId, line]));
  const lines: FeedingLine[] = owed.items.map((line) => ({
    feedItemId: line.feedItemId,
    targetKg: line.quantity,
    givenKg: roundKg(given.get(line.feedItemId)?.givenKg ?? 0),
    leftoverKg: roundKg(given.get(line.feedItemId)?.leftoverKg ?? 0),
  }));
  const short = shortfallPercent(lines);
  const flagged = isShortFed(lines, input.feedTolerancePercent);

  // Keyed on the Completion: a replayed entry is the same meal, and a Correction rewrites
  // what was given rather than feeding the Pen twice.
  await tx
    .insert(feeding)
    .values({
      id: uuidv7(input.now),
      farmId: input.instance.farmId,
      instanceId: input.instance.id,
      completionId: input.completionId,
      penId: penOf(input),
      rationVersionId: owed.rationVersionId,
      animals: owed.animals,
      sessionsPerDay: owed.sessionsPerDay,
      lines,
      shortfallPercent: short,
      flaggedAt: flagged ? input.now : null,
      fedBy: input.recordedBy,
      fedAt: input.recordedAt,
      recordedAt: input.now,
    })
    .onConflictDoUpdate({
      target: feeding.completionId,
      set: {
        lines,
        animals: owed.animals,
        shortfallPercent: short,
        flaggedAt: flagged ? input.now : null,
        fedAt: input.recordedAt,
      },
    });
  return { kind: "feeding", shortfallPercent: short, flagged };
};

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
  who: Who
) => {
  if (withdrawn.saw === HEAT) {
    await callOffWorkRaisedBy(tx, farmId, heatKeyOf(withdrawn.id), who);
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
      await unraiseIfHeat(tx, input.instance.farmId, standing, input.who);
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
    await unraiseIfHeat(tx, input.instance.farmId, standing, input.who);
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
 * Walks her to the Pen the Step recorded, and writes the Move that says the Playbook did it.
 *
 * Keyed on the Completion, like every other effect: a phone replaying an entry, or a Manager
 * correcting one, changes where she went rather than sending her on a second journey. What
 * it will not do is rewrite where she is when anything has moved her since the entry was
 * recorded — that is a fact the farm has and this Correction does not, so she stays where she
 * was last seen and a person is asked (Needs Review, irreversible effect).
 *
 * The Pen she is walked to is not checked against the doer's Pen Assignments, unlike a Move
 * somebody records by hand. The destinations are the Owner's, authored into the Step, and a
 * milker assigned to the milking pen has to be able to walk a cow to the dry pen — that is
 * what the procedure says to do. What they may work on is already settled by the Instance.
 */
const applyMoveEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step moves an animal, and it was not recorded against one",
    });
  }
  const beast = await tx.query.animal.findFirst({
    where: { id: input.animalId, farmId: input.instance.farmId },
    columns: {
      id: true,
      tagNumber: true,
      penId: true,
      side: true,
      state: true,
    },
  });
  if (!beast) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  // An animal that has left the farm cannot be walked anywhere, whoever is asking.
  const live = await loadLiveAnimal(tx, input.instance.farmId, beast.tagNumber);
  const toPenId = input.skipped
    ? null
    : choiceIn(
        input.step,
        input.evidence,
        "This step moves an animal, and no pen was chosen"
      ).value;
  if (toPenId) {
    // A Pen that is not this farm's is not somewhere she can be walked to.
    await requirePen(tx, input.instance.farmId, toPenId);
  }
  const walked = await walkByStep(tx, {
    farmId: input.instance.farmId,
    beast: live,
    completionId: input.completionId,
    toPenId,
    movedBy: input.recordedBy,
    movedAt: input.recordedAt,
    now: input.now,
    calvingLeadDays: input.pregnancyTimes.calvingLeadDays,
    who: input.who,
  });
  return walked ? { kind: "move", ...walked } : null;
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

/** What was written at one position of the Evidence, trimmed, or null when it was left empty. */
const textAt = (evidence: unknown[], position: number): string | null => {
  const value = evidence[position];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

/**
 * Works her pregnancy out again after something under it changed. Only the caller knows whether that
 * change was a positive being put right.
 */
const rederiveFor = (
  tx: Tx,
  input: EffectInput,
  cowId: string,
  undoingPositive: boolean
) =>
  rederivePregnancy(tx, cowId, {
    times: input.pregnancyTimes,
    at: input.recordedAt,
    now: input.now,
    undoingPositive,
    who: input.who,
  });

/**
 * What a service changed further down the chain. A day corrected, a first service taken back, or a
 * new heat served moves her latest attempt: work raised by one that no longer stands is closed, and
 * a check already made counts from the day as it now stands.
 */
const breedingFollowsService = async (
  tx: Tx,
  input: EffectInput,
  cowId: string
) => {
  await callOffWorkOfAttemptsNoLongerStanding(
    tx,
    input.instance.farmId,
    cowId,
    input.who
  );
  return rederiveFor(tx, input, cowId, false);
};

/**
 * Records that she was served: how, by which sire, by whom, and in answer to which Heat.
 *
 * The Manager's alone. The roles matrix gives Service `C R U` to the Manager and nothing to Barn
 * Staff or the Vet, and a Step is completed by whoever is standing at it — so the Step's own gate is
 * not enough and the effect asks. The Vet's breeding acts are the Pregnancy Check and the Abortion;
 * a milker's is recording a Calving on the round.
 *
 * A natural service names a bull standing on this farm. A tag that is not one is a sire nobody can
 * trace, and parentage is the whole reason the record exists.
 */
const applyServiceEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.roles.includes("manager")) {
    throw forbidden({
      message: "A service is the Manager's to record",
      reason: "manager_only",
    });
  }
  const cowId = input.animalId ?? input.instance.animalId;
  if (!cowId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A service is recorded about one cow, and this work is about none",
    });
  }
  // A service is of a cow. Recorded against a bull or a steer, it is a service of nothing, and the
  // Pregnancy Check and Calving that count from it would be counting from a mistake.
  const cow = await tx.query.animal.findFirst({
    where: { id: cowId },
    columns: { sex: true },
  });
  if (cow?.sex !== "female") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a cow is served",
      data: { refusal: "service_of_a_male" },
    });
  }
  const standing = await tx.query.service.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true },
  });
  if (input.skipped) {
    if (standing) {
      // A service the Vet has checked is the attempt that check is of. Taking it back would leave a
      // finding about nothing; the check is corrected first, by the Vet whose finding it is.
      const checked = await tx.query.pregnancyCheck.findFirst({
        where: { serviceId: standing.id },
        columns: { id: true },
      });
      if (checked) {
        throw new ORPCError("BAD_REQUEST", {
          message: "The Vet has checked this service; it cannot be taken back",
          data: { refusal: "service_already_checked" },
        });
      }
      await tx.delete(service).where(eq(service.id, standing.id));
      return {
        kind: "service",
        method: null,
        ...(await breedingFollowsService(tx, input, cowId)),
      };
    }
    return null;
  }

  const method = choiceIn(
    input.step,
    input.evidence,
    "A service says how she was served, and nothing was chosen"
  ).value;
  if (!isServiceMethod(method)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `"${method}" is not a way a cow is served`,
    });
  }
  const sire = textAt(input.evidence, SERVICE_EVIDENCE.sire);
  if (!sire) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A service names its sire",
    });
  }

  // The story asks for the technician. A bull running with the herd has nobody standing over him,
  // so it is only an AI service that is refused without a name.
  const servedBy = textAt(input.evidence, SERVICE_EVIDENCE.servedBy);
  if (method === "ai" && !servedBy) {
    throw new ORPCError("BAD_REQUEST", {
      message: "An AI service names who served her",
      data: { refusal: "service_needs_technician" },
    });
  }

  // When she was served, which is not when it was written down. A day that has not come yet is not
  // a service; one that cannot be read is not a day.
  const servedAt = new Date(String(input.evidence[SERVICE_EVIDENCE.servedAt]));
  if (Number.isNaN(servedAt.getTime())) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A service says when she was served",
    });
  }
  if (servedAt.getTime() > input.now.getTime()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A service cannot have happened later than now",
      data: { refusal: "served_in_the_future" },
    });
  }

  let sireAnimalId: string | null = null;
  if (method === "natural") {
    const bull = await tx.query.animal.findFirst({
      where: {
        farmId: input.instance.farmId,
        tagNumber: sire.toUpperCase(),
        sex: "male",
      },
      columns: { id: true, state: true },
    });
    if (!(bull && isOnTheFarm(bull))) {
      throw new ORPCError("BAD_REQUEST", {
        message: `There is no bull with tag ${sire} on this farm`,
        data: { refusal: "no_such_bull" },
      });
    }
    sireAnimalId = bull.id;
  }

  const values = {
    farmId: input.instance.farmId,
    animalId: cowId,
    completionId: input.completionId,
    method,
    sireStraw: method === "ai" ? sire : null,
    sireAnimalId,
    servedBy,
    heatId: heatThatRaised(input.instance.cause),
    // The Role the Service belongs to, on the record itself. The Step ran under whichever Role the
    // person holds first, which for somebody who is both Owner and Manager reads "owner" — a Role
    // that may only read a Service.
    recordedByRole: "manager" as const,
    servedAt,
    recordedBy: input.recordedBy,
  };
  await (standing
    ? tx.update(service).set(values).where(eq(service.id, standing.id))
    : tx
        .insert(service)
        .values({ id: uuidv7(input.now), ...values, createdAt: input.now }));
  return {
    kind: "service",
    method,
    ...(await breedingFollowsService(tx, input, cowId)),
  };
};

/**
 * Records what the Vet found: whether the attempt a Service began has taken.
 *
 * The Vet's alone. The roles matrix gives the Pregnancy Check `C R U` to the Vet and read to the
 * Owner and the Manager — and both of those may step into any shift, so the Step's own gate lets
 * them in and the effect asks. Whether a cow is carrying is a clinical finding.
 *
 * Of an attempt, not of a service, and only on the work that attempt raised: which of her heats a
 * pregnancy dates from is the farm's to know, not the Vet's to guess. A positive makes a Heifer a
 * Pregnant Heifer and sets Expected Calving from the attempt's first service; a negative is kept — a
 * run of them is a Repeat Breeder — and takes nothing from her. Both are worked out from the checks,
 * never typed.
 */
const applyPregnancyCheckEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.roles.includes("vet")) {
    throw forbidden({
      message: "A pregnancy check is the Vet's to record",
      reason: "vet_only",
    });
  }
  const cowId = input.instance.animalId;
  const standing = await tx.query.pregnancyCheck.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true, serviceId: true, result: true },
  });
  const wasPositive = standing?.result === "positive";
  if (input.skipped) {
    if (standing && cowId) {
      await tx.delete(pregnancyCheck).where(eq(pregnancyCheck.id, standing.id));
      return {
        kind: "pregnancy_check",
        result: null,
        ...(await rederiveFor(tx, input, cowId, wasPositive)),
      };
    }
    return null;
  }

  const result = choiceIn(
    input.step,
    input.evidence,
    "A pregnancy check says what was found, and nothing was chosen"
  ).value;
  if (!isPregnancyCheckResult(result)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `"${result}" is not something a pregnancy check finds`,
    });
  }
  // A correction keeps the attempt the check was made of, even if she has been served since.
  const raisedBy =
    standing || !cowId
      ? null
      : await attemptThatRaisedWork(tx, cowId, input.instance.cause);
  const serviceId = standing?.serviceId ?? raisedBy?.id;
  if (!(cowId && serviceId)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A pregnancy check is of the service that raised it, and this work was not raised by her latest",
      data: { refusal: "check_without_a_service" },
    });
  }

  const values = {
    farmId: input.instance.farmId,
    animalId: cowId,
    completionId: input.completionId,
    serviceId,
    result,
    checkedAt: input.recordedAt,
    recordedBy: input.recordedBy,
  };
  await (standing
    ? tx
        .update(pregnancyCheck)
        .set(values)
        .where(eq(pregnancyCheck.id, standing.id))
    : tx
        .insert(pregnancyCheck)
        .values({ id: uuidv7(input.now), ...values, createdAt: input.now }));
  return {
    kind: "pregnancy_check",
    result,
    ...(await rederiveFor(
      tx,
      input,
      cowId,
      wasPositive && result === "negative"
    )),
  };
};

/**
 * Dries her off: a milking cow is Dry from the moment this Step says, and her Lactation ends there
 * without being forgotten.
 *
 * Keyed on the cow rather than a row of its own, because Dry is her State and the State is the
 * record: a phone replaying the entry finds her Dry already and dries nobody twice. What it will not
 * do is put her back in milk when the entry is corrected to a skip. What she was before, and since
 * when, matters to every State-triggered procedure — a cow put back in Milking from here would look
 * freshly calved — so she stays Dry and a person is asked (Needs Review, irreversible effect).
 */
const applyDryOffEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step dries off a cow, and it was not recorded against one",
    });
  }
  const her = await tx.query.animal.findFirst({
    where: { id: input.animalId, farmId: input.instance.farmId },
    columns: { tagNumber: true },
  });
  if (!her) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  // A cow who has left the farm cannot be dried off, whoever is asking.
  const live = await loadLiveAnimal(tx, input.instance.farmId, her.tagNumber);
  if (input.skipped) {
    // Only an entry that dried her has anything to undo: she went Dry at the moment it was recorded.
    // A cow already Dry when this entry came asks nobody anything.
    const driedByThisEntry =
      live.state === "dry" &&
      live.stateChangedAt.getTime() === input.recordedAt.getTime();
    return driedByThisEntry
      ? { kind: "dry_off", dried: false, cannotUndo: true }
      : null;
  }
  if (live.state === "dry") {
    return { kind: "dry_off", dried: false, cannotUndo: false };
  }
  if (!canTransition(live.state, "dry")) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a cow in milk is dried off",
      data: { refusal: "dry_off_of_a_cow_not_in_milk" },
    });
  }
  await entersState(tx, input.instance.farmId, live, {
    state: "dry",
    at: input.recordedAt,
    now: input.now,
  });
  return { kind: "dry_off", dried: true, cannotUndo: false };
};

/**
 * What was chosen at one position of the Evidence, as one of the fixed words the record reads back —
 * or null when that slot was left empty.
 */
const choiceAt = <Value extends string>(
  step: Step,
  evidence: unknown[],
  position: number,
  allowed: readonly Value[]
): Value | null => {
  const value = declaredChoiceAt(step, evidence, position)?.value ?? null;
  if (value !== null && !(allowed as readonly string[]).includes(value)) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is not one of the things this step offers",
    });
  }
  return value as Value | null;
};

/** The calving a Step's Evidence describes, read by the positions the Step was validated by. */
const calvingIn = (input: EffectInput) => {
  const at = new Date(String(input.evidence[CALVING_EVIDENCE.calvedAt]));
  if (Number.isNaN(at.getTime())) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving says when she calved",
    });
  }
  if (at.getTime() > input.now.getTime()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving cannot have happened later than now",
      data: { refusal: "calved_in_the_future" },
    });
  }
  const ease = choiceAt(
    input.step,
    input.evidence,
    CALVING_EVIDENCE.ease,
    CALVING_EASES
  );
  if (!ease) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving says how it went",
    });
  }
  const calves = [];
  for (const slots of CALVING_EVIDENCE.calves) {
    const sex = choiceAt(input.step, input.evidence, slots.sex, CALF_SEXES);
    const outcome = choiceAt(
      input.step,
      input.evidence,
      slots.outcome,
      CALF_OUTCOMES
    );
    // A calf is its sex and whether it lived, both or neither: half a calf is not one to create.
    if (Boolean(sex) !== Boolean(outcome)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Each calf needs its sex and whether it was born alive",
      });
    }
    if (sex && outcome) {
      calves.push({ sex, outcome });
    }
  }
  if (calves.length === 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A calving has a calf; one without is an abortion",
    });
  }
  return { at, ease, calves };
};

/**
 * Records that she calved — Barn Staff's to record on the round, or the Manager's.
 *
 * The roles matrix gives Calving `C R U` to the Manager and `C` to Barn Staff as an SOP step, and only
 * read to the Owner; the Owner may step into any shift, so the effect asks.
 */
const applyCalvingEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!CALVING_RECORDERS.some((role) => input.roles.includes(role))) {
    throw forbidden({
      message: "A calving is recorded by Barn Staff or the Manager",
      reason: "staff_or_manager_only",
    });
  }
  const damId = input.animalId ?? input.instance.animalId;
  if (!damId) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A calving is recorded about one cow, and this entry is about none",
    });
  }
  const recorded = await recordCalving(tx, {
    farmId: input.instance.farmId,
    damId,
    completionId: input.completionId,
    calved: input.skipped ? null : calvingIn(input),
    recordedBy: input.recordedBy,
    recordedByRole: input.roleUsed,
    times: input.pregnancyTimes,
    now: input.now,
    who: input.who,
  });
  return recorded ? { kind: "calving", ...recorded } : null;
};

/**
 * Counts the store: what is really there of each Feed Item, and why it differs. The Manager's alone
 * (roles matrix: Stock Count — Manager C R U): the Owner steps into shifts, and a count moves what the
 * farm's feed is worth.
 */
const applyStockCountEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.roles.includes("manager")) {
    throw forbidden({
      message: "Counting the store is the Manager's",
      reason: "manager_only",
    });
  }
  const adjustments = await recordStockCount(tx, {
    farmId: input.instance.farmId,
    completionId: input.completionId,
    counts: input.counts,
    skipped: input.skipped,
    countedAt: input.recordedAt,
    countedBy: input.recordedBy,
    now: input.now,
  });
  return { kind: "stock_count", adjustments };
};

/**
 * Renews the farm's DLS Registration: the Owner's, as the renewal SOP is (the registration decision). The
 * new expiry and certificate replace the old, and the renewal is kept against the expiry it replaced.
 */
const applyRenewalEffect = async (
  tx: Tx,
  input: EffectInput
): Promise<EffectResult> => {
  if (!input.roles.includes("owner")) {
    throw forbidden({
      message: "Renewing the Registration is the Owner's",
      reason: "owner_only",
    });
  }
  const renewed = await renewRegistration(tx, {
    farmId: input.instance.farmId,
    completionId: input.completionId,
    renewal: input.renewal,
    by: input.recordedBy,
    now: input.now,
  });
  return { kind: "registration_renewal", ...renewed };
};

/** Every effect that writes its own record, by kind. The milk effects are not here: they share a
 *  Milking Session, which only they may open. */
const RECORDING_EFFECTS: Partial<
  Record<
    NonNullable<Step["effect"]>["kind"],
    (tx: Tx, input: EffectInput) => Promise<EffectResult>
  >
> = {
  move: applyMoveEffect,
  observation: applyObservationEffect,
  feeding: applyFeedingEffect,
  treatment: applyTreatmentEffect,
  dls_report: applyReportEffect,
  weigh_in: applyWeighInEffect,
  service: applyServiceEffect,
  pregnancy_check: applyPregnancyCheckEffect,
  dry_off: applyDryOffEffect,
  calving: applyCalvingEffect,
  stock_count: applyStockCountEffect,
  registration_renewal: applyRenewalEffect,
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
