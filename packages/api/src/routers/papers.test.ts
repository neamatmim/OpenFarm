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
    await seller.client.sale.record({
      tagNumber: tagOf(1),
      buyer: BUYER,
      ...LORRY,
      priceBdt: 132_000,
      weightKg: 298,
    });

    const receipt = await seller.client.sale.receipt({ saleId: first.id });
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
    const mine = await manager.client.sale.lastToday();
    expect(mine).not.toBeNull();

    const sales = await manager.client.sale.day();
    const card = await manager.client.sale.transportCard({
      saleId: sales[0]?.id ?? "",
    });

    // Meat Rules 2021 r.18: farm of origin with its registration, the animals, where they are
    // going, and who is driving.
    expect(card.text).toContain("DLS/SAV/2026/০৪২");
    expect(card.text).toContain("শিমুলিয়া");
    expect(card.text).toContain(LORRY.destination);
    expect(card.text).toContain(LORRY.driver);
    expect(card.text).toContain(LORRY.vehicle);
    expect(card.animalCount).toBe(2);
    // The whole card is in Bangla, the count included.
    expect(card.text).toContain("পশুর সংখ্যা: ২");
    expect(card.text).toContain(tagOf(0));
  });

  it("says what is missing rather than printing a card with a hole in it", async () => {
    const writer = await asManager("2027-06-03");
    // A farm that has not written its registration down cannot give a lorry a lawful card.
    await writer.client.farm.setIdentity({ registrationNumber: null });

    // A fresh client, because a Context carries the Farm as it stood when the request began.
    const manager = await asManager("2027-06-03");
    const sales = await manager.client.sale.day({ day: "2027-06-02" });
    await expect(
      manager.client.sale.transportCard({ saleId: sales[0]?.id ?? "" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "farm_identity_incomplete" },
    });

    // Put back, because the Farm is the whole test run's.
    await writer.client.farm.setIdentity({
      registrationNumber: "DLS/SAV/2026/০৪২",
    });
  });

  it("records every printing, because a paper that went is evidence", async () => {
    const manager = await asManager("2027-06-04");
    const sales = await manager.client.sale.day({ day: "2027-06-02" });
    await manager.client.sale.receipt({ saleId: sales[0]?.id ?? "" });

    const trail = await manager.client.audit.list({ entity: "sale" });
    expect(
      trail.some(
        (event) => event.action === "export" && event.entityId === sales[0]?.id
      )
    ).toBe(true);
  });
});
