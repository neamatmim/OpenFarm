import { uuidv7 } from "@OpenFarm/db/ids";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import type { Recorder } from "../completion-store";
import { isLate } from "../late";
import { appRouter } from "../routers/index";
import { createTestClient } from "../test/client";
import { recordHeld } from "./entry";
import { stepCompletionEntry } from "./step-completion";

// What the Step Completion Entry does that its parity case cannot show: the one Step that has no business in a phone's
// Outbox.

describe("a Step a phone held", () => {
  it("is refused when it renews the Registration, which is the Owner's own act with signal", async () => {
    const at = new Date("2033-09-01T04:00:00.000Z");
    const { context } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(at),
    });

    const held = scratchDb().transaction((tx) =>
      recordHeld(
        tx,
        context as Recorder,
        stepCompletionEntry,
        {
          instanceId: "any-work",
          stepId: "renew",
          evidence: [true],
          renewal: { expiresOn: "2034-03-31" },
        },
        {
          recordedAt: at,
          receivedAt: at,
          id: uuidv7(at),
          eventId: uuidv7(at),
          device: { id: null, seq: 1 },
        }
      )
    );

    // Wrong rather than late: nothing moved under it, and it should never have been queued.
    const refusal = await held.catch((error: unknown) => error);
    expect(refusal).toMatchObject({ code: "BAD_REQUEST" });
    expect(isLate(refusal)).toBe(false);
  });

  it("is refused from a shared Shed Phone even with signal, when it renews the Registration", async () => {
    const { client } = await createTestClient(appRouter, {
      as: "staff",
      clock: new FakeClock("2033-09-01T04:00:00.000Z"),
      onShedPhone: true,
      phone: { id: "test-phone-renewal", name: "নবায়নের শেড ফোন" },
    });

    await expect(
      client.instances.completeStep({
        instanceId: "any-work",
        stepId: "renew",
        evidence: [true],
        renewal: { expiresOn: "2034-03-31" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
