import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// How long a Shed Phone sits untouched before it locks is the farm's to say: five minutes is gone before one cow is
// milked by hand, and the milker is asked for a PIN again mid-cow.

describe("how long a Shed Phone waits before it locks", () => {
  it("is set by those who run the farm, between a minute and an hour, and is what the phone is told", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    await manager.client.farm.setParameters({ pinAutoLockMinutes: 15 });
    await expect(
      manager.client.farm.setParameters({ pinAutoLockMinutes: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      manager.client.farm.setParameters({ pinAutoLockMinutes: 61 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const phone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
    });
    const told = await phone.client.devices.current();
    expect(told.autoLockMinutes).toBe(15);
  });
});
