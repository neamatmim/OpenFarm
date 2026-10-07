import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { weighIn } from "@OpenFarm/db/schema/fattening";
import { needsReview } from "@OpenFarm/db/schema/review";
import {
  KG_DECIMALS,
  implausibleAfterArrival,
  implausibleChange,
  roundKg,
  weighedShort,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import { tell } from "../notice";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { asPublished, numberIn } from "./evidence";

type WeighInFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "animalId"
  | "evidence"
  | "skipped"
  | "completionId"
  | "eventId"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/**
 * A bought animal's first Weigh-in set against the weight she came off the lorry at: more than the Owner's line under it,
 * within her first thirty days, is told to the Owner in the evening's post — the reading is right; it is the purchase
 * she asks the Manager about. About the Intake, so a reading put right is not told twice. Nothing for an animal born
 * here, or one weighed before.
 */
const judgeHerFirstWeighIn = async (
  tx: Tx,
  input: WeighInFacts,
  animalId: string,
  reading: { weightKg: number; weighedAt: Date }
) => {
  const before = await tx.query.weighIn.findFirst({
    where: {
      animalId,
      weighedAt: { lt: reading.weighedAt },
      completionId: { ne: input.completionId },
    },
    columns: { id: true },
  });
  if (before) {
    return;
  }
  const bought = await tx.query.intake.findFirst({
    where: { animalId, farmId: input.instance.farmId },
    columns: { id: true, weightKg: true, arrivedAt: true },
    with: {
      seller: { columns: { name: true } },
      animal: { columns: { tagNumber: true } },
    },
  });
  if (!bought) {
    return;
  }
  const farm = await tx.query.farm.findFirst({
    where: { id: input.instance.farmId },
    columns: { arrivalShortPercent: true },
  });
  const short = weighedShort(
    { arrivalKg: Number(bought.weightKg), arrivedAt: bought.arrivedAt },
    reading,
    farm?.arrivalShortPercent ?? 5
  );
  if (!short) {
    // A first weighing put right to within the line: the notice that the lorry came short goes.
    await clearNoticesAbout(tx, input.instance.farmId, [bought.id], input.now, [
      "arrival_weight_short",
    ]);
    return;
  }
  await tell(
    tx,
    input.instance.farmId,
    {
      kind: "arrival_weight_short",
      about: { id: bought.id },
      facts: {
        tag: bought.animal.tagNumber,
        seller: bought.seller?.name ?? "",
        arrivalKg: Number(bought.weightKg),
        weighedKg: reading.weightKg,
        days: short.days,
        percent: short.percent,
      },
    },
    input.now
  );
};

/**
 * What the farm doubts about a reading, in its own words, or nothing: set against her last reading before it that the
 * farm did not doubt — not simply her latest, because an entry that synced late belongs where it happened, and a
 * misweighing set beside the right figure after it would make that read as wrong too — or, before any, what she
 * was bought at, the lorry allowed for (`implausibleAfterArrival`), so a first reading typed wrong is caught too.
 */
const doubtAbout = async (
  tx: Tx,
  reading: {
    farmId: string;
    animalId: string;
    completionId: string;
    weightKg: number;
    weighedAt: Date;
  }
): Promise<string | null> => {
  const previous = await tx.query.weighIn.findFirst({
    where: {
      animalId: reading.animalId,
      weighedAt: { lt: reading.weighedAt },
      completionId: { ne: reading.completionId },
      flaggedNote: { isNull: true },
    },
    orderBy: { weighedAt: "desc", id: "desc" },
    columns: { weightKg: true, weighedAt: true },
  });
  const arrived = previous
    ? undefined
    : await tx.query.intake.findFirst({
        where: { farmId: reading.farmId, animalId: reading.animalId },
        columns: { weightKg: true, arrivedAt: true },
      });
  const now = { weightKg: reading.weightKg, weighedAt: reading.weighedAt };
  // Against her last trusted reading as any other; with none, against what she was bought at, the lorry allowed for.
  let doubtful: ReturnType<typeof implausibleChange> = null;
  if (previous) {
    doubtful = implausibleChange(
      { weightKg: Number(previous.weightKg), weighedAt: previous.weighedAt },
      now
    );
  } else if (arrived) {
    doubtful = implausibleAfterArrival(
      { weightKg: Number(arrived.weightKg), arrivedAt: arrived.arrivedAt },
      now
    );
  }
  // The farm's own words, kept with the reading: a figure that looks wrong a year from now
  // should say what was doubtful about it without anybody having to work it out again.
  return doubtful
    ? `${roundKg(doubtful.dailyKg)} kg/day over ${Math.round(doubtful.days)} days from ${doubtful.lastKg} kg`
    : null;
};

/** Why the farm stopped doubting a reading by itself, as the Manager's question is closed with it. */
const NO_LONGER_DOUBTED =
  "No longer doubted: the reading before it was put right, or found right";

/** A doubt about a reading that no longer holds: the Manager's question about it closed, saying why. */
const liftTheDoubt = async (
  tx: Tx,
  farmId: string,
  completionId: string,
  now: Date
): Promise<void> => {
  await tx
    .update(needsReview)
    .set({ resolvedAt: now, resolution: NO_LONGER_DOUBTED })
    .where(
      and(
        eq(needsReview.farmId, farmId),
        eq(needsReview.entity, "weigh_in"),
        eq(needsReview.entityId, completionId),
        eq(needsReview.reason, "implausible_weight"),
        isNull(needsReview.resolvedAt)
      )
    );
};

/** A reading the farm now doubts, asked of the Manager as any doubted reading is. */
const askAboutTheWeight = async (
  tx: Tx,
  doubt: {
    farmId: string;
    completionId: string;
    weightKg: number;
    note: string;
    now: Date;
    eventId?: string;
  }
): Promise<void> => {
  // Named, so the notice says whose weighing it doubts rather than that something somewhere needs a look.
  const weighed = await tx.query.stepCompletion.findFirst({
    where: { id: doubt.completionId },
    columns: { id: true },
    with: { animal: { columns: { tagNumber: true } } },
  });
  await tell(
    tx,
    doubt.farmId,
    {
      kind: "needs_review",
      about: {
        id: doubt.completionId,
        entity: "weigh_in",
        auditEventId: doubt.eventId ?? "",
      },
      facts: {
        reason: "implausible_weight",
        weightKg: doubt.weightKg,
        note: doubt.note,
        tag: weighed?.animal?.tagNumber ?? null,
      },
    },
    doubt.now
  );
};

/**
 * Judges again every reading of hers after a moment, oldest first, each against what now stands before it: a reading
 * put right, or one the Manager found right, changes what the ones after it are set against. A doubt that no longer
 * holds is lifted, and the Manager's question about it closed; one that now holds is kept and asked about.
 */
export const judgeAgainAfter = async (
  tx: Tx,
  input: {
    farmId: string;
    animalId: string;
    after: Date;
    now: Date;
    eventId?: string;
  }
): Promise<void> => {
  const later = await tx.query.weighIn.findMany({
    where: {
      farmId: input.farmId,
      animalId: input.animalId,
      weighedAt: { gt: input.after },
    },
    orderBy: { weighedAt: "asc", id: "asc" },
    columns: {
      id: true,
      completionId: true,
      weightKg: true,
      weighedAt: true,
      flaggedNote: true,
    },
  });
  for (const one of later) {
    // One after the other: each is set against what the ones before it now say.
    // oxlint-disable-next-line no-await-in-loop
    const note = await doubtAbout(tx, {
      farmId: input.farmId,
      animalId: input.animalId,
      completionId: one.completionId ?? "",
      weightKg: Number(one.weightKg),
      weighedAt: one.weighedAt,
    });
    if ((note === null) === (one.flaggedNote === null)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(weighIn)
      .set({ flaggedNote: note })
      .where(eq(weighIn.id, one.id));
    if (!one.completionId) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    await (note === null
      ? liftTheDoubt(tx, input.farmId, one.completionId, input.now)
      : askAboutTheWeight(tx, {
          farmId: input.farmId,
          completionId: one.completionId,
          weightKg: Number(one.weightKg),
          note,
          now: input.now,
          eventId: input.eventId,
        }));
  }
};

/**
 * A weighing an Internal Sale was priced from, or the price the Farm took her on at, is what that price says she
 * weighed: put right alone, the sale went on priced at the old figure and nobody was told. The price is put right
 * instead — the Internal Sale's own Correction, the Owner's.
 */
const refuseWhatAPriceRestsOn = async (tx: Tx, weighInId: string) => {
  const sold = await tx.query.internalSale.findFirst({
    where: { weighInId },
    columns: { id: true },
  });
  const joined = sold
    ? undefined
    : await tx.query.fatteningJoining.findFirst({
        where: { weighInId },
        columns: { id: true },
      });
  if (sold || joined) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A price was struck from this weighing; put the sale right instead",
      data: { refusal: "priced_from_this_weighing" },
    });
  }
};

/**
 * Records what one animal weighed on the scale this round.
 *
 * The reading is kept and never overwritten by the next one: the whole of fattening is the
 * difference between two of these. A Correction replaces this Completion's own reading, because
 * that is one weighing however many times it is put right.
 *
 * A jump nobody could have grown is **taken and flagged**, never refused (ADR 0002; story 85
 * names a weight out of range by hand). The barn wrote something down, and a farm that throws it
 * away on the phone's behalf has lost the only record of it — so the reading goes in, what the
 * farm found is kept beside it, and the Manager is asked. Only the farm can catch the jump at
 * all: a phone that has not synced does not know what she weighed a fortnight ago.
 */
const weighHer = async (tx: Tx, input: WeighInFacts): Promise<EffectResult> => {
  // Weighed one at a time (the published Version says so), so the Step names her.
  const animalId = asPublished(input.animalId, "the animal it weighs");
  const standing = await tx.query.weighIn.findFirst({
    where: { completionId: input.completionId },
    columns: { id: true },
  });
  if (standing) {
    await refuseWhatAPriceRestsOn(tx, standing.id);
  }
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
  // late belongs where it happened and is judged against what came before it — and one the farm
  // did not doubt: set against a misweighing, the right figure after it would read as wrong too.
  const flaggedNote = await doubtAbout(tx, {
    farmId: input.instance.farmId,
    animalId,
    completionId: input.completionId,
    weightKg,
    weighedAt,
  });
  const values = {
    farmId: input.instance.farmId,
    animalId,
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
  // In the same transaction as the reading. A doubt whose flag went missing is worse than no doubt at all — the farm
  // would be holding a figure it distrusts and saying nothing. Once for the reading, however often it is put right: the
  // Manager already has it in front of them.
  const alreadyAsked =
    flaggedNote !== null &&
    (await tx.query.needsReview.findFirst({
      where: {
        farmId: input.instance.farmId,
        entity: "weigh_in",
        entityId: input.completionId,
        reason: "implausible_weight",
        resolvedAt: { isNull: true },
      },
      columns: { id: true },
    })) !== undefined;
  if (flaggedNote && !alreadyAsked) {
    // Named, so the notice says whose weighing it doubts.
    const weighed = await tx.query.animal.findFirst({
      where: { id: animalId },
      columns: { tagNumber: true },
    });
    await tell(
      tx,
      input.instance.farmId,
      {
        kind: "needs_review",
        about: {
          id: input.completionId,
          entity: "weigh_in",
          auditEventId: input.eventId,
        },
        facts: {
          reason: "implausible_weight",
          weightKg,
          note: flaggedNote,
          tag: weighed?.tagNumber ?? null,
        },
      },
      input.now
    );
  }
  await judgeHerFirstWeighIn(tx, input, animalId, { weightKg, weighedAt });
  // Every reading after this one was judged against what came before it, this one among them: judged again.
  await judgeAgainAfter(tx, {
    farmId: input.instance.farmId,
    animalId,
    after: weighedAt,
    now: input.now,
    eventId: input.eventId,
  });
  return { kind: "weigh_in", weightKg, flagged: flaggedNote !== null };
};

/** A Step that weighs an animal. */
export const weighInEffect: EffectKind<WeighInFacts> = {
  kind: "weigh_in",
  apply: weighHer,
};
