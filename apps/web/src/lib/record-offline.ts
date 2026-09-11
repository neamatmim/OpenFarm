import type { QueryClient } from "@tanstack/react-query";

import { phoneOutbox } from "./outbox-client";

/** A Completion as the pen board reads it back, before the farm has seen it. */
interface OptimisticCompletion {
  id: string;
  stepId: string;
  animalId: string | null;
  status: string;
  skipReason: string | null;
  evidence: unknown;
  destination: string | null;
}

export interface StepRecord {
  instanceId: string;
  stepId: string;
  animalTag?: string;
  animalId?: string | null;
  evidence: (boolean | number | string)[];
  destination?: "bulk" | "calves" | "discard";
  outOfRange?: string;
  skipReason?: string;
  /** Taken in the shed, and travelling with the entry it is evidence for. */
  photo?: {
    contentType: "image/jpeg" | "image/png" | "image/webp";
    data: string;
  };
}

/** The queue, or a refusal. A device with no storage at all cannot be trusted with a
 *  morning's work, and saying so is better than appearing to take it. */
const held = () => {
  const outbox = phoneOutbox();
  if (!outbox) {
    throw new Error("This device cannot keep work; nothing was recorded");
  }
  return outbox;
};

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Records a Step the way a barn phone has to: into the Outbox first, then onto the screen.
 *
 * The order is the whole point. A person in a shed with no signal taps Done, and the work is
 * on the device before the tile turns green — so if the app is closed, the battery goes, or
 * the phone spends the rest of the day out of range, the morning's milking is still there
 * when it comes back (ADR 0002).
 */
export const recordStep = async (
  queryClient: QueryClient,
  instanceKey: readonly unknown[],
  record: StepRecord
): Promise<string> => {
  const id = newId();
  const { instanceId, animalId, ...body } = record;
  // The queue first, and if there is no queue there is nothing to record into: a tile that
  // turns green over work nothing is holding is the one failure this whole file exists to
  // prevent.
  await held().add("step_completion", { instanceId, ...body }, id);

  // Now the screen. The Completion the farm will write is not here yet, so the board shows
  // what the person just did, keyed on the same id the farm will use.
  const optimistic: OptimisticCompletion = {
    id,
    stepId: record.stepId,
    animalId: animalId ?? null,
    status: record.skipReason ? "skipped" : "done",
    skipReason: record.skipReason ?? null,
    evidence: record.evidence,
    destination: record.destination ?? null,
  };
  queryClient.setQueryData(
    instanceKey,
    (current: { completions?: OptimisticCompletion[] } | undefined) => {
      if (!current) {
        return current;
      }
      const others = (current.completions ?? []).filter(
        (row) =>
          !(
            row.stepId === optimistic.stepId &&
            row.animalId === optimistic.animalId
          )
      );
      return { ...current, completions: [...others, optimistic] };
    }
  );
  return id;
};

/**
 * Takes the Instance, on the device first. A milker in a shed with no signal still has to be
 * able to start: the claim travels ahead of the work it covers, and the farm settles who
 * actually had it when the phone gets back in range.
 */
export const claimInstance = async (
  queryClient: QueryClient,
  instanceKey: readonly unknown[],
  instanceId: string
): Promise<void> => {
  await held().add("instance_claim", { instanceId }, newId());
  queryClient.setQueryData(
    instanceKey,
    (current: { state?: string } | undefined) =>
      current ? { ...current, state: "in_progress" } : current
  );
};

/** Finishes it, the same way. The farm checks the Pen again when the entry lands — a cow may
 *  have joined it since the phone last saw it. */
export const finishInstance = async (
  queryClient: QueryClient,
  instanceKey: readonly unknown[],
  instanceId: string
): Promise<void> => {
  await held().add("instance_complete", { instanceId }, newId());
  queryClient.setQueryData(
    instanceKey,
    (current: { state?: string } | undefined) =>
      current ? { ...current, state: "completed" } : current
  );
};
