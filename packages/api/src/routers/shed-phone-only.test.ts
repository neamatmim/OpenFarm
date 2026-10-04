import { createAuth } from "@OpenFarm/auth";
import { scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Barn Staff cannot be assumed to own a phone, and work on the farm's Shed Phones by PIN (ADR 0003). One with no email
 * is added by name and works there alone: no login, no password, nobody able to sign up as them. The Owner's word adds
 * them at once; a Manager's waits for the Owner, as a Manager's invitation does.
 */
const suffix = `shed-only-${Date.now()}`;

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, { as: role });

const aShedPhone = () =>
  createTestClient(appRouter, { as: "staff", onShedPhone: true, locked: true });

describe("Barn Staff who work only on a Shed Phone", () => {
  it("are added by the Owner by name, and switch in on a Shed Phone with their PIN", async () => {
    const owner = await as("owner");
    const added = await owner.client.people.addForShedPhones({
      name: `রফিক ${suffix}`,
    });
    expect(added.status).toBe("approved");
    const { people } = await owner.client.people.list();
    expect(people.find((one) => one.id === added.userId)).toMatchObject({
      name: `রফিক ${suffix}`,
      roles: ["staff"],
      shedPhoneOnly: true,
    });

    await owner.client.people.setPin({ userId: added.userId, pin: "5932" });
    const phone = await aShedPhone();
    const roster = await phone.client.people.roster();
    expect(roster.map((one) => one.userId)).toContain(added.userId);
    await expect(
      phone.client.devices.switchUser({ userId: added.userId, pin: "5932" })
    ).resolves.toMatchObject({ name: `রফিক ${suffix}` });
  });

  it("added by a Manager, wait for the Owner before they work", async () => {
    const manager = await as("manager");
    const added = await manager.client.people.addForShedPhones({
      name: `সুমন ${suffix}`,
    });
    expect(added.status).toBe("pending");
    // Not one of the farm's people yet: no PIN, nothing on the phone.
    await expect(
      manager.client.people.setPin({ userId: added.userId, pin: "6041" })
    ).rejects.toMatchObject({ message: "That person is not on this farm" });

    const owner = await as("owner");
    const { pendingInvites } = await owner.client.people.list();
    expect(
      pendingInvites.find((one) => one.id === added.inviteId)
    ).toMatchObject({
      name: `সুমন ${suffix}`,
      shedPhoneOnly: true,
    });
    await owner.client.people.approveInvite({ id: added.inviteId });

    await manager.client.people.setPin({ userId: added.userId, pin: "6041" });
    const phone = await aShedPhone();
    await expect(
      phone.client.devices.switchUser({ userId: added.userId, pin: "6041" })
    ).resolves.toMatchObject({ name: `সুমন ${suffix}` });
  });

  it("have no login: never a password code, and nobody signs up as them", async () => {
    const owner = await as("owner");
    const added = await owner.client.people.addForShedPhones({
      name: `জসিম ${suffix}`,
    });
    await expect(
      owner.client.people.newPasswordCode({ userId: added.userId })
    ).rejects.toMatchObject({ data: { refusal: "shed_phone_only" } });

    // Nor under the address of one a Manager added, whose invitation still waits for the Owner.
    const manager = await as("manager");
    const waiting = await manager.client.people.addForShedPhones({
      name: `বাবুল ${suffix}`,
    });
    for (const userId of [added.userId, waiting.userId]) {
      // oxlint-disable-next-line no-await-in-loop -- one address at a time
      const person = await scratchDb().query.user.findFirst({
        where: { id: userId },
        columns: { email: true },
      });
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        createAuth(scratchDb()).api.signUpEmail({
          body: {
            name: "somebody",
            email: person?.email ?? "",
            password: "a-long-password-1234",
          },
        })
      ).rejects.toMatchObject({ status: "FORBIDDEN" });
    }
  });

  it("are the Owner's and the Manager's to add, and nobody else's", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    await expect(
      staff.client.people.addForShedPhones({ name: `কেউ ${suffix}` })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
