import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * The farm's own identity: where it is, how it is reached, and the registration an inspector
 * asks for first. Written once and read by every document that leaves the farm.
 *
 * Each write is followed by a fresh client, because a Context carries the Farm as it stood when
 * the request began — which is what a real request does too.
 */
describe("the farm's own identity", () => {
  it("is written down once and the letter to the office carries it", async () => {
    const clock = new FakeClock("2027-02-01T04:00:00.000Z");
    const writer = await createTestClient(appRouter, { as: "manager", clock });

    // The Manager writes it off the certificate, which is how a farm actually gets these.
    await writer.client.farm.setIdentity({
      address: "গ্রাম: শিমুলিয়া, ডাকঘর: শিমুলিয়া, উপজেলা: সাভার, ঢাকা",
      phone: "+8801711000099",
      registrationNumber: "DLS/SAV/2026/০৪২",
      registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
      registrationExpiresOn: "2027-03-31",
    });

    const manager = await createTestClient(appRouter, { as: "manager", clock });
    expect(await manager.client.farm.identity()).toMatchObject({
      phone: "+8801711000099",
      registrationNumber: "DLS/SAV/2026/০৪২",
      registrationMissing: false,
    });

    // And the letter to the office now names the farm of origin in full, which the Act asks for
    // and ticket 32 could not give it.
    const owner = await createTestClient(appRouter, { as: "owner", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });
    const shed = await owner.client.herd.createShed({
      name: `identity-${Date.now()}`,
    });
    const pen = await owner.client.herd.createPen({
      shedId: shed.id,
      name: "পরিচয় পেন",
    });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: pen.id,
      source: "born",
      aliases: [],
    });
    const diseaseName = `তড়কা-পরিচয় ${Date.now()}`;
    await manager.client.notifiable.add({ name: { bn: diseaseName } });
    const made = await vet.client.diagnoses.record({
      animalTag: cow.tagNumber,
      disease: { bn: diseaseName },
    });
    const letter = await manager.client.notifiable.letter({
      diagnosisId: made.id,
    });
    expect(letter.text).toContain("শিমুলিয়া");
    expect(letter.text).toContain("+8801711000099");
    expect(letter.text).toContain("DLS/SAV/2026/০৪২");
  });

  it("says when the registration is running out, and refuses the milker", async () => {
    const clock = new FakeClock("2027-02-02T04:00:00.000Z");
    const staff = await createTestClient(appRouter, { as: "staff", clock });

    // Not the milker's business.
    await expect(
      staff.client.farm.setIdentity({ phone: "+8801711000098" })
    ).rejects.toThrow();

    const writer = await createTestClient(appRouter, { as: "manager", clock });
    await writer.client.farm.setIdentity({
      registrationNumber: "DLS/SAV/2026/০৪২",
      registrationExpiresOn: "2027-03-31",
    });

    // Expiring inside the ninety days the renewal is due in.
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const soon = await manager.client.farm.identity();
    expect(soon.registrationEndingSoon).toBe(true);
    expect(soon.registrationExpired).toBe(false);

    // And once it has run out, the farm says so plainly — before an inspector does.
    const later = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2027-04-01T04:00:00.000Z"),
    });
    const gone = await later.client.farm.identity();
    expect(gone.registrationExpired).toBe(true);
    expect(gone.registrationEndingSoon).toBe(false);
  });
});
