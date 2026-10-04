import { thePerson } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Shed Phone is the barn's, picked up by whoever is there: it holds Barn Staff and nobody more (the Owner's decision
// of 2026-10-04). Its roster carried every PIN holder's salt and hash, so a phone in the wrong hands could become any
// Manager or Owner with a PIN, and reach what they may do away from their own phone.

describe("a Shed Phone holds Barn Staff", () => {
  it("lists only Barn Staff on its roster, and refuses to switch to anyone else", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await createTestClient(appRouter, { as: "manager" });
    await createTestClient(appRouter, { as: "staff" });
    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "4821",
    });
    await expect(
      owner.client.people.setPin({
        userId: thePerson("manager").id,
        pin: "7314",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const phone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
      locked: true,
    });
    const roster = await phone.client.people.roster();
    expect(roster.map((one) => one.userId)).toEqual([thePerson("staff").id]);
  });

  it("gives whoever is switched in on it the Staff Role alone, whatever else they hold", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      onShedPhone: true,
    });
    expect(manager.context.roles).not.toContain("manager");
    await expect(manager.client.people.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
