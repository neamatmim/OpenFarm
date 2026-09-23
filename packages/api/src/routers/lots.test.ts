import { penAssignment } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * What came in, lot by lot: the Lot Number printed on a box of medicine or a bag of feed, and the day it may be
 * used until — kept with the purchase it came in on, because the store is only as safe as its oldest box.
 */
const suffix = `lots-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** A wormer given to every animal of a Pen, one dose each: the simplest way a dose leaves the store. */
const campaignSop = (productId: string, tag: string): SopContent => ({
  name: { bn: `কৃমিনাশক ${suffix} ${tag}`, en: "Worming" },
  purpose: { bn: "পেনের পশুদের ওষুধ" },
  triggers: [],
  appliesTo: { side: "fattening" },
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "dose",
      text: { bn: "ওষুধ দিন" },
      repeatPerAnimal: true,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [{ bn: "অসুস্থ" }],
      effect: { kind: "treatment", productId },
    },
  ],
});

/** The morning's feeding, raised by hand for the test. */
const feedingSop = (tag: string): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix} ${tag}`, en: "Feeding" },
  purpose: { bn: "পেনে খাবার দেওয়া" },
  triggers: [],
  assignedRole: "staff",
  checkerRole: null,
  graceMinutes: 240,
  steps: [
    {
      id: "feed",
      text: { bn: "খাওয়ান" },
      repeatPerAnimal: false,
      evidence: [{ type: "tick", required: true }],
      skipReasons: [],
      effect: { kind: "feeding" },
    },
  ],
});

/** A product with two Lots in the store, a bull in a Pen, and the work that doses him. */
const aStore = async (tag: string) => {
  const start = "2038-04-01T03:00:00.000Z";
  const owner = await as("owner", start);
  const manager = await as("manager", start);
  const vet = await as("vet", start);
  const shed = await owner.client.herd.createShed({
    name: `lots-${suffix}-${tag}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `লট পেন ${suffix} ${tag}`,
  });
  await as("staff", start);
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-lots-${pen.id}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  const product = await vet.client.drugs.add({
    name: { bn: `লটের কৃমিনাশক ${suffix} ${tag}` },
    milkWithdrawalDays: 0,
    meatWithdrawalDays: 0,
  });
  const lot = async (lotNumber: string, expiresOn: string) =>
    await manager.client.drugs.purchase({
      drugProductId: product.id,
      quantity: "১০ ডোজ",
      doses: 10,
      priceBdt: 1000,
      seller: { name: `ফার্মেসি ${suffix}` },
      purchasedOn: "2038-04-01",
      lotNumber,
      expiresOn,
    });
  // Bought in the other order from the one they will be used in: the later day came in first.
  const late = await lot("LATE-1", "2039-12-31");
  const early = await lot("EARLY-1", "2038-06-30");
  const bull = await manager.client.intake.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: 50_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    targetWindowStart: "2039-06-01",
    targetWindowEnd: "2039-06-05",
  });
  const sop = await owner.client.sops.create({
    content: campaignSop(product.id, tag),
  });
  /** One dose, given to the bull at this instant. */
  const dose = async (instant: string) => {
    const raising = await as("manager", instant);
    await raising.client.instances.raiseNow({
      definitionId: sop.definitionId,
      penId: pen.id,
    });
    const today = await raising.client.instances.today({ penId: pen.id });
    const raised = today.find((row) => row.definitionId === sop.definitionId);
    const staff = await as("staff", instant);
    await staff.client.instances.claim({ id: raised?.id ?? "" });
    await staff.client.instances.completeStep({
      instanceId: raised?.id ?? "",
      stepId: "dose",
      animalTag: bull.tagNumber,
      evidence: [true],
    });
  };
  /** Feed given out of the store to the Pen, as the morning's feeding records it. */
  const feedOut = async (
    feedItemId: string,
    givenKg: number,
    instant: string
  ) => {
    const raising = await as("manager", instant);
    const ration = await raising.client.feed.saveRation({
      name: { bn: `লটের রেশন ${suffix} ${tag} ${instant}` },
      items: [{ feedItemId, kgPerAnimalPerDay: 5 }],
    });
    await raising.client.feed.assignRation({
      penId: pen.id,
      rationId: ration.rationId,
    });
    const feeding = await owner.client.sops.create({
      content: feedingSop(`${tag} ${instant}`),
    });
    await raising.client.instances.raiseNow({
      definitionId: feeding.definitionId,
      penId: pen.id,
    });
    const today = await raising.client.instances.today({ penId: pen.id });
    const raised = today.find(
      (row) => row.definitionId === feeding.definitionId
    );
    const staff = await as("staff", instant);
    await staff.client.instances.claim({ id: raised?.id ?? "" });
    await staff.client.instances.completeStep({
      instanceId: raised?.id ?? "",
      stepId: "feed",
      evidence: [true],
      feeding: [{ feedItemId, givenKg }],
    });
  };
  return { product, late, early, dose, feedOut, manager };
};

describe("a Lot, as it comes in", () => {
  it("keeps a medicine's Lot Number and expiry with the purchase", async () => {
    const manager = await as("manager", "2038-03-01T04:00:00.000Z");
    const product = await manager.client.drugs.add({
      name: { bn: `আইভারমেকটিন ${suffix}` },
    });
    const bought = await manager.client.drugs.purchase({
      drugProductId: product.id,
      quantity: "৫টি ভায়াল",
      doses: 50,
      priceBdt: 2500,
      seller: { name: `ফার্মেসি ${suffix}` },
      purchasedOn: "2038-03-01",
      lotNumber: "IVM-2208",
      expiresOn: "2039-08-31",
    });
    const purchases = await manager.client.drugs.purchases({
      drugProductId: product.id,
    });
    expect(purchases).toEqual([
      expect.objectContaining({
        id: bought.id,
        lotNumber: "IVM-2208",
        expiresOn: "2039-08-31",
      }),
    ]);
  });

  it("refuses medicine that had expired before it was bought", async () => {
    const manager = await as("manager", "2038-03-02T04:00:00.000Z");
    const product = await manager.client.drugs.add({
      name: { bn: `পুরনো ওষুধ ${suffix}` },
    });
    await expect(
      manager.client.drugs.purchase({
        drugProductId: product.id,
        quantity: "১টি ভায়াল",
        doses: 10,
        priceBdt: 500,
        seller: { name: `ফার্মেসি ${suffix}` },
        purchasedOn: "2038-03-02",
        lotNumber: "OLD-1",
        expiresOn: "2038-02-28",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "expired_when_bought" },
    });
  });

  it("keeps a feed delivery's Lot Number and expiry, and needs neither", async () => {
    const manager = await as("manager", "2038-03-03T04:00:00.000Z");
    const premix = await manager.client.feed.addItem({
      name: { bn: `প্রিমিক্স ${suffix}` },
    });
    const bagged = await manager.client.stock.receive({
      feedItemId: premix.id,
      kind: "purchase",
      quantity: 50,
      priceBdt: 6000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2038-03-03",
      lotNumber: "PMX-77",
      expiresOn: "2038-09-30",
    });
    // Hay has no Lot Number and no expiry printed on it, and is taken in all the same.
    const loose = await manager.client.stock.receive({
      feedItemId: premix.id,
      kind: "purchase",
      quantity: 10,
      priceBdt: 1000,
      seller: { name: `রহমান ফিডস ${suffix}` },
      receivedOn: "2038-03-03",
    });
    const arrivals = await manager.client.stock.arrivals({
      feedItemId: premix.id,
    });
    expect(arrivals.find((one) => one.id === bagged.id)).toMatchObject({
      lotNumber: "PMX-77",
      expiresOn: "2038-09-30",
    });
    expect(arrivals.find((one) => one.id === loose.id)).toMatchObject({
      lotNumber: null,
      expiresOn: null,
    });
    // And feed past its day when it arrives is refused, as medicine is.
    await expect(
      manager.client.stock.receive({
        feedItemId: premix.id,
        kind: "purchase",
        quantity: 5,
        priceBdt: 500,
        seller: { name: `রহমান ফিডস ${suffix}` },
        receivedOn: "2038-03-03",
        expiresOn: "2038-03-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "expired_when_bought" } });
  });
});

describe("medicine in the store", () => {
  it("counts doses in and out, taking each dose from the Lot that expires first", async () => {
    const store = await aStore("medicine");
    await store.dose("2038-04-02T04:00:00.000Z");
    await store.dose("2038-04-03T04:00:00.000Z");
    await store.dose("2038-04-04T04:00:00.000Z");

    const list = await store.manager.client.drugs.list();
    expect(
      list.find((one) => one.id === store.product.id)?.stock
    ).toMatchObject({
      dosesIn: 20,
      dosesGiven: 3,
      onHand: 17,
      nextExpiresOn: "2038-06-30",
    });
    const purchases = await store.manager.client.drugs.purchases({
      drugProductId: store.product.id,
    });
    expect(purchases.find((one) => one.id === store.early.id)?.left).toBe(7);
    expect(purchases.find((one) => one.id === store.late.id)?.left).toBe(10);

    // A level set, and the product under it says so.
    await store.manager.client.drugs.setLowStock({
      drugProductId: store.product.id,
      threshold: 18,
    });
    const low = await store.manager.client.drugs.list();
    expect(low.find((one) => one.id === store.product.id)?.stock).toMatchObject(
      { lowStockAt: 18, runningLow: true }
    );
  });
});

describe("feed in the store", () => {
  it("says what is left of each delivery, the first to expire fed first", async () => {
    const store = await aStore("feed");
    const concentrate = await store.manager.client.feed.addItem({
      name: { bn: `লটের দানাদার ${suffix}` },
    });
    const delivered = async (
      quantity: number,
      lotNumber: string,
      expiresOn: string
    ) =>
      await store.manager.client.stock.receive({
        feedItemId: concentrate.id,
        kind: "purchase",
        quantity,
        priceBdt: quantity * 60,
        seller: { name: `রহমান ফিডস ${suffix}` },
        receivedOn: "2038-04-01",
        lotNumber,
        expiresOn,
      });
    const late = await delivered(40, "CON-LATE", "2039-01-01");
    const early = await delivered(30, "CON-EARLY", "2038-08-01");
    await store.feedOut(concentrate.id, 35, "2038-04-05T04:00:00.000Z");

    const stock = await store.manager.client.stock.onHand();
    const line = stock.find((one) => one.feedItemId === concentrate.id);
    expect(line).toMatchObject({ onHand: 35, nextExpiresOn: "2039-01-01" });
    const arrivals = await store.manager.client.stock.arrivals({
      feedItemId: concentrate.id,
    });
    expect(arrivals.find((one) => one.id === early.id)?.left).toBe(0);
    expect(arrivals.find((one) => one.id === late.id)?.left).toBe(35);
  });
});
