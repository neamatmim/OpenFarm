import {
  FakeClock,
  createTestPrincipal,
  scratchDb,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("migrates a scratch database and seeds a Role's person into it", async () => {
    const principal = await createTestPrincipal("vet", new FakeClock().now());

    const row = await scratchDb().query.user.findFirst({
      where: { id: principal.user.id },
    });

    expect(row?.email).toBe("vet@test.openfarm");
  });

  it("seeds the same person only once", async () => {
    const now = new FakeClock().now();

    await createTestPrincipal("owner", now);
    await createTestPrincipal("owner", now);
    const rows = await scratchDb().query.user.findMany({
      where: { id: "test-owner" },
    });

    expect(rows).toHaveLength(1);
  });
});
