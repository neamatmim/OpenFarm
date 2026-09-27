import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The farm's own doors — its sign-in and a Shed Phone's — name the farm to anybody before they sign in, as every
// paper it prints does. Nothing is named before the farm is set up.

const JANUARY = "2059-01-01T04:00:00.000Z";

const as = async (role: "owner" | null) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

describe("the farm's door", () => {
  // First in the file: nobody has set this file's farm up yet.
  it("names nobody before there is a farm", async () => {
    const nobody = await as(null);
    expect(await nobody.farm.door()).toEqual({ farmName: null });
  });

  it("names the farm to anybody, signed in or not", async () => {
    const owner = await as("owner");
    const farm = await owner.farm.current();
    const nobody = await as(null);
    expect(await nobody.farm.door()).toEqual({ farmName: farm?.name });
  });
});
