import {
  FakeClock,
  createTestPrincipal,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("migrates a scratch database and seeds a Role's person into it", async () => {
    const principal = await createTestPrincipal("vet", new FakeClock().now());

    const row = await scratchDb().query.user.findFirst({
      where: { id: principal.user.id },
    });

    expect(row?.email).toBe(thePerson("vet").email);
  });

  it("seeds the same person only once", async () => {
    const now = new FakeClock().now();

    await createTestPrincipal("owner", now);
    await createTestPrincipal("owner", now);
    const rows = await scratchDb().query.user.findMany({
      where: { id: thePerson("owner").id },
    });

    expect(rows).toHaveLength(1);
  });

  it("names this file's Farm after the file, and the people on it after both", () => {
    expect(theFarm().id).toBe("farm-test-harness");
    expect(thePerson("staff").id).toBe("staff-test-harness");
  });

  it("refuses to hand back a farm when vitest has not said which file is asking", () => {
    // Without a file there is no name to give the farm, and the only thing left to hand back
    // would be one farm for everybody — the thing a farm per file exists to stop.
    const path = expect.getState().testPath;
    try {
      expect.setState({ testPath: undefined });
      expect(() => theFarm()).toThrow(/which file is running/u);
    } finally {
      expect.setState({ testPath: path });
    }
  });
});
