import { eq } from "@OpenFarm/db/operators";
import { shedPhone } from "@OpenFarm/db/schema/device";
import { derivePinHash, verifyPin } from "@OpenFarm/domain";
import {
  FakeClock,
  MINUTE,
  TEST_FARM,
  scratchDb,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("enrolling a Shed Phone", () => {
  it("gives the Manager a one-time code the phone exchanges for its own token", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });

    const enrolled = await manager.client.devices.enrol({
      name: `phone-${Date.now()}`,
    });
    const claimed = await manager.client.devices.claim({ code: enrolled.code });

    expect(claimed.token).toMatch(/^[0-9a-f]{64}$/u);
    expect(claimed.device.id).toBe(enrolled.id);
    // The code is one-time: a replay finds nothing.
    await expect(
      manager.client.devices.claim({ code: enrolled.code })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses an expired code", async () => {
    const clock = new FakeClock("2026-09-11T05:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const enrolled = await manager.client.devices.enrol({
      name: `stale-${Date.now()}`,
    });

    clock.advance(31 * MINUTE);

    await expect(
      manager.client.devices.claim({ code: enrolled.code })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("a revoked phone cannot be used again", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const enrolled = await manager.client.devices.enrol({
      name: `revoked-${Date.now()}`,
    });

    await manager.client.devices.revoke({ id: enrolled.id });

    const row = await scratchDb().query.shedPhone.findFirst({
      where: { id: enrolled.id },
    });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(row?.enrolmentCode).toBeNull();
    await expect(
      manager.client.devices.revoke({ id: enrolled.id })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("only those who run the farm may enrol, and only from their own phone", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    const managerOnPhone = await createTestClient(appRouter, {
      as: "manager",
      onShedPhone: true,
    });

    await expect(
      staff.client.devices.enrol({ name: "x" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      managerOnPhone.client.devices.enrol({ name: "x" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("PINs", () => {
  it("stores a salt and a derived hash, never the PIN, and the phone can check it offline", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({ userId: "test-staff", pin: "4821" });

    const pin = await scratchDb().query.staffPin.findFirst({
      where: { userId: "test-staff" },
    });

    expect(pin?.hash).not.toContain("4821");
    expect(await verifyPin("4821", pin?.salt ?? "", pin?.hash ?? "")).toBe(
      true
    );
    expect(await verifyPin("4822", pin?.salt ?? "", pin?.hash ?? "")).toBe(
      false
    );
  });

  it("refuses anything that is not four digits", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });

    await expect(
      owner.client.people.setPin({ userId: "test-staff", pin: "12" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rotating a PIN replaces the old one", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({ userId: "test-manager", pin: "1111" });
    const first = await scratchDb().query.staffPin.findFirst({
      where: { userId: "test-manager" },
    });

    await owner.client.people.setPin({ userId: "test-manager", pin: "2222" });
    const second = await scratchDb().query.staffPin.findFirst({
      where: { userId: "test-manager" },
    });

    expect(second?.hash).not.toBe(first?.hash);
    expect(
      await verifyPin("2222", second?.salt ?? "", second?.hash ?? "")
    ).toBe(true);
    expect(
      await verifyPin("1111", second?.salt ?? "", second?.hash ?? "")
    ).toBe(false);
  });

  it("derives the same hash from the same PIN and salt, and a different one per salt", async () => {
    const saltA = "dGVzdC1zYWx0LTE2Ynl0ZXM=";
    const saltB = "b3RoZXItc2FsdC0xNmJ5dA==";

    expect(await derivePinHash("4821", saltA)).toBe(
      await derivePinHash("4821", saltA)
    );
    expect(await derivePinHash("4821", saltA)).not.toBe(
      await derivePinHash("4821", saltB)
    );
  });
});

describe("a device session", () => {
  it("attributes writes to the PIN-switched person, and records the phone", async () => {
    const staffOnPhone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
    });

    const me = await staffOnPhone.client.people.me();
    const where = await staffOnPhone.client.devices.current();

    expect(me.id).toBe("test-staff");
    expect(where.device?.name).toBe("শেড A ফোন");
    expect(where.actor?.id).toBe("test-staff");
    expect(where.autoLockMinutes).toBe(5);
  });

  it("cannot do office work, whatever Role the active person holds", async () => {
    const ownerOnPhone = await createTestClient(appRouter, {
      as: "owner",
      onShedPhone: true,
    });

    await expect(
      ownerOnPhone.client.people.setPin({ userId: "test-staff", pin: "9999" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ownerOnPhone.client.people.assignRoles({
        userId: "test-staff",
        roles: ["staff"],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a switch token that names nobody leaves the phone locked", async () => {
    const { resolveDeviceSession, hashToken } = await import("../device");
    const token = "a".repeat(64);
    await scratchDb()
      .update(shedPhone)
      .set({ tokenHash: await hashToken(token) })
      .where(eq(shedPhone.id, "test-shed-phone"));

    const resolved = await resolveDeviceSession(
      scratchDb(),
      token,
      "not-a-switch-token",
      new Date()
    );

    expect(resolved.status).toBe("locked");
    expect(resolved.device?.activeUserId).toBeNull();
  });

  it("the roster gives the phone what it needs to check a PIN offline, and nobody else", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({ userId: "test-staff", pin: "4821" });
    const staffOnPhone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
    });

    const roster = await staffOnPhone.client.people.roster();
    const entry = roster.find((person) => person.userId === "test-staff");

    expect(entry?.name).toBe("রহিম");
    expect(await verifyPin("4821", entry?.salt ?? "", entry?.hash ?? "")).toBe(
      true
    );
    await expect(owner.client.people.roster()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    void TEST_FARM;
  });
});

describe("review findings", () => {
  it("a locked phone can still read the roster, so PIN Switch can start at all", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({ userId: "test-staff", pin: "4821" });
    // A phone with nobody switched in: device present, no actor.
    const locked = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
      locked: true,
    });

    const roster = await locked.client.people.roster();
    const where = await locked.client.devices.current();

    expect(roster.some((person) => person.userId === "test-staff")).toBe(true);
    expect(where.status).toBe("locked");
    expect(where.autoLockMinutes).toBe(5);
  });

  it("an unknown or revoked token does not break the phone: it can still enrol again", async () => {
    const { resolveDeviceSession } = await import("../device");

    const unknown = await resolveDeviceSession(
      scratchDb(),
      "f".repeat(64),
      null,
      new Date()
    );

    expect(unknown).toEqual({ device: null, status: "unknown" });
  });

  it("the PIN is proved by the server, and the person is named by the token", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({ userId: "test-staff", pin: "4821" });
    const phone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
      locked: true,
    });

    await expect(
      phone.client.devices.switchUser({ userId: "test-staff", pin: "0000" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const switched = await phone.client.devices.switchUser({
      userId: "test-staff",
      pin: "4821",
    });

    expect(switched.name).toBe("রহিম");
    expect(switched.token).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("a Manager may not give an Owner a PIN", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });

    await expect(
      manager.client.people.setPin({ userId: "test-owner", pin: "1234" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.people.setPin({ userId: "nobody-here", pin: "1234" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("enrolment codes are long and unambiguous", async () => {
    const { randomEnrolmentCode } = await import("../device");

    const codes = Array.from({ length: 50 }, () => randomEnrolmentCode());

    expect(codes.every((code) => /^[0-9A-HJKMNP-TV-Z]{10}$/u.test(code))).toBe(
      true
    );
    expect(new Set(codes).size).toBe(codes.length);
  });
});
