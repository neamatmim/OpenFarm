import { INSTANCE_STATES as COLUMN_STATES } from "@OpenFarm/db/schema/instance";
import type { InstanceState, WorkMove } from "@OpenFarm/domain";
import {
  INSTANCE_STATES,
  OPEN_INSTANCE_STATES,
  WORK_MOVES,
  awaitsSignOff,
  isFinished,
  isOpen,
  mayMove,
  stateAfter,
} from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

// What can happen to an SOP Instance from each state it can be in, written out move by move so the rule reads at a
// glance. No database: the rule is about states, and the gaps were where one path allowed what another refused.

/** For each move, what it leaves work in from each state — or "refused". */
const EXPECTED: Record<
  WorkMove,
  Record<InstanceState, InstanceState | "refused">
> = {
  claim: {
    due: "in_progress",
    in_progress: "in_progress",
    sent_back: "in_progress",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  start: {
    due: "in_progress",
    in_progress: "refused",
    sent_back: "in_progress",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  record: {
    due: "due",
    in_progress: "in_progress",
    sent_back: "sent_back",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  finish: {
    due: "refused",
    in_progress: "completed",
    sent_back: "completed",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  assign: {
    due: "due",
    in_progress: "in_progress",
    sent_back: "sent_back",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  approve: {
    due: "refused",
    in_progress: "refused",
    sent_back: "refused",
    completed: "approved",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  sendBack: {
    due: "refused",
    in_progress: "refused",
    sent_back: "refused",
    completed: "sent_back",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  closeAsMissed: {
    due: "missed",
    in_progress: "missed",
    sent_back: "missed",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  callOff: {
    due: "called_off",
    in_progress: "called_off",
    sent_back: "called_off",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "refused",
  },
  raiseAgain: {
    due: "refused",
    in_progress: "refused",
    sent_back: "refused",
    completed: "refused",
    approved: "refused",
    missed: "refused",
    called_off: "due",
  },
};

describe("the moves of an SOP Instance", () => {
  it("knows every state the database keeps", () => {
    expect([...INSTANCE_STATES]).toEqual([...COLUMN_STATES]);
  });

  it.each(Object.keys(WORK_MOVES) as WorkMove[])(
    "%s, from every state",
    (move) => {
      const actual = Object.fromEntries(
        INSTANCE_STATES.map((state) => [
          state,
          mayMove(move, state) ? stateAfter(move, state) : "refused",
        ])
      );
      expect(actual).toEqual(EXPECTED[move]);
    }
  );

  it("counts as open only the work a Step may still be recorded on", () => {
    expect(INSTANCE_STATES.filter((state) => isOpen(state))).toEqual([
      ...OPEN_INSTANCE_STATES,
    ]);
    // Settled, and nobody owes them: neither is late, however long ago they were due.
    expect(isOpen("missed")).toBe(false);
    expect(isOpen("called_off")).toBe(false);
  });

  it("waits for a checker only when the work has one", () => {
    expect(awaitsSignOff({ state: "completed", checkerRole: "manager" })).toBe(
      true
    );
    expect(awaitsSignOff({ state: "completed", checkerRole: null })).toBe(
      false
    );
    expect(awaitsSignOff({ state: "approved", checkerRole: "manager" })).toBe(
      false
    );
    expect(INSTANCE_STATES.filter((state) => isFinished(state))).toEqual([
      "completed",
      "approved",
    ]);
  });
});
