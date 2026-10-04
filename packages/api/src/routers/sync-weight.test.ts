import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A batch weighs no more than a phone sends (domain phone-limits): a request of photographs piled past it is refused
// before anything in it is read as work.

const heavyPhoto = (seq: number) => ({
  id: `heavy-${seq}`,
  seq,
  recordedAt: new Date("2027-05-01T02:00:00.000Z"),
  kind: "completion_photo" as const,
  completionId: `completion-${seq}`,
  slot: 0,
  contentType: "image/jpeg" as const,
  data: "x".repeat(1_900_000),
});

describe("one batch from a phone", () => {
  it("is refused when it weighs more than a phone ever sends", async () => {
    const { client } = await createTestClient(appRouter, { as: "staff" });
    await expect(
      client.sync.batch({
        key: `too-heavy-${Date.now()}`,
        entries: [heavyPhoto(1), heavyPhoto(2), heavyPhoto(3)],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
