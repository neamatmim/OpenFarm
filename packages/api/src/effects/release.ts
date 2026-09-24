import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import { pensThatSuit } from "../band-store";
import { AS_WEIGHED, weighedAs } from "../feed-store";
import { entersState, loadLiveAnimal, walkByStep } from "../herd-store";
import type { EffectInput, EffectResult, EffectKind } from "./effect";
import { asPublished } from "./evidence";

type ReleaseFacts = Pick<
  EffectInput,
  | "instance"
  | "animalId"
  | "skipped"
  | "completionId"
  | "recordedBy"
  | "recordedAt"
  | "now"
  | "pregnancyTimes"
  | "trail"
>;

/**
 * Lets him out of Quarantine: Fattening from the moment this Step says, and walked to the first Pen whose Ration's
 * Weight Band suits what the scale last said of him — the grower's Pen for a 200 kg bull, the finisher's for a 300 kg
 * one. Where no Pen's band suits him, or the farm has written no bands, he is Fattening where he stands and the
 * Manager moves him.
 *
 * Keyed on him, as drying off is: a bull already out of Quarantine is let out by nobody twice. What it will not do is
 * put him back in Quarantine when the entry is corrected to a skip — what he was, and since when, matters to every
 * State-triggered procedure, and a bull put back would look freshly bought — so he stays out and the Effect stands
 * aside, for the Manager to decide.
 */
const letHimOut = async (
  tx: Tx,
  input: ReleaseFacts
): Promise<EffectResult> => {
  const { farmId } = input.instance;
  // Released one at a time (the published Version says so), so the Step names him.
  const animalId = asPublished(input.animalId, "the animal it releases");
  const him = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: { tagNumber: true },
  });
  if (!him) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  // One who has left the farm cannot be released, whoever is asking.
  const live = await loadLiveAnimal(tx, farmId, him.tagNumber);
  if (input.skipped) {
    // Only an entry that released him has anything to undo: he went Fattening at the moment it was recorded.
    const releasedByThisEntry =
      live.state === "fattening" &&
      live.stateChangedAt.getTime() === input.recordedAt.getTime();
    return releasedByThisEntry
      ? {
          kind: "release",
          released: false,
          toPenId: null,
          standsAside: { because: "cannot_return_to_quarantine" },
        }
      : null;
  }
  if (live.state !== "quarantine") {
    return {
      kind: "release",
      released: false,
      toPenId: null,
      standsAside: null,
    };
  }
  await entersState(tx, farmId, live, {
    state: "fattening",
    at: input.recordedAt,
    now: input.now,
  });
  const weighed = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: { id: true },
    with: AS_WEIGHED,
  });
  const { weightKg } = weighed ? weighedAs(weighed) : { weightKg: null };
  const suits =
    weightKg === null ? [] : await pensThatSuit(tx, farmId, weightKg);
  const toPenId = suits.find((one) => one.penId !== live.penId)?.penId ?? null;
  if (toPenId) {
    await walkByStep(tx, {
      farmId,
      beast: { ...live, state: "fattening" },
      completionId: input.completionId,
      toPenId,
      movedBy: input.recordedBy,
      movedAt: input.recordedAt,
      now: input.now,
      calvingLeadDays: input.pregnancyTimes.calvingLeadDays,
      trail: input.trail,
    });
  }
  return { kind: "release", released: true, toPenId, standsAside: null };
};

/** A Step that lets an animal out of Quarantine. */
export const releaseEffect: EffectKind<ReleaseFacts> = {
  kind: "release",
  apply: letHimOut,
};
