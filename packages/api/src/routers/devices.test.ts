import { eq } from "@OpenFarm/db/operators";
import { deviceSwitch, shedPhone } from "@OpenFarm/db/schema/device";
import { derivePinHash, verifyPin } from "@OpenFarm/domain";
import {
  FakeClock,
  MINUTE,
  scratchDb,
  thePerson,
  theShedPhone,
} from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { createContext } from "../context";
import { DEVICE_TOKEN_HEADER } from "../device-headers";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("enrolling a Shed Phone", () => {
  it("gives the Manager a one-time code the phone exchanges for its own token", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });

    const enrolled = await manager.client.devices.enroll({
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

  it("takes the code however it was typed off the Manager's screen — small letters, spaces, a dash", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const enrolled = await manager.client.devices.enroll({
      name: `phone-typed-${Date.now()}`,
    });
    // Read out in two halves, typed on a phone that does not capitalize.
    const typed =
      `${enrolled.code.slice(0, 5)} - ${enrolled.code.slice(5)}`.toLowerCase();
    const claimed = await manager.client.devices.claim({ code: typed });
    expect(claimed.device.id).toBe(enrolled.id);
  });

  it("a stranger's wrong codes lock out the stranger, not the farm's next phone", async () => {
    const WRONG_CODES_ALLOWED = 10;
    const stranger = await createTestClient(appRouter, {
      as: null,
      from: "198.51.100.7",
    });
    for (let tries = 0; tries < WRONG_CODES_ALLOWED; tries += 1) {
      // Counted one at a time, as a script walking the codes would send them.
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        stranger.client.devices.claim({ code: "NOTACODE00" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(
      stranger.client.devices.claim({ code: "NOTACODE00" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    // The Manager, standing in the shed with a new phone, is somebody else.
    const manager = await createTestClient(appRouter, {
      as: "manager",
      from: "203.0.113.20",
    });
    const enrolled = await manager.client.devices.enroll({
      name: `after-a-stranger-${Date.now()}`,
    });
    const claimed = await manager.client.devices.claim({ code: enrolled.code });
    expect(claimed.device.id).toBe(enrolled.id);
  });

  it("refuses an expired code", async () => {
    const clock = new FakeClock("2026-09-11T05:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const enrolled = await manager.client.devices.enroll({
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
    const enrolled = await manager.client.devices.enroll({
      name: `revoked-${Date.now()}`,
    });

    await manager.client.devices.revoke({ id: enrolled.id });

    const row = await scratchDb().query.shedPhone.findFirst({
      where: { id: enrolled.id },
    });
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(row?.enrollmentCode).toBeNull();
    await expect(
      manager.client.devices.revoke({ id: enrolled.id })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("tells a revoked phone so when somebody tries to PIN in on it, rather than letting it pass for no signal", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const enrolled = await manager.client.devices.enroll({
      name: `lost-${Date.now()}`,
    });
    const { token } = await manager.client.devices.claim({
      code: enrolled.code,
    });
    await manager.client.devices.revoke({ id: enrolled.id });
    // The phone turns up and somebody types their PIN on it, as a request off the phone carries it.
    const context = await createContext({
      req: new Request("http://farm.test/rpc", {
        headers: { [DEVICE_TOKEN_HEADER]: token },
      }),
      db: scratchDb(),
    });
    const phone = createRouterClient(appRouter, { context });
    await expect(
      phone.devices.switchUser({ userId: thePerson("manager").id, pin: "1234" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { refusal: "phone_revoked" },
    });
  });

  it("tells a revoked phone so on everything it asks, not only at its next PIN", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const enrolled = await manager.client.devices.enroll({
      name: `lost-again-${Date.now()}`,
    });
    const { token } = await manager.client.devices.claim({
      code: enrolled.code,
    });
    await manager.client.devices.revoke({ id: enrolled.id });
    const context = await createContext({
      req: new Request("http://farm.test/rpc", {
        headers: { [DEVICE_TOKEN_HEADER]: token },
      }),
      db: scratchDb(),
    });
    const phone = createRouterClient(appRouter, { context });
    // Its Outbox sending what it held: told the phone is off the farm, so it forgets itself, not "signed out".
    await expect(
      phone.sync.batch({ key: `revoked-${Date.now()}`, entries: [] })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      data: { refusal: "phone_revoked" },
    });
  });

  it("only those who run the farm may enroll, and only from their own phone", async () => {
    const staff = await createTestClient(appRouter, { as: "staff" });
    const managerOnPhone = await createTestClient(appRouter, {
      as: "manager",
      onShedPhone: true,
    });

    await expect(
      staff.client.devices.enroll({ name: "x" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      managerOnPhone.client.devices.enroll({ name: "x" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("PINs", () => {
  it("stores a salt and a derived hash, never the PIN, and the phone can check it offline", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "4821",
    });

    const pin = await scratchDb().query.staffPin.findFirst({
      where: { userId: thePerson("staff").id },
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
      owner.client.people.setPin({ userId: thePerson("staff").id, pin: "12" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rotating a PIN replaces the old one", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "3917",
    });
    const first = await scratchDb().query.staffPin.findFirst({
      where: { userId: thePerson("staff").id },
    });

    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "5284",
    });
    const second = await scratchDb().query.staffPin.findFirst({
      where: { userId: thePerson("staff").id },
    });

    expect(second?.hash).not.toBe(first?.hash);
    expect(
      await verifyPin("5284", second?.salt ?? "", second?.hash ?? "")
    ).toBe(true);
    expect(
      await verifyPin("3917", second?.salt ?? "", second?.hash ?? "")
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

    expect(me.id).toBe(thePerson("staff").id);
    expect(where.device?.name).toBe("শেড A ফোন");
    expect(where.actor?.id).toBe(thePerson("staff").id);
    expect(where.autoLockMinutes).toBe(5);
  });

  it("cannot do office work, whatever Role the active person holds", async () => {
    const ownerOnPhone = await createTestClient(appRouter, {
      as: "owner",
      onShedPhone: true,
    });

    await expect(
      ownerOnPhone.client.people.setPin({
        userId: thePerson("staff").id,
        pin: "9999",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      ownerOnPhone.client.people.assignRoles({
        userId: thePerson("staff").id,
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
      .where(eq(shedPhone.id, theShedPhone().id));

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
    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "4821",
    });
    const staffOnPhone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
    });

    const roster = await staffOnPhone.client.people.roster();
    const entry = roster.find(
      (person) => person.userId === thePerson("staff").id
    );

    expect(entry?.name).toBe("রহিম");
    expect(await verifyPin("4821", entry?.salt ?? "", entry?.hash ?? "")).toBe(
      true
    );
    await expect(owner.client.people.roster()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("review findings", () => {
  it("a locked phone can still read the roster, so PIN Switch can start at all", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "4821",
    });
    // A phone with nobody switched in: device present, no actor.
    const locked = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
      locked: true,
    });

    const roster = await locked.client.people.roster();
    const where = await locked.client.devices.current();

    expect(
      roster.some((person) => person.userId === thePerson("staff").id)
    ).toBe(true);
    expect(where.status).toBe("locked");
    expect(where.autoLockMinutes).toBe(5);
  });

  it("an unknown or revoked token does not break the phone: it can still enroll again", async () => {
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
    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "4821",
    });
    const phone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
      locked: true,
    });

    await expect(
      phone.client.devices.switchUser({
        userId: thePerson("staff").id,
        pin: "0000",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const switched = await phone.client.devices.switchUser({
      userId: thePerson("staff").id,
      pin: "4821",
    });

    expect(switched.name).toBe("রহিম");
    expect(switched.token).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("stops taking PINs for a person after five wrong ones, even the right one", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await owner.client.people.setPin({
      userId: thePerson("staff").id,
      pin: "7314",
    });
    const phone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
      locked: true,
      phone: { id: `phone-guess-${Date.now()}`, name: "অনুমানের ফোন" },
    });

    for (const guess of ["0000", "1111", "2222", "3333", "4444"]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        phone.client.devices.switchUser({
          userId: thePerson("staff").id,
          pin: guess,
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    await expect(
      phone.client.devices.switchUser({
        userId: thePerson("staff").id,
        pin: "7314",
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("a Manager may not give an Owner a PIN", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });

    await expect(
      manager.client.people.setPin({
        userId: thePerson("owner").id,
        pin: "4729",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.client.people.setPin({ userId: "nobody-here", pin: "4729" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("enrollment codes are long and unambiguous", async () => {
    const { randomEnrollmentCode } = await import("../device");

    const codes = Array.from({ length: 50 }, () => randomEnrollmentCode());

    expect(codes.every((code) => /^[0-9A-HJKMNP-TV-Z]{10}$/u.test(code))).toBe(
      true
    );
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("keeping a phone awake", () => {
  it("lengthens the stint being worked, and never wakes one already locked", async () => {
    const clock = new FakeClock("2031-04-01T04:00:00.000Z");
    const staff = await createTestClient(appRouter, {
      as: "staff",
      clock,
      onShedPhone: true,
    });
    const phone = theShedPhone();
    const person = thePerson("staff").id;
    // An hour ago the phone was locked on her; she has since PINned in again.
    const locked = `locked-${Date.now()}`;
    const working = `working-${Date.now()}`;
    await scratchDb()
      .insert(deviceSwitch)
      .values([
        {
          id: locked,
          deviceId: phone.id,
          userId: person,
          tokenHash: `hash-${locked}`,
          expiresAt: new Date("2031-04-01T03:00:00.000Z"),
          createdAt: new Date("2031-04-01T02:00:00.000Z"),
        },
        {
          id: working,
          deviceId: phone.id,
          userId: person,
          tokenHash: `hash-${working}`,
          expiresAt: new Date("2031-04-01T04:01:00.000Z"),
          createdAt: new Date("2031-04-01T03:50:00.000Z"),
        },
      ]);
    await staff.client.devices.keepAwake();
    const after = await scratchDb().query.deviceSwitch.findMany({
      where: { id: { in: [locked, working] } },
      columns: { id: true, expiresAt: true },
    });
    const of = (id: string) => after.find((one) => one.id === id)?.expiresAt;
    expect(of(locked)).toEqual(new Date("2031-04-01T03:00:00.000Z"));
    expect(of(working)?.getTime()).toBeGreaterThan(
      Date.parse("2031-04-01T04:01:00.000Z")
    );
  });
});

describe("PINs fired all at once", () => {
  it("are counted as surely as one after another: no more than five are answered before the lock", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await createTestClient(appRouter, { as: "otherStaff" });
    await owner.client.people.setPin({
      userId: thePerson("otherStaff").id,
      pin: "6083",
    });
    const phone = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
      locked: true,
      phone: { id: `phone-burst-${Date.now()}`, name: "একসাথে অনুমান" },
    });
    const guesses = Array.from({ length: 20 }, (_, at) =>
      String(1000 + at * 7)
    );
    const answers = await Promise.allSettled(
      guesses.map((pin) =>
        phone.client.devices.switchUser({
          userId: thePerson("otherStaff").id,
          pin,
        })
      )
    );
    const wrong = answers.filter(
      (one) =>
        one.status === "rejected" &&
        (one.reason as { data?: { refusal?: string } }).data?.refusal ===
          "wrong_pin"
    );
    expect(wrong.length).toBeLessThanOrEqual(5);
  });
});

describe("a PIN set anew", () => {
  it("ends the stint opened with the old one: whoever overheard it is switched out", async () => {
    const owner = await createTestClient(appRouter, { as: "owner" });
    await createTestClient(appRouter, { as: "staff", onShedPhone: true });
    const person = thePerson("staff").id;
    const open = `overheard-${Date.now()}`;
    const now = Date.now();
    await scratchDb()
      .insert(deviceSwitch)
      .values({
        id: open,
        deviceId: theShedPhone().id,
        userId: person,
        tokenHash: `hash-${open}`,
        expiresAt: new Date(now + 10 * 60_000),
        createdAt: new Date(now - 60_000),
      });
    await owner.client.people.setPin({ userId: person, pin: "5927" });
    const stint = await scratchDb().query.deviceSwitch.findFirst({
      where: { id: open },
      columns: { expiresAt: true },
    });
    expect(stint?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("locking a Shed Phone", () => {
  it("ends the stint of whoever locked it, never the next person's who switched in meanwhile", async () => {
    const leaving = await createTestClient(appRouter, {
      as: "staff",
      onShedPhone: true,
    });
    await createTestClient(appRouter, { as: "otherStaff" });
    const phone = theShedPhone();
    const next = `next-${Date.now()}`;
    const now = Date.now();
    // The next milker PINned in just before the first one's Lock reached the farm on a slow signal.
    await scratchDb()
      .insert(deviceSwitch)
      .values({
        id: next,
        deviceId: phone.id,
        userId: thePerson("otherStaff").id,
        tokenHash: `hash-${next}`,
        expiresAt: new Date(now + 10 * 60_000),
        createdAt: new Date(now),
      });
    await leaving.client.devices.lock();
    const theirs = await scratchDb().query.deviceSwitch.findFirst({
      where: { id: next },
      columns: { expiresAt: true },
    });
    expect(theirs?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
