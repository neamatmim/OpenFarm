import type { orpc } from "@/utils/orpc";

import type { StepRecord } from "./record-offline";

type CompleteStep = Parameters<typeof orpc.instances.completeStep.call>[0];
type CorrectStep = Parameters<typeof orpc.instances.correctStep.call>[0];

/**
 * What a person answers at a Step on the pen board: the Evidence, a skip and its reason, the warning they went past,
 * where the milk went, what went out to the Pen, what the store counted, the Registration renewed, the photographs —
 * and, for one already recorded, why it is being put right.
 */
export type StepAnswer = Pick<
  StepRecord,
  | "evidence"
  | "skipReason"
  | "outOfRange"
  | "destination"
  | "feeding"
  | "counts"
  | "photos"
> & {
  /** The new expiry, issue date and certificate, for the Step that renews the Registration. */
  renewal?: CompleteStep["renewal"];
  /** Why a recorded answer is being put right: a Correction carries one, and a new answer has nothing to explain. */
  reason?: string;
};

/** An answer already recorded, as the board shows it — which is what a Correction says it was shown. */
export interface RecordedAnswer {
  id: string;
  skipReason: string | null;
  evidence: NonNullable<StepRecord["evidence"]>;
  destination: NonNullable<StepRecord["destination"]> | null;
  outOfRange: string | null;
  /** What the Step's Effect recorded beside its Evidence — the feed given, the store counted — as it was shown. */
  facts: object;
}

/** Where an answer goes, and what it goes as. */
export type AnswerJourney =
  | { by: "correction"; input: CorrectStep }
  | { by: "renewal"; input: CompleteStep }
  | { by: "outbox"; input: StepRecord };

/**
 * Where a Step's answer goes: a recorded one given a reason is put right as a Correction — from what was recorded, to
 * everything the answer now says; a renewal goes online as it is taken, since a certificate's photograph is not
 * something to hold in a shed phone's queue; anything else goes into the Outbox, the way a barn phone has to record.
 *
 * The Correction's new answer is the answer itself, not a list of its facts written out again, so a fact a Step
 * learns to record is put right with the rest. Its photographs stay as they were: a Correction does not replace one.
 */
export const journeyOf = (
  answer: StepAnswer,
  where: {
    instanceId: string;
    stepId: string;
    /** The animal the answer is for, by her tag, on a Step done at each animal in turn. */
    animalTag?: string;
    animalId: string | null;
    recorded?: RecordedAnswer;
  }
): AnswerJourney => {
  const { recorded } = where;
  const { photos: _notCorrected, reason, ...said } = answer;
  if (recorded && reason) {
    return {
      by: "correction",
      input: {
        id: recorded.id,
        changes: {
          answer: {
            from: {
              skipReason: recorded.skipReason,
              evidence: recorded.evidence,
              destination: recorded.destination,
              outOfRange: recorded.outOfRange,
              ...recorded.facts,
            },
            to: said,
          },
        },
        reason,
      },
    };
  }
  if (answer.renewal) {
    return {
      by: "renewal",
      input: {
        instanceId: where.instanceId,
        stepId: where.stepId,
        evidence: answer.evidence,
        renewal: answer.renewal,
      },
    };
  }
  const { reason: _forCorrections, renewal: _online, ...recording } = answer;
  return {
    by: "outbox",
    input: {
      instanceId: where.instanceId,
      stepId: where.stepId,
      animalTag: where.animalTag,
      animalId: where.animalTag ? where.animalId : null,
      ...recording,
    },
  };
};
