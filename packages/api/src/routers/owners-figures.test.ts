import { user } from "@OpenFarm/db/schema/auth";
import { investorLoginOf } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// What is the Owner's alone to read stays the Owner's by every door: the farm's settings, the audit trail, the
// People list and the feed list, not only the page that shows it.

const suffix = `owners-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff" | "vet") =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock("2096-03-01T04:00:00.000Z"),
  });

/** The figures the Manager's own work is checked against, and what the Owner judges a kilo fetches. */
const OWNERS_FIGURES = [
  "marketLowMoneyPerKg",
  "marketHighMoneyPerKg",
  "cashShortTellMoney",
  "medicineShortTellMoney",
  "storeShortfallTellMoney",
] as const;

describe("what is the Owner's alone to read", () => {
  it("leaves the market price and the lines the Manager is checked against out of the farm everybody else reads", async () => {
    const owner = await as("owner");
    await owner.client.fattening.setMarketPrice({
      lowMoneyPerKg: 480,
      highMoneyPerKg: 540,
    });
    await owner.client.farm.setParameters({ cashShortTellMoney: 3000 });
    // A request reads the farm as it stands when it begins, so the Owner asks again.
    const again = await as("owner");
    const theirs = await again.client.farm.current();
    expect(theirs).toMatchObject({
      marketLowMoneyPerKg: 480,
      cashShortTellMoney: 3000,
    });

    for (const role of ["manager", "staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one Role after another
      const reader = await as(role);
      // oxlint-disable-next-line no-await-in-loop -- one Role after another
      const read = await reader.client.farm.current();
      for (const field of OWNERS_FIGURES) {
        expect(read, `${role} reads ${field}`).not.toHaveProperty(field);
      }
    }
  });

  it("keeps the Owner's figures out of the trail the Manager reads, whatever its entity", async () => {
    const owner = await as("owner");
    await owner.client.fattening.setMarketPrice({
      lowMoneyPerKg: 490,
      highMoneyPerKg: 550,
    });
    await owner.client.farm.setParameters({ medicineShortTellMoney: 1500 });
    await owner.client.returns.setBankRate({
      perYear: 8,
      note: `মুদারাবা ${suffix}`,
      fromDay: "2096-03-01",
    });

    const manager = await as("manager");
    const farm = await manager.client.audit.list({ entity: "farm" });
    const said = JSON.stringify(farm.map((row) => [row.before, row.after]));
    for (const field of OWNERS_FIGURES) {
      expect(said).not.toContain(field);
    }
    expect(await manager.client.audit.list({ entity: "bank_rate" })).toEqual(
      []
    );
    const everything = await manager.client.audit.list({ limit: 200 });
    expect(everything.map((row) => row.entity)).not.toContain("bank_rate");

    // The Owner reads them all.
    const theirs = await owner.client.audit.list({ entity: "farm" });
    expect(JSON.stringify(theirs.map((row) => row.after))).toContain(
      "marketLowMoneyPerKg"
    );
  });

  it("lists the farm's own people to the Manager, not the Investors who sign in to the portal", async () => {
    const login = investorLoginOf("01711000096") ?? "";
    await scratchDb()
      .insert(user)
      .values({
        id: `investor-${suffix}`,
        name: `বিনিয়োগকারী ${suffix}`,
        email: login,
        emailVerified: false,
      });

    const manager = await as("manager");
    const listed = await manager.client.people.list();
    expect(listed.people.map((one) => one.email)).not.toContain(login);
    // Those who work here are still on it.
    expect(listed.people.length).toBeGreaterThan(0);
  });

  it("gives Barn Staff and the Vet the feed list without what a kilo of fodder is worth", async () => {
    const owner = await as("owner");
    const grass = await owner.client.feed.items.create({
      name: { bn: `নেপিয়ার ${suffix}` },
    });
    await owner.client.feed.items.setFodderPrice({
      feedItemId: grass.id,
      fodderPriceMoney: 4,
    });

    for (const role of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one Role after another
      const reader = await as(role);
      // oxlint-disable-next-line no-await-in-loop -- one Role after another
      const items = await reader.client.feed.items.list();
      const theirs = items.find((one) => one.id === grass.id);
      expect(theirs, role).toBeDefined();
      expect(theirs, role).not.toHaveProperty("fodderPriceMoney");
    }
    const manager = await as("manager");
    const items = await manager.client.feed.items.list();
    expect(items.find((one) => one.id === grass.id)).toMatchObject({
      fodderPriceMoney: 4,
    });
  });
});
