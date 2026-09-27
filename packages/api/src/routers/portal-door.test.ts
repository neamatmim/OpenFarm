import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The portal's door, before anybody signs in: whose portal it is, so the page can name the farm an Investor deals
// with — and nothing at all while the Owner has the portal shut.

const JANUARY = "2058-01-01T04:00:00.000Z";

const as = async (role: "owner" | null) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

describe("the portal's door", () => {
  it("names nobody while the portal is shut", async () => {
    // The farm is there, and its Owner has the portal shut: a farm not made yet would name nobody either way.
    const owner = await as("owner");
    await owner.investors.setPortalOpen({ open: false });
    const nobody = await as(null);
    expect(await nobody.portal.door()).toEqual({ open: false, farmName: null });
  });

  it("names the farm to anybody once the Owner opens it", async () => {
    const owner = await as("owner");
    await owner.investors.setPortalOpen({ open: true });
    const farm = await owner.farm.current();

    const nobody = await as(null);
    expect(await nobody.portal.door()).toEqual({
      open: true,
      farmName: farm?.name,
    });
  });
});
