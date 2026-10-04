import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// How the herd gets back in calf is worked in domain/fertility.ts and tested there; this is who may read it, and that
// it reads a year and a month at a time.

describe("the herd's fertility", () => {
  it("is read by those who breed the herd, a year and each of twelve months", async () => {
    for (const role of ["owner", "manager", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one Role after another
      const { client } = await createTestClient(appRouter, { as: role });
      // oxlint-disable-next-line no-await-in-loop -- one Role after another
      const read = await client.breeding.fertility();
      expect(read.months, role).toHaveLength(12);
      expect(read.year, role).toHaveProperty("calvingIntervalDays");
    }
  });

  it("is not Barn Staff's", async () => {
    const { client } = await createTestClient(appRouter, { as: "staff" });
    await expect(client.breeding.fertility()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
