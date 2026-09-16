import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The two papers a buyer leaves with: what they bought, and what the lorry carries.

const suffix = `${Date.now()}`;
const BUYER = {
  name: `কাদের কসাই ${suffix}`,
  address: "গাবতলী, ঢাকা",
  phone: "+8801711000066",
};
const LORRY = {
  destination: "গাবতলী পশুর হাট, ঢাকা",
  vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৫",
  driver: "সোহেল রানা",
};

const setup = async () => {
  const clock = new FakeClock("2027-06-01T07:30:00.000Z");
  const owner = await createTestClient(appRouter, { as: "owner", clock });
  const manager = await createTestClient(appRouter, { as: "manager", clock });
  const shed = await owner.client.herd.createShed({ name: `paper-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `বিক্রয় ${suffix}`,
  });

  const bull = async () => {
    const taken = await manager.client.intake.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `হাট ${suffix}` },
      purchasePriceBdt: 90_000,
      weightKg: 300,
      estimatedAgeMonths: 24,
      targetWeightKg: 280,
      targetWindowStart: "2027-08-17",
      targetWindowEnd: "2027-08-19",
    });
    await manager.client.animals.setState({
      tagNumber: taken.tagNumber,
      state: "fattening",
    });
    await manager.client.ready.confirm({ tagNumber: taken.tagNumber });
    return taken;
  };
  return { owner, manager, pen, bulls: [await bull(), await bull()] };
};

let world: Awaited<ReturnType<typeof setup>>;
/** The Sale this file's papers are about, held by id: the day's list has every Sale on it, and this file makes
 *  more than one. */
let sold = "";

beforeAll(async () => {
  world = await setup();
});

const tagOf = (index: number) => world.bulls[index]?.tagNumber ?? "";
const asManager = (day: string) =>
  createTestClient(appRouter, {
    as: "manager",
    clock: new FakeClock(`${day}T09:00:00.000Z`),
  });

describe("the papers a buyer leaves with", () => {
  it("puts a whole morning's sales to one buyer on one receipt", async () => {
    const manager = await asManager("2027-06-02");
    // The farm has its own identity by now; without it neither paper is complete.
    await manager.client.farm.setIdentity({
      address: "গ্রাম: শিমুলিয়া, সাভার, ঢাকা",
      phone: "+8801711000099",
      registrationNumber: "DLS/SAV/2026/০৪২",
      registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
      registrationExpiresOn: "2028-03-31",
    });

    const seller = await asManager("2027-06-02");
    const first = await seller.client.sale.record({
      tagNumber: tagOf(0),
      buyer: BUYER,
      ...LORRY,
      priceBdt: 145_000,
      weightKg: 312.5,
    });
    sold = first.id;
    await seller.client.sale.record({
      tagNumber: tagOf(1),
      buyer: BUYER,
      ...LORRY,
      priceBdt: 132_000,
      weightKg: 298,
    });

    const receipt = await seller.client.papers.receipt({ saleId: sold });
    // Both animals, both weights, both prices, and the total nobody had to add up.
    expect(receipt.text).toContain(tagOf(0));
    expect(receipt.text).toContain(tagOf(1));
    expect(receipt.text).toContain(BUYER.name);
    expect(receipt.animals).toHaveLength(2);
    expect(receipt.totalBdt).toBe(277_000);
    // And the farm it came from, which is what makes it a receipt rather than a note.
    expect(receipt.text).toContain("শিমুলিয়া");
  });

  it("gives the lorry a card with the farm of origin on it", async () => {
    const manager = await asManager("2027-06-02");
    const card = await manager.client.papers.transportCard({ saleId: sold });

    // Meat Rules 2021 r.18: farm of origin with its registration, the animals, where they are
    // going, and who is driving.
    expect(card.text).toContain("DLS/SAV/2026/০৪২");
    expect(card.text).toContain("শিমুলিয়া");
    expect(card.text).toContain(LORRY.destination);
    expect(card.text).toContain(LORRY.driver);
    expect(card.text).toContain(LORRY.vehicle);
    expect(card.animalCount).toBe(2);
    // The whole card is in Bangla, the count included — and every label carries its English
    // alongside, so a clerk from outside the district can read the form.
    expect(card.text).toContain("পশুর সংখ্যা / Animals: ২");
    expect(card.text).toContain(tagOf(0));
  });

  it("gives each lorry its own card, even to one buyer on one day", async () => {
    // The same man, the same morning, a second beast on a different lorry to a different hat.
    const manager = await asManager("2027-06-02");
    const third = await manager.client.intake.record({
      penId: world.pen.id,
      sex: "male",
      seller: { name: `হাট ${suffix}` },
      purchasePriceBdt: 80_000,
      weightKg: 280,
      estimatedAgeMonths: 22,
      targetWeightKg: 260,
      targetWindowStart: "2027-08-17",
      targetWindowEnd: "2027-08-19",
    });
    await manager.client.animals.setState({
      tagNumber: third.tagNumber,
      state: "fattening",
    });
    await manager.client.ready.confirm({ tagNumber: third.tagNumber });
    const other = await manager.client.sale.record({
      tagNumber: third.tagNumber,
      buyer: BUYER,
      destination: "সাভার হাট, ঢাকা",
      vehicle: "ঢাকা মেট্রো-ট ২২-৭৭৮৮",
      driver: "রফিক",
      priceBdt: 121_000,
      weightKg: 279,
    });

    // Each card carries what was on that vehicle and nothing else — a card listing a day's
    // worth of beasts above one lorry's number asserts a load that was never on it.
    const firstLorry = await manager.client.papers.transportCard({
      saleId: sold,
    });
    expect(firstLorry.animalCount).toBe(2);
    expect(firstLorry.tagNumbers).not.toContain(third.tagNumber);

    const secondLorry = await manager.client.papers.transportCard({
      saleId: other.id,
    });
    expect(secondLorry.tagNumbers).toEqual([third.tagNumber]);
    expect(secondLorry.text).toContain("রফিক");

    // The receipt, though, is one sheet for everything he took that morning.
    const receipt = await manager.client.papers.receipt({ saleId: sold });
    expect(receipt.animals).toHaveLength(3);
    expect(receipt.totalBdt).toBe(398_000);
  });

  it("says what is missing rather than printing a card with a hole in it", async () => {
    const writer = await asManager("2027-06-03");
    // A farm that has not written its registration down cannot give a lorry a lawful card.
    await writer.client.farm.setIdentity({ registrationNumber: null });

    // A fresh client, because a Context carries the Farm as it stood when the request began.
    const manager = await asManager("2027-06-03");
    try {
      await expect(
        manager.client.papers.transportCard({ saleId: sold })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        data: { refusal: "farm_identity_incomplete" },
      });
    } finally {
      // Put back whatever happened above: the Farm is the whole test run's, and leaving it
      // without a registration number would break every file that comes after.
      await writer.client.farm.setIdentity({
        registrationNumber: "DLS/SAV/2026/০৪২",
      });
    }
  });

  it("records every printing, because a paper that went is evidence", async () => {
    const manager = await asManager("2027-06-04");
    await manager.client.papers.receipt({ saleId: sold });

    const trail = await manager.client.audit.list({
      entity: "sale",
      entityId: sold,
    });
    const printed = trail.find((event) => event.action === "export");
    expect(printed).toBeDefined();
    // What the paper said, not merely that one was made: the tags it listed and the
    // registration it quoted, which is what an inspector asks about years later.
    expect(printed?.after).toMatchObject({
      paper: "receipt",
      registrationNumber: "DLS/SAV/2026/০৪২",
    });
  });
});
