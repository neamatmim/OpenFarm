import { paperText } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The blank the Owner prints to fill in with a new Investor at the first meeting. An Export, as every paper the farm
// hands out is, though nobody is written on it.

describe("the Investor Details Form", () => {
  it("is the Owner's to print, on the farm's letterhead, and is written on the trail as an Export", async () => {
    const owner = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2046-08-01T04:00:00.000Z"),
    });
    const { document } = await owner.client.investors.detailsForm();
    expect(document.letterhead.name).toBe(theFarm().name);
    const en = paperText(document, "en");
    expect(en).toContain("Investor details form");
    expect(en).toContain("NID number: ____________");
    expect(en).toContain("Nominee 3");
    expect(paperText(document, "bn")).toContain("বিনিয়োগকারীর তথ্য ফর্ম");

    const exported = await scratchDb().query.auditEvent.findMany({
      where: { farmId: theFarm().id, entity: "report", action: "export" },
    });
    expect(
      exported.some(
        (event) =>
          (event.after as { report?: string } | null)?.report ===
          "investor_details_form"
      )
    ).toBe(true);
  });

  it("is not the Manager's", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock("2046-08-01T04:00:00.000Z"),
    });
    await expect(manager.client.investors.detailsForm()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
