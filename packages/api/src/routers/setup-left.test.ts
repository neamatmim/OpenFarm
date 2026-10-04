import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A farm set up this morning opens on an empty overview, and what is left to do — who it is, its registration, its
 * sheds, its people, a shed phone, its animals, its Playbook — was found by knowing where each lives. The overview says
 * what is left, each step until it is done.
 */
const suffix = `setup-${Date.now()}`;

const left = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const home = await owner.client.overview.get();
  return home.setupLeft;
};

describe("what is left to set the farm up", () => {
  it("names each step until it is done", async () => {
    expect(await left()).toEqual([
      "identity",
      "registration",
      "sheds",
      "people",
      "shedPhone",
      "register",
      "playbook",
    ]);
    const owner = await createTestClient(appRouter, { as: "owner" });
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
    await owner.client.people.addForShedPhones({ name: `কর্মী ${suffix}` });
    await owner.client.devices.enrol({ name: `ফোন ${suffix}` });
    await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    expect(await left()).toEqual(["playbook"]);
  });
});
