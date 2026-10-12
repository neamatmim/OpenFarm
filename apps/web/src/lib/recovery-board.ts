import type { Completion } from "@/components/work/work-types";

import type { EntryBody, EntryDraft } from "./outbox";
import type { StepAnswer } from "./step-answer";

export interface RecoveryBoard {
  id: string;
  animals: { id: string; tagNumber: string }[];
  completions: Completion[];
}

/** The same saved answer prefills the recovery form and appears on the offline board after it is durably queued. */
export const completionForAnswer = (
  id: string,
  stepId: string,
  animalId: string | null,
  answer: StepAnswer
): Completion => ({
  id,
  stepId,
  animalId,
  status: answer.skipReason ? "skipped" : "done",
  skipReason: answer.skipReason ?? null,
  evidence: answer.evidence ?? [],
  destination: answer.destination ?? null,
  outOfRange: answer.outOfRange ?? null,
  facts: {
    feeding: answer.feeding?.map((line) => ({
      ...line,
      leftoverKg: line.leftoverKg ?? 0,
    })),
    counts: answer.counts,
    medicineCounts: answer.medicineCounts,
    renewal: answer.renewal
      ? { expiresOn: answer.renewal.expiresOn }
      : undefined,
  },
});

const recoveredStep = (
  board: RecoveryBoard,
  originalId: string,
  replacementId: string,
  body: EntryBody<"step_completion">
): RecoveryBoard => {
  if (board.id !== body.instanceId) {
    return board;
  }
  const animal = body.animalTag
    ? board.animals.find((one) => one.tagNumber === body.animalTag)
    : null;
  if (body.animalTag && !animal) {
    return board;
  }
  const animalId = animal?.id ?? null;
  const occupied = board.completions.find(
    (one) => one.stepId === body.stepId && one.animalId === animalId
  );
  if (occupied && occupied.id !== originalId && occupied.id !== replacementId) {
    return board;
  }
  const shown = completionForAnswer(replacementId, body.stepId, animalId, body);
  return {
    ...board,
    completions: [
      ...board.completions.filter(
        (one) => one.id !== originalId && one.id !== replacementId
      ),
      shown,
    ],
  };
};

const recoveredCorrection = (
  board: RecoveryBoard,
  body: EntryBody<"step_correction">
): RecoveryBoard => {
  const change = body.changes?.answer;
  const target = board.completions.find((one) => one.id === body.completionId);
  if (!change || !target) {
    return board;
  }
  const current = {
    skipReason: target.skipReason,
    evidence: target.evidence,
    destination: target.destination,
    outOfRange: target.outOfRange,
    ...target.facts,
  };
  if (JSON.stringify(current) !== JSON.stringify(change.from)) {
    return board;
  }
  const { to } = change;
  const corrected = {
    ...target,
    ...completionForAnswer(target.id, target.stepId, target.animalId, {
      ...target.facts,
      ...to,
      destination: to.destination ?? target.destination ?? undefined,
    }),
  };
  return {
    ...board,
    completions: board.completions.map((one) =>
      one.id === target.id ? corrected : one
    ),
  };
};

/** Existing accepted work and a record changed since the editor opened take precedence over proposed recovery. */
export const recoveryOnBoard = (
  board: RecoveryBoard | undefined,
  originalId: string,
  replacementId: string,
  draft: EntryDraft
): RecoveryBoard | undefined => {
  if (!board) {
    return board;
  }
  if (draft.kind === "step_completion") {
    return recoveredStep(board, originalId, replacementId, draft.body);
  }
  if (draft.kind === "step_correction") {
    return recoveredCorrection(board, draft.body);
  }
  return board;
};
