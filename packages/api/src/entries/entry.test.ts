import { uuidv7 } from "@OpenFarm/db/ids";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import type { Recorder } from "../completion-store";
import { VISITING_VET_REACH } from "../roles";
import { appRouter } from "../routers/index";
import { createTestClient } from "../test/client";
import { claimEntry } from "./claim";
import type { EntryKind } from "./entry";
import { recordHeld } from "./entry";
import { finishEntry } from "./finish";
import { moveEntry } from "./move";
import { observationEntry } from "./observation";
import { stepCompletionEntry } from "./step-completion";
import { stepPhotoEntry } from "./step-photo";

// What every Entry is held to whichever way it comes, rather than what any one of them does.

/** Each Entry and the procedure that records it with signal. */
const PROCEDURES = [
  ["instances.claim", claimEntry],
  ["instances.complete", finishEntry],
  ["instances.completeStep", stepCompletionEntry],
  ["instances.attachPhoto", stepPhotoEntry],
  ["animals.move", moveEntry],
  ["observations.record", observationEntry],
] as const;

describe("a visiting Vet", () => {
  it.each(PROCEDURES)(
    "reaches %s with signal exactly when its Entry says a visit may",
    (path, kind) => {
      expect(VISITING_VET_REACH.has(path)).toBe(kind.visitingVet);
    }
  );

  it("cannot send from a phone's Outbox what their visit does not reach", async () => {
    const at = new Date("2033-09-02T04:00:00.000Z");
    const { context } = await createTestClient(appRouter, {
      as: "vet",
      clock: new FakeClock(at),
    });
    const visiting: Recorder = {
      ...(context as Recorder),
      roles: ["vet"],
      visiting: true,
    };
    // Work a Vet could do on the farm, that a visit does not reach.
    const beyondTheVisit: EntryKind<object, null> = {
      roles: ["vet"],
      visitingVet: false,
      trail: () => ({
        entity: "nothing",
        action: "create",
        entityId: () => "nothing",
        after: () => Promise.resolve(null),
      }),
      apply: () => Promise.resolve(null),
    };

    await expect(
      scratchDb().transaction((tx) =>
        recordHeld(
          tx,
          visiting,
          beyondTheVisit,
          {},
          {
            recordedAt: at,
            receivedAt: at,
            id: uuidv7(at),
            eventId: uuidv7(at),
            device: { id: null, seq: 1 },
          }
        )
      )
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: "visiting_vet" },
    });
  });
});
