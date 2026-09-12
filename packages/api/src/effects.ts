import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { weighIn } from "@OpenFarm/db/schema/fattening";
import { feeding } from "@OpenFarm/db/schema/feed";
import { dlsReport, treatment } from "@OpenFarm/db/schema/health";
import { animal, animalMove } from "@OpenFarm/db/schema/herd";
import { observation } from "@OpenFarm/db/schema/observation";
import type {
  Choice,
  FeedingEntryLine,
  FeedingLine,
  MilkDestination,
  Step,
} from "@OpenFarm/domain";
import {
  HEAT,
  KG_DECIMALS,
  implausibleChange,
  isShortFed,
  roundKg,
  shortfallPercent,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { feedingTargetForPen } from "./feed-store";
import { recomputeWithdrawal } from "./health-store";
import {
  closeWorkRaisedBy,
  loadLiveAnimal,
  moveOpenWorkWith,
  movedSince,
  recordMove,
  requirePen,
} from "./herd-store";
import {
  ensureSession,
  reReconcile,
  reconcileSession,
  removeMilkRecord,
  writeMilkRecord,
} from "./milk-store";
import { raiseNeedsReview } from "./review-store";

/**
 * What a Step wrote into the farm's records beyond the Evidence itself — reported back so
 * the phone can show the person what the gate decided, and so the Audit Event's `after`
 * says what actually happened rather than what was asked for.
 */
export type EffectResult =
  | { kind: "milk_record"; destination: MilkDestination; forced: boolean }
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
  const value = index === -1 ? undefined : evidence[index];
  if (typeof value !== "string" || value === "") {
    throw new ORPCError("BAD_REQUEST", { message: nothingChosen });
  }
  const declared = step.evidence[index]?.choices?.find(
    (choice) => choice.value === value
  );
  if (!declared) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That is not one of the things this step offers",
    });
  }
  return declared;
};

export interface EffectInput {
  step: Step;
  instance: {
    id: string;
    farmId: string;
    penId: string;
    /** The animal this work is about, for work raised about one — a dose of a Prescription is
     *  hers alone. Null for work about the whole Pen. */
    animalId: string | null;
    dueAt: Date;
    /** When the work was raised, which is the moment its Ration is read as of. */
    raisedAt: Date;
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
  /** What was actually put in front of the Pen, per Feed Item. */
  feeding: FeedingEntryLine[];
  /** How often this Playbook entry feeds — from the Version doing the feeding, so a farm with
   *  more than one feeding routine divides by the one that raised this work. */
  sessionsPerDay: number;
  recordedBy: string;
  recordedAt: Date;
  now: Date;
}

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
  // believes it served, and Stock will be drawn from these in increment 6.
  if (input.skipped) {
    await tx
      .delete(feeding)
      .where(eq(feeding.completionId, input.completionId));
    return null;
  }
  const owed = await feedingTargetForPen(
    tx,
    input.instance.farmId,
    input.instance.penId,
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
      penId: input.instance.penId,
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
  const reference = input.skipped ? null : noteIn(input.step, input.evidence);
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
    },
  });
  if (!product || product.milkWithdrawalDays === null) {
    throw new ORPCError("BAD_REQUEST", {
      message: product
        ? `${product.nameBn} has no withdrawal days written down, so it cannot be given`
        : "That product is no longer on the farm's drug list",
      data: { refusal: "no_withdrawal_days" },
    });
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
      ...given,
    })
    .onConflictDoUpdate({
      target: [treatment.instanceId, treatment.animalId],
      set: given,
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
  if (owed) {
    await tx.update(treatment).set(given).where(eq(treatment.id, owed.id));
  } else if (shape.campaign) {
    dose = await recordCampaignDose(tx, input, {
      productId: shape.productId,
      animalId: shape.animalId,
      given,
    });
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
  withdrawn: { id: string; saw: string }
) => {
  if (withdrawn.saw === HEAT) {
    await closeWorkRaisedBy(tx, farmId, `heat:${withdrawn.id}`);
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
      await unraiseIfHeat(tx, input.instance.farmId, standing);
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
    await unraiseIfHeat(tx, input.instance.farmId, standing);
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
  const already = await tx.query.animalMove.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true, fromPenId: true, toPenId: true },
  });
  // Asked of the Moves themselves, not of where she is standing: a cow walked away and back
  // again is standing where this entry left her, and is still a cow the farm has learned
  // something newer about.
  const somethingMovedHer = await movedSince(
    tx,
    live.id,
    input.recordedAt,
    input.completionId
  );

  // Corrected to a skip: the journey is undone if nothing has happened to her since.
  if (input.skipped) {
    if (!already) {
      return null;
    }
    if (somethingMovedHer) {
      return {
        kind: "move",
        fromPenId: already.fromPenId,
        toPenId: already.toPenId,
        moved: false,
        cannotUndo: true,
      };
    }
    await tx
      .delete(animalMove)
      .where(eq(animalMove.completionId, input.completionId));
    if (already.fromPenId) {
      await tx
        .update(animal)
        .set({ penId: already.fromPenId, updatedAt: input.now })
        .where(eq(animal.id, live.id));
      await moveOpenWorkWith(
        tx,
        input.instance.farmId,
        live.id,
        already.fromPenId
      );
    }
    return null;
  }

  const toPenId = choiceIn(
    input.step,
    input.evidence,
    "This step moves an animal, and no pen was chosen"
  ).value;
  // A Pen that is not this farm's is not somewhere she can be walked to.
  await requirePen(tx, input.instance.farmId, toPenId);
  const fromPenId = already?.fromPenId ?? live.penId;

  if (somethingMovedHer) {
    // Record what the Step now says, and leave her where the farm last saw her.
    if (already) {
      await tx
        .update(animalMove)
        .set({ toPenId })
        .where(eq(animalMove.completionId, input.completionId));
    }
    return { kind: "move", fromPenId, toPenId, moved: false, cannotUndo: true };
  }

  if (already) {
    await tx
      .update(animalMove)
      .set({ toPenId })
      .where(eq(animalMove.completionId, input.completionId));
    await tx
      .update(animal)
      .set({ penId: toPenId, updatedAt: input.now })
      .where(eq(animal.id, live.id));
    await moveOpenWorkWith(tx, input.instance.farmId, live.id, toPenId);
  } else if (fromPenId !== toPenId) {
    await recordMove(tx, {
      farmId: input.instance.farmId,
      beast: live,
      toPenId,
      completionId: input.completionId,
      movedBy: input.recordedBy,
      movedAt: input.recordedAt,
      now: input.now,
    });
  }
  return {
    kind: "move",
    fromPenId,
    toPenId,
    moved: fromPenId !== toPenId,
    cannotUndo: false,
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
  if (effect.kind === "move") {
    return await applyMoveEffect(tx, input);
  }
  if (effect.kind === "observation") {
    return await applyObservationEffect(tx, input);
  }
  if (effect.kind === "feeding") {
    return await applyFeedingEffect(tx, input);
  }
  if (effect.kind === "treatment") {
    return await applyTreatmentEffect(tx, input);
  }
  if (effect.kind === "dls_report") {
    return await applyReportEffect(tx, input);
  }
  if (effect.kind === "weigh_in") {
    return await applyWeighInEffect(tx, input);
  }
  // Only the milk effects belong to a Milking Session, and only they may open one: a Step
  // that walks a cow to another Pen has no business creating a session nobody milked into.
  const sessionId = await ensureSession(tx, input.instance, input.now);

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
