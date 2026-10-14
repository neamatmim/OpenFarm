import { inArray } from "@OpenFarm/db/operators";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

// The farm's other Licenses — the trade license above all — written down with their certificates, and renewed on the
// Registration's machinery: renewal work raised for the Owner the renewal lead before one runs out, due the day it
// does, whose closing Step records the new expiry and the renewed certificate (ADR 0032).

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const PHOTO = { contentType: "image/jpeg", data: "TTTT" } as const;

const licenseRenewalSop = (): SopContent => ({
  name: { bn: `লাইসেন্স নবায়ন ${Date.now()}`, en: "License renewal" },
  purpose: { bn: "খামারের লাইসেন্স সময়মতো নবায়ন" },
  triggers: [{ kind: "license_renewal" }],
  assignedRole: "owner",
  checkerRole: null,
  graceMinutes: 24 * 60,
  steps: [
    {
      id: "apply",
      text: { bn: "যে অফিস দিয়েছে সেখানে আবেদন ও ফি জমা দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
    },
    {
      id: "renewed",
      text: { bn: "নতুন সনদের মেয়াদ ও ছবি দিন" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "license_renewal" },
    },
  ],
});

const setup = async () => {
  const owner = await as("owner", "2060-01-01T04:00:00.000Z");
  await as("manager", "2060-01-01T04:00:00.000Z");
  const sop = await owner.client.sops.create({ content: licenseRenewalSop() });
  return { sop };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

afterAll(async () => {
  await scratchDb()
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(inArray(sopDefinition.id, [world.sop.definitionId]));
});

/** The work this file's procedure has raised, once the farm has been opened at this instant. */
const renewalWork = async (instant: string) => {
  const owner = await as("owner", instant);
  await owner.client.work.ensureDue();
  return scratchDb().query.sopInstance.findMany({
    where: { definitionId: world.sop.definitionId },
    columns: {
      id: true,
      penId: true,
      assignedRole: true,
      dueAt: true,
      state: true,
      cause: true,
    },
    orderBy: { dueAt: "asc", id: "asc" },
  });
};

/** The renewal work still owed, once the farm has been opened at this instant. */
const dueWork = async (instant: string) => {
  const work = await renewalWork(instant);
  return work.filter((row) => row.state === "due");
};

describe("the farm's Licenses", () => {
  it("are written down with number, issuer, days and certificate by whoever runs the farm, and read by the Vet", async () => {
    const manager = await as("manager", "2060-01-02T04:00:00.000Z");
    const { id } = await manager.client.licenses.add({
      kind: "trade",
      number: "TL/SAV/2060/77",
      issuer: "সাভার পৌরসভা",
      issuedOn: "2059-07-01",
      expiresOn: "2060-06-30",
    });
    await manager.client.licenses.setCertificate({ licenseId: id, ...PHOTO });

    const vet = await as("vet", "2060-01-02T05:00:00.000Z");
    const held = await vet.client.licenses.list();
    const license = held.find((one) => one.id === id);
    expect(license).toMatchObject({
      kind: "trade",
      name: null,
      number: "TL/SAV/2060/77",
      issuer: "সাভার পৌরসভা",
      issuedOn: new Date("2059-06-30T18:00:00.000Z"),
      expiresOn: new Date("2060-06-29T18:00:00.000Z"),
      expired: false,
      endingSoon: false,
      certificateTakenAt: new Date("2060-01-02T04:00:00.000Z"),
    });
    expect(await vet.client.licenses.certificate({ licenseId: id })).toEqual(
      PHOTO
    );

    const staff = await as("staff", "2060-01-02T05:00:00.000Z");
    await expect(staff.client.licenses.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      vet.client.licenses.add({ kind: "fire", number: "F-1" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("names an other License, and refuses one that runs out before it was issued", async () => {
    const owner = await as("owner", "2060-01-03T04:00:00.000Z");
    await expect(
      owner.client.licenses.add({ kind: "other", number: "B-1" })
    ).rejects.toMatchObject({ data: { refusal: "license_needs_a_name" } });
    await expect(
      owner.client.licenses.add({
        kind: "fire",
        number: "F-1",
        issuedOn: "2060-01-01",
        expiresOn: "2059-12-31",
      })
    ).rejects.toMatchObject({
      data: { refusal: "license_expires_before_issued" },
    });
    const { id } = await owner.client.licenses.add({
      kind: "other",
      name: "বয়লার সনদ",
      number: "B-1",
    });
    await owner.client.licenses.update({ id, number: "B-2" });
    const listed = await owner.client.licenses.list();
    expect(listed.find((one) => one.id === id)).toMatchObject({
      name: "বয়লার সনদ",
      number: "B-2",
      expiresOn: null,
    });
    // Retired, it is the farm's no longer, and nothing is raised for it.
    await owner.client.licenses.retire({ id });
    const after = await owner.client.licenses.list();
    expect(after.map((one) => one.id)).not.toContain(id);
  });

  it("raises each License's renewal for the Owner once within the lead, tells the Owner, and lists it on the home", async () => {
    const manager = await as("manager", "2060-01-04T04:00:00.000Z");
    const fire = await manager.client.licenses.add({
      kind: "fire",
      number: "FS/2060/9",
      expiresOn: "2060-12-31",
    });
    const before = await renewalWork("2060-01-04T05:00:00.000Z");
    expect(before.filter((row) => row.cause?.includes(fire.id))).toEqual([]);

    // The trade license runs out on 30 June: with the farm's ninety days, renewal opens on 2 April.
    expect(await dueWork("2060-04-01T04:00:00.000Z")).toEqual([]);
    const open = await dueWork("2060-04-02T04:00:00.000Z");
    expect(open).toEqual([
      expect.objectContaining({
        penId: null,
        assignedRole: "owner",
        dueAt: new Date("2060-06-30T18:00:00.000Z"),
      }),
    ]);
    // Once, however often the farm is opened.
    expect(await dueWork("2060-04-03T04:00:00.000Z")).toHaveLength(1);

    const owner = await as("owner", "2060-04-03T05:00:00.000Z");
    const told = await owner.client.alerts.mine({ entityId: open[0]?.id });
    expect(told).toEqual([
      expect.objectContaining({
        kind: "license_renewal_due",
        params: expect.objectContaining({
          kind: "trade",
          number: "TL/SAV/2060/77",
        }),
      }),
    ]);
    const home = await owner.client.overview.get();
    expect(home.needsYou.licenseRenewals).toEqual([
      expect.objectContaining({
        kind: "trade",
        number: "TL/SAV/2060/77",
        expired: false,
        instanceId: open[0]?.id,
      }),
    ]);
    const board = await owner.client.work.get({ id: open[0]?.id ?? "" });
    expect(board.renewal).toEqual({
      expiresOn: new Date("2060-06-29T18:00:00.000Z"),
      license: { kind: "trade", name: null, number: "TL/SAV/2060/77" },
    });
  });

  it("renews the License from the closing Step: its expiry and certificate move, and the next renewal waits a year", async () => {
    const [work] = await dueWork("2060-04-10T04:00:00.000Z");
    const owner = await as("owner", "2060-04-10T04:00:00.000Z");
    await owner.client.work.claim({ id: work?.id ?? "" });
    await owner.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "apply",
      evidence: [true],
    });
    await expect(
      owner.client.work.completeStep({
        instanceId: work?.id ?? "",
        stepId: "renewed",
        evidence: [true],
        renewal: { expiresOn: "2061-06-30" },
      })
    ).rejects.toMatchObject({ data: { refusal: "renewal_needs_certificate" } });
    await expect(
      owner.client.work.completeStep({
        instanceId: work?.id ?? "",
        stepId: "renewed",
        evidence: [true],
        renewal: { expiresOn: "2060-05-01", certificate: PHOTO },
      })
    ).rejects.toMatchObject({ data: { refusal: "renewal_not_later" } });
    await owner.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "renewed",
      evidence: [true],
      renewal: {
        expiresOn: "2061-06-30",
        issuedOn: "2060-04-10",
        certificate: { contentType: "image/jpeg", data: "RENEWED" },
      },
    });
    await owner.client.work.complete({ id: work?.id ?? "" });

    const after = await as("owner", "2060-04-10T05:00:00.000Z");
    const held = await after.client.licenses.list();
    const trade = held.find((one) => one.number === "TL/SAV/2060/77");
    expect(trade).toMatchObject({
      expiresOn: new Date("2061-06-29T18:00:00.000Z"),
      issuedOn: new Date("2060-04-09T18:00:00.000Z"),
    });
    expect(
      await after.client.licenses.certificate({ licenseId: trade?.id ?? "" })
    ).toEqual({ contentType: "image/jpeg", data: "RENEWED" });
    const home = await after.client.overview.get();
    expect(home.needsYou.licenseRenewals).toEqual([]);
    // The fire license comes due on its own: its lead opens on 3 October.
    expect(await dueWork("2060-10-03T04:00:00.000Z")).toHaveLength(1);
    // And the renewed trade license a year on.
    const nextYear = await dueWork("2061-04-02T04:00:00.000Z");
    expect(
      nextYear.filter(
        (row) => row.dueAt.getTime() === Date.parse("2061-06-30T18:00:00.000Z")
      )
    ).toHaveLength(1);
  });

  it("is renewed by the Owner alone", async () => {
    const manager = await as("manager", "2061-04-03T04:00:00.000Z");
    const owed = await dueWork("2061-04-03T04:00:00.000Z");
    const work = owed.find(
      (row) => row.dueAt.getTime() === Date.parse("2061-06-30T18:00:00.000Z")
    );
    await expect(
      manager.client.work.completeStep({
        instanceId: work?.id ?? "",
        stepId: "renewed",
        evidence: [true],
        renewal: { expiresOn: "2062-06-30", certificate: PHOTO },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("follows its License's expiry put right by hand while its renewal is open, and is raised no second time", async () => {
    const manager = await as("manager", "2061-04-04T04:00:00.000Z");
    const held = await manager.client.licenses.list();
    const trade = held.find((one) => one.number === "TL/SAV/2060/77");
    await manager.client.licenses.update({
      id: trade?.id ?? "",
      expiresOn: "2061-07-15",
    });

    const owed = await dueWork("2061-04-05T04:00:00.000Z");
    const forTrade = owed.filter((row) => row.cause?.includes(trade?.id ?? ""));
    // Due the day it now runs out, under the cause of the expiry it now has: not late on the day it no longer runs out.
    expect(forTrade).toEqual([
      expect.objectContaining({
        dueAt: new Date("2061-07-15T18:00:00.000Z"),
        cause: `license:${trade?.id}:2061-07-15`,
      }),
    ]);
  });

  it("is called off when its License is retired, and raised for it no more", async () => {
    const owner = await as("owner", "2061-04-06T04:00:00.000Z");
    const held = await owner.client.licenses.list();
    const fire = held.find((one) => one.kind === "fire");
    const before = await dueWork("2061-04-06T04:00:00.000Z");
    const fireWork = before.find((row) => row.cause?.includes(fire?.id ?? ""));
    expect(fireWork).toBeDefined();

    await owner.client.licenses.retire({ id: fire?.id ?? "" });

    const after = await renewalWork("2061-04-07T04:00:00.000Z");
    const forFire = after.filter((row) => row.cause?.includes(fire?.id ?? ""));
    expect(forFire).toEqual([
      expect.objectContaining({ id: fireWork?.id, state: "called_off" }),
    ]);
    const home = await owner.client.overview.get();
    expect(
      home.needsYou.licenseRenewals.map((one) => one.licenseId)
    ).not.toContain(fire?.id);
  });

  it("renews no License the farm no longer holds, a renewal put right after it was retired among them", async () => {
    const owner = await as("owner", "2061-04-08T04:00:00.000Z");
    const owed = await dueWork("2061-04-08T04:00:00.000Z");
    const held = await owner.client.licenses.list();
    const trade = held.find((one) => one.number === "TL/SAV/2060/77");
    const work = owed.find((row) => row.cause?.includes(trade?.id ?? ""));
    await owner.client.work.claim({ id: work?.id ?? "" });
    await owner.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "apply",
      evidence: [true],
    });
    await owner.client.work.completeStep({
      instanceId: work?.id ?? "",
      stepId: "renewed",
      evidence: [true],
      renewal: { expiresOn: "2062-07-15", certificate: PHOTO },
    });
    await owner.client.work.complete({ id: work?.id ?? "" });
    await owner.client.licenses.retire({ id: trade?.id ?? "" });

    const later = await as("owner", "2061-04-09T04:00:00.000Z");
    const board = await later.client.work.get({ id: work?.id ?? "" });
    const renewed = board.completions.find((one) => one.stepId === "renewed");
    await expect(
      correctStepAsShown(later.client, {
        completionId: renewed?.id ?? "",
        evidence: [true],
        renewal: { expiresOn: "2062-08-15" },
        reason: "তারিখ ভুল লেখা হয়েছিল",
      })
    ).rejects.toMatchObject({ data: { refusal: "renewal_names_no_license" } });
  });

  it("says whether any published procedure raises a License's renewal, and the Registration's", async () => {
    const owner = await as("owner", "2061-04-10T04:00:00.000Z");
    expect(await owner.client.licenses.renewalProcedures()).toEqual({
      licenses: true,
      registration: false,
    });
  });
});
