import { uuidv7 } from "@OpenFarm/db/ids";
import { backupRun } from "@OpenFarm/db/schema/backup";
import { FakeClock, HOUR, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A farm set up this morning opens on an empty overview, and what is left to do — who it is, its registration, its
 * Manager and its Vet, the Vet's withdrawal days, its sheds, a worker who can work, a shed phone that works, a copy of
 * its records, its herd counted in, its Playbook — was found by knowing where each lives. The card says what is left,
 * each step until the farm's records say it is done, and not before: one milker added and a phone still waiting for its
 * code is not a farm with its people and phones.
 */
const suffix = `setup-${Date.now()}`;

/** A day no other file writes a copy near: the copies it writes are dated after it, and the latest copy the backups
 *  page reads must stay theirs. */
const clock = new FakeClock("2026-11-15T06:00:00.000Z");

const left = async () => {
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const live = await owner.client.goingLive.get();
  return live.left;
};

describe("what is left to set the farm up", () => {
  it("names each step until the farm's records say it is done", async () => {
    expect(await left()).toEqual([
      "identity",
      "registration",
      "manager",
      "vet",
      "sheds",
      "people",
      "shedPhone",
      "backup",
      "register",
      "playbook",
    ]);
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    await owner.client.farm.setIdentity({
      address: `গ্রাম ${suffix}`,
      phone: "+8801711000123",
      registrationNumber: `DLS/${suffix}`,
    });
    const shed = await owner.client.sheds.create({ name: suffix });
    const pen = await owner.client.sheds.pens.create({
      shedId: shed.id,
      name: `পেন ${suffix}`,
    });

    // A milker on the list is not yet a milker who can work: he needs his pens and his PIN.
    const milker = await owner.client.people.addForShedPhones({
      name: `কর্মী ${suffix}`,
    });
    expect(await left()).toContain("people");
    await owner.client.people.assignPens({
      userId: milker.userId,
      add: [pen.id],
      remove: [],
    });
    expect(await left()).toContain("people");
    await owner.client.people.setPin({ userId: milker.userId, pin: "4826" });
    expect(await left()).not.toContain("people");

    // A phone given a code is not yet a phone: it is set up when it takes the code.
    const phone = await owner.client.devices.enroll({ name: `ফোন ${suffix}` });
    expect(await left()).toContain("shedPhone");
    await owner.client.devices.claim({ code: phone.code });
    expect(await left()).not.toContain("shedPhone");

    // A Vet invited counts before they have opened their account; the Manager counts once they hold the Role.
    await owner.client.people.invite({
      email: `vet.${suffix}@test.openfarm`,
      name: "ডা. রফিক",
      roles: ["vet"],
    });
    expect(await left()).not.toContain("vet");
    await createTestClient(appRouter, { as: "manager", clock });
    expect(await left()).not.toContain("manager");

    // One animal registered is not a herd put in: the Owner's count closes the opening register.
    await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    expect(await left()).toContain("register");

    // A copy that failed is not a copy.
    const write = (ok: "yes" | "no") =>
      scratchDb()
        .insert(backupRun)
        .values({
          id: uuidv7(clock.now()),
          kind: "nightly",
          startedAt: new Date(clock.now().getTime() - HOUR),
          finishedAt: new Date(clock.now().getTime() - HOUR),
          destination: "offsite:openfarm",
          ok,
        });
    await write("no");
    expect(await left()).toContain("backup");
    await write("yes");
    expect(await left()).toEqual(["register", "playbook"]);
  });

  it("names the Vet's withdrawal days while a medicine on the list has none", async () => {
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const product = await owner.client.drugs.create({
      name: { bn: `ওষুধ ${suffix}` },
    });
    expect(await left()).toContain("vetDays");
    await vet.client.drugs.setWithdrawal({
      id: product.id,
      milkWithdrawalDays: 3,
      meatWithdrawalDays: 14,
    });
    expect(await left()).not.toContain("vetDays");
  });
});
