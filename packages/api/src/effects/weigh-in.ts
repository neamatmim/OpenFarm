import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { weighIn } from "@OpenFarm/db/schema/fattening";
import { KG_DECIMALS, implausibleChange, roundKg } from "@OpenFarm/domain";

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
      animalId,
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
        facts: { reason: "implausible_weight", weightKg, note: flaggedNote },
      },
      input.now
    );
  }
  return { kind: "weigh_in", weightKg, flagged: flaggedNote !== null };
};

/** A Step that weighs an animal. */
export const weighInEffect: EffectKind<WeighInFacts> = {
  kind: "weigh_in",
  apply: weighHer,
};
