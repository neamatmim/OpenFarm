import { describe, expect, it } from "vitest";

import type { EntryDraft } from "./outbox";
import type { RecoveryBoard } from "./recovery-board";
import { recoveryOnBoard } from "./recovery-board";

const board = (id = "refused", liters = 11): RecoveryBoard => ({
  id: "work",
  animals: [{ id: "cow", tagNumber: "D-0001" }],
  completions: [
    {
      id,
      stepId: "milk",
      animalId: "cow",
      status: "done",
      skipReason: null,
      evidence: [liters],
      destination: "discard",
      outOfRange: null,
      facts: {},
    },
  ],
});
const replacement: EntryDraft = {
  kind: "step_completion",
  body: {
    instanceId: "work",
    stepId: "milk",
    animalTag: "D-0001",
    evidence: [1.1],
    destination: "discard",
  },
};
const correction: EntryDraft = {
  kind: "step_correction",
  body: {
    completionId: "accepted",
    reason: "wrong figure",
    changes: {
      answer: {
        from: {
          skipReason: null,
          evidence: [11],
          destination: "discard",
          outOfRange: null,
        },
        to: { evidence: [1.1], destination: "discard" },
      },
    },
  },
};

describe("showing recovery on the offline work board", () => {
  it("replaces the refused optimistic completion, using the new durable identity and edited figure", () => {
    const changed = recoveryOnBoard(
      board(),
      "refused",
      "replacement",
      replacement
    );
    expect(changed?.completions).toMatchObject([
      { id: "replacement", evidence: [1.1], destination: "discard" },
    ]);
  });

  it("keeps an accepted answer in the same slot, rather than painting it over with a proposed replacement", () => {
    const accepted = board("accepted", 9);
    expect(
      recoveryOnBoard(accepted, "refused", "replacement", replacement)
    ).toBe(accepted);
  });

  it("adds a recovered answer after the cache has been refreshed to the farm's unfinished board", () => {
    const empty = { ...board(), completions: [] };
    expect(
      recoveryOnBoard(empty, "refused", "replacement", replacement)?.completions
    ).toMatchObject([{ id: "replacement", evidence: [1.1] }]);
  });

  it("shows a queued correction only against the same current answer the editor showed", () => {
    expect(
      recoveryOnBoard(
        board("accepted"),
        "refused-correction",
        "new-correction",
        correction
      )?.completions
    ).toMatchObject([{ id: "accepted", evidence: [1.1] }]);
    const newer = board("accepted", 9);
    expect(
      recoveryOnBoard(newer, "refused-correction", "new-correction", correction)
    ).toBe(newer);
  });

  it("leaves unrelated work alone", () => {
    const unrelated = { ...board(), id: "other-work" };
    expect(
      recoveryOnBoard(unrelated, "refused", "replacement", replacement)
    ).toBe(unrelated);
  });
});
