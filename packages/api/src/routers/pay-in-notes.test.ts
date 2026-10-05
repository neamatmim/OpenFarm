import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Pay-in Note: an Investor's word, from the portal, that they sent money towards one of their Agreements, for the
// Owner to check against the Venture Account (ADR 0018). It moves no money. Behind the farm's switch, which is off until
// the Owner turns it on.

const JANUARY = "2094-01-01T04:00:00.000Z";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

describe("the switch", () => {
  it("is off until the Owner turns it on, and off again when they turn it off", async () => {
    // A client reads the farm once, when it is made: each read is asked by a fresh one, as a fresh request would be.
    const switchedOn = async () => {
      const owner = await as("owner");
      const listed = await owner.investors.list();
      return listed.payInNotes;
    };
    const turn = async (shown: boolean) => {
      const owner = await as("owner");
      await owner.investors.setPayInNotes({ shown });
    };
    expect(await switchedOn()).toBe(false);
    await turn(true);
    expect(await switchedOn()).toBe(true);
    await turn(false);
    expect(await switchedOn()).toBe(false);
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager");
    await expect(
      manager.investors.setPayInNotes({ shown: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
