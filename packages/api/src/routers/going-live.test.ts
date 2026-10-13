import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Going live is a checklist on paper that the farm's own records can mostly answer: how many medicines have the Vet's
 * days, how many phones work, how many workers can work, how many procedures are published, who has been trained, how
 * many animals are photographed. The two facts no record holds — that the herd was counted in the sheds and matched the
 * register, and the day the paper register was put away — are the Owner's word, written down and kept on the trail.
 */
const suffix = `live-${Date.now()}`;
const clock = new FakeClock("2045-07-01T06:00:00.000Z");

const asOwner = () => createTestClient(appRouter, { as: "owner", clock });

let pens = 0;

const aPen = async () => {
  pens += 1;
  const owner = await asOwner();
  const shed = await owner.client.sheds.create({
    name: `শেড ${pens} ${suffix}`,
  });
  return owner.client.sheds.pens.create({
    shedId: shed.id,
    name: `পেন ${pens} ${suffix}`,
  });
};

const register = async (penId: string) => {
  const owner = await asOwner();
  return owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "heifer",
    penId,
    source: "born",
    aliases: [],
  });
};

describe("going live, read from the farm's records", () => {
  it("counts what the checklist asks for", async () => {
    const owner = await asOwner();
    const pen = await aPen();
    await register(pen.id);
    await register(pen.id);
    await owner.client.drugs.create({ name: { bn: `ওষুধ ক ${suffix}` } });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    await vet.client.drugs.create({
      name: { bn: `ওষুধ খ ${suffix}` },
      milkWithdrawalDays: 2,
      meatWithdrawalDays: 10,
    });
    const milker = await owner.client.people.addForShedPhones({
      name: `কর্মী ${suffix}`,
    });
    // A PIN and no Pen: he can switch in, but no work is his.
    const second = await owner.client.people.addForShedPhones({
      name: `দ্বিতীয় ${suffix}`,
    });
    await owner.client.people.setPin({ userId: second.userId, pin: "7140" });
    await owner.client.people.assignPens({
      userId: milker.userId,
      add: [pen.id],
      remove: [],
    });
    await owner.client.people.setPin({ userId: milker.userId, pin: "5937" });
    const phone = await owner.client.devices.enroll({ name: `ফোন ${suffix}` });
    await owner.client.devices.claim({ code: phone.code });
    await owner.client.devices.enroll({ name: `অপেক্ষা ${suffix}` });

    const live = await owner.client.goingLive.get();
    expect(live.medicines).toEqual({ total: 2, withDays: 1 });
    expect(live.staff).toEqual({ total: 2, ready: 1 });
    expect(live.phones).toEqual({ setUp: 1, waiting: 1 });
    expect(live.herd).toEqual({ onRegister: 2, photographed: 0 });
    expect(live.certificate).toBe(false);
    expect(live.monthlyCosts).toBe(0);
    expect(live.trained).toEqual({ people: 0, of: 2 });
    expect(live.procedures.standardAdopted).toBe(0);
    expect(live.procedures.standardTotal).toBeGreaterThan(40);
    expect(live.procedures.doseTotal).toBeGreaterThan(0);
    expect(live.procedures.doseTotal).toBeLessThan(
      live.procedures.standardTotal
    );
  });

  it("is read by the Manager too, and by nobody who does not run the farm", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    await expect(manager.client.goingLive.get()).resolves.toBeDefined();
    const staff = await createTestClient(appRouter, { as: "staff", clock });
    await expect(staff.client.goingLive.get()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("the Owner's opening count", () => {
  it("keeps the count beside the register, and the register is in only when they agree", async () => {
    const owner = await asOwner();
    const pen = await aPen();
    await register(pen.id);
    const { herd } = await owner.client.goingLive.get();

    // Counted one short: kept, but the opening register is not in until the missing one is found.
    const short = await owner.client.goingLive.countOpening({
      counted: herd.onRegister - 1,
      day: "2045-07-01",
    });
    expect(short).toMatchObject({
      counted: herd.onRegister - 1,
      onRegister: herd.onRegister,
      agrees: false,
    });
    let live = await owner.client.goingLive.get();
    expect(live.openingCount).toEqual({
      counted: herd.onRegister - 1,
      onRegister: herd.onRegister,
      countedOn: "2045-07-01",
    });
    expect(live.left).toContain("register");

    await owner.client.goingLive.countOpening({
      counted: herd.onRegister,
      day: "2045-07-01",
    });
    live = await owner.client.goingLive.get();
    expect(live.openingCount?.counted).toBe(herd.onRegister);
    expect(live.left).not.toContain("register");
  });

  it("is the Owner's alone", async () => {
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    await expect(
      manager.client.goingLive.countOpening({ counted: 1, day: "2045-07-01" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a count on a day still to come", async () => {
    const owner = await asOwner();
    await expect(
      owner.client.goingLive.countOpening({ counted: 1, day: "2045-07-02" })
    ).rejects.toMatchObject({
      data: { refusal: "counted_in_the_future" },
    });
  });

  it("is kept on the trail with who said it", async () => {
    const owner = await asOwner();
    await owner.client.goingLive.countOpening({
      counted: 7,
      day: "2045-06-30",
    });
    const trail = await owner.client.audit.list({ entity: "farm" });
    expect(
      trail.some(
        (event) =>
          event.action === "update" &&
          (event.after as { openingCount?: number } | null)?.openingCount === 7
      )
    ).toBe(true);
  });
});

describe("the day the paper was put away", () => {
  it("counts the days without paper from it, the day itself the first", async () => {
    const owner = await asOwner();
    const paperAway = async () => {
      const live = await owner.client.goingLive.get();
      return live.paperPutAway;
    };
    expect(await paperAway()).toBeNull();
    await owner.client.goingLive.putPaperAway({ day: "2045-06-20" });
    expect(await paperAway()).toEqual({
      on: "2045-06-20",
      day: 12,
    });
    // The paper came back and went away again: the count starts again.
    await owner.client.goingLive.putPaperAway({ day: "2045-07-01" });
    expect(await paperAway()).toEqual({
      on: "2045-07-01",
      day: 1,
    });
  });

  it("refuses a day still to come, and anybody but the Owner", async () => {
    const owner = await asOwner();
    await expect(
      owner.client.goingLive.putPaperAway({ day: "2045-07-02" })
    ).rejects.toMatchObject({
      data: { refusal: "put_away_in_the_future" },
    });
    const manager = await createTestClient(appRouter, {
      as: "manager",
      clock,
    });
    await expect(
      manager.client.goingLive.putPaperAway({ day: "2045-07-01" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
