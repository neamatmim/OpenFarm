import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { weaning } from "@OpenFarm/db/schema/breeding";
import { STAYS_A_HEIFER } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import { AS_WEIGHED, weighedAs } from "../feed-store";
import { entersState, loadLiveAnimal, requirePen, walkTo } from "../herd-store";
import type { EffectInput, EffectResult, EffectKind } from "./effect";
import { asPublished, choiceIn } from "./evidence";

type WeanFacts = Pick<
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
  | "pregnancyTimes"
  | "trail"
>;

/** A weaning that did nothing: she was weaned already, or is no calf now. */
const NOTHING_WEANED = {
  kind: "wean" as const,
  weaned: false,
  to: null,
  toPenId: null,
  standsAside: null,
};

/**
 * Weans her (**Weaning**): a heifer calf becomes a Heifer on the Dairy side, and a bull calf — or any calf the farm
 * means to fatten — is walked across to the Fattening Pen the Step names, which starts his fattening story there, his
 * Days on Feed from this moment. What she weighed is her latest Weigh-in, which the Step before takes.
 *
 * Keyed on her and on the Step: a calf is weaned once. What it will not do is un-wean her when the entry is corrected to
 * a skip — a Heifer put back a calf, or a bull walked back from Fattening, would undo a Season and the State every
 * procedure counts from — so she stays weaned and the Effect stands aside, for the Manager to decide.
 */
const weanHer = async (tx: Tx, input: WeanFacts): Promise<EffectResult> => {
  const { farmId } = input.instance;
  // Weaned one at a time (the published Version says so), so the Step names her.
  const animalId = asPublished(input.animalId, "the calf it weans");
  const her = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: { tagNumber: true, sex: true },
  });
  if (!her) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  const live = await loadLiveAnimal(tx, farmId, her.tagNumber);
  const already = await tx.query.weaning.findFirst({
    where: { farmId, animalId },
    columns: { completionId: true },
  });
  if (input.skipped) {
    return already?.completionId === input.completionId
      ? { ...NOTHING_WEANED, standsAside: { because: "cannot_unwean" } }
      : null;
  }
  if (already || live.state !== "calf") {
    return NOTHING_WEANED;
  }
  const chosen = choiceIn(
    input.step,
    input.evidence,
    "This step weans a calf, and where she goes was not chosen"
  ).value;
  const weighed = await tx.query.animal.findFirst({
    where: { id: animalId, farmId },
    columns: { id: true },
    with: AS_WEIGHED,
  });
  const { weightKg } = weighed ? weighedAs(weighed) : { weightKg: null };
  const stays = chosen === STAYS_A_HEIFER;
  if (stays && her.sex !== "female") {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A bull calf does not stay as a heifer; choose his fattening pen",
      data: { refusal: "a_bull_calf_is_no_heifer" },
    });
  }
  if (stays) {
    await entersState(tx, farmId, live, {
      state: "heifer",
      at: input.recordedAt,
      now: input.now,
      trail: input.trail,
    });
  } else {
    await requirePen(tx, farmId, chosen);
    await walkTo(tx, {
      farmId,
      beast: live,
      toPenId: chosen,
      toSide: "fattening",
      reason: "weaned",
      completionId: input.completionId,
      movedBy: input.recordedBy,
      movedAt: input.recordedAt,
      now: input.now,
      calvingLeadDays: input.pregnancyTimes.calvingLeadDays,
      trail: input.trail,
    });
  }
  const to = stays ? "dairy" : "fattening";
  await tx.insert(weaning).values({
    id: newId(input.now),
    farmId,
    animalId,
    weanedAt: input.recordedAt,
    weightKg: weightKg === null ? null : weightKg.toFixed(2),
    to,
    completionId: input.completionId,
    recordedBy: input.recordedBy,
    createdAt: input.now,
  });
  return {
    kind: "wean",
    weaned: true,
    to,
    toPenId: stays ? null : chosen,
    standsAside: null,
  };
};

/** A Step that weans a calf. */
export const weanEffect: EffectKind<WeanFacts> = {
  kind: "wean",
  apply: weanHer,
};
