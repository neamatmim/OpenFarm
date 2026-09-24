import { describe, expect, it } from "vitest";

import type { RecordedAnswer, StepAnswer } from "./step-answer";
import { journeyOf } from "./step-answer";

const WHERE = { instanceId: "work-1", stepId: "feed", animalId: null };

/** What a Pen was fed at a Step, as the board recorded it. */
const RECORDED: RecordedAnswer = {
  id: "done-1",
  skipReason: null,
  evidence: [true],
  destination: null,
  outOfRange: null,
  facts: { feeding: [{ feedItemId: "hay", givenKg: 40, leftoverKg: 0 }] },
};

describe("a Step's answer", () => {
  it("put right, goes from what was recorded to everything it now says — every fact, not a list of some", () => {
    const answer: StepAnswer = {
      evidence: [true],
      feeding: [{ feedItemId: "hay", givenKg: 35, leftoverKg: 2 }],
      counts: [{ feedItemId: "hay", counted: 120 }],
      outOfRange: "over",
      photos: [{ slot: 0, contentType: "image/jpeg", data: "aGk=" }],
      reason: "ভুল ওজন লেখা হয়েছিল",
    };

    const journey = journeyOf(answer, { ...WHERE, recorded: RECORDED });

    expect(journey.by).toBe("correction");
    if (journey.by !== "correction") {
      return;
    }
    expect(journey.input.reason).toBe("ভুল ওজন লেখা হয়েছিল");
    expect(journey.input.changes?.answer?.from).toMatchObject({
      evidence: [true],
      feeding: [{ feedItemId: "hay", givenKg: 40, leftoverKg: 0 }],
    });
    // Every fact the answer holds, and neither the photograph — a Correction keeps the one it has — nor the reason.
    expect(journey.input.changes?.answer?.to).toEqual({
      evidence: [true],
      feeding: [{ feedItemId: "hay", givenKg: 35, leftoverKg: 2 }],
      counts: [{ feedItemId: "hay", counted: 120 }],
      outOfRange: "over",
    });
  });

  it("recorded but with no reason is recorded again, not put right", () => {
    const journey = journeyOf(
      { evidence: [true] },
      { ...WHERE, recorded: RECORDED }
    );

    expect(journey.by).toBe("outbox");
  });

  it("renewing the Registration goes online as it is taken", () => {
    const journey = journeyOf(
      { evidence: [true], renewal: { expiresOn: "2027-06-30" } },
      WHERE
    );

    expect(journey).toEqual({
      by: "renewal",
      input: {
        instanceId: "work-1",
        stepId: "feed",
        evidence: [true],
        renewal: { expiresOn: "2027-06-30" },
      },
    });
  });

  it("anything else goes into the Outbox, for the animal it names or for none", () => {
    const forHer = journeyOf(
      { evidence: [12], destination: "bulk" },
      { ...WHERE, animalTag: "D-0012", animalId: "cow-12" }
    );
    const forThePen = journeyOf(
      { evidence: [true] },
      { ...WHERE, animalId: "cow-12" }
    );

    expect(forHer).toEqual({
      by: "outbox",
      input: {
        instanceId: "work-1",
        stepId: "feed",
        animalTag: "D-0012",
        animalId: "cow-12",
        evidence: [12],
        destination: "bulk",
      },
    });
    expect(forThePen.by === "outbox" && forThePen.input.animalId).toBeNull();
  });
});
