import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Money from the farm's own records: a Dispatch, an Intake, a Sale, a feed Purchase, a medicine
// purchase and the Vet's fee each book their Money Event, and the Owner approves what is over the
// Approval Threshold without the record being held back.

const suffix = `${Date.now()}`;
const at = (instant: string) => new FakeClock(instant);
const YEAR = { from: "2037-01-01", to: "2037-12-31" };

const as = (role: "owner" | "manager" | "staff" | "vet", instant: string) =>
  createTestClient(appRouter, { as: role, clock: at(instant) });

const setup = async () => {
  const owner = await as("owner", "2037-01-02T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: `money-${suffix}` });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `টাকা ${suffix}`,
  });
  return { pen };
};

let world: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  world = await setup();
});

/** This file's Money Events for one record, as the Owner reads them. */
const moneyOf = async (sourceId: string) => {
  const owner = await as("owner", "2037-12-31T12:00:00.000Z");
  const all = await owner.client.money.list(YEAR);
  return all.events.filter((one) => one.sourceId === sourceId);
};

/** A bull taken in, for a sale or a fee. */
const intakeOf = (priceBdt: number, instant: string) =>
  as("manager", instant).then((manager) =>
    manager.client.intake.record({
      penId: world.pen.id,
      sex: "male",
      seller: { name: `গাবতলী হাট ${suffix}` },
      purchasePriceBdt: priceBdt,
      weightKg: 250,
      estimatedAgeMonths: 20,
      targetWindowStart: "2037-12-01",
      targetWindowEnd: "2037-12-05",
      paymentMethod: "bank",
    })
  );

describe("money from the farm's records", () => {
  it("books a Dispatch's milk sale once, and a correction puts the same money right", async () => {
    const manager = await as("manager", "2037-01-10T04:00:00.000Z");
    const recorded = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2037-01-10T02:00:00.000Z"),
      litres: 100,
      buyer: { name: `মিল্ক ভিটা ${suffix}` },
      pricePerLitreBdt: 55,
      paymentMethod: "bkash",
    });
    expect(await moneyOf(recorded.id)).toEqual([
      expect.objectContaining({
        source: "dispatch",
        direction: "in",
        amountBdt: 5500,
        categoryEn: "Milk sales",
        counterpartyName: `মিল্ক ভিটা ${suffix}`,
        paymentMethod: "bkash",
        approval: "not_needed",
      }),
    ]);

    await manager.client.milk.correctDispatch({
      id: recorded.id,
      changes: { litres: { from: 100, to: 120 } },
      reason: "মাপে ভুল",
    });
    const [money, ...more] = await moneyOf(recorded.id);
    expect(more).toEqual([]);
    expect(money?.amountBdt).toBe(6600);
    // The trail shows the money either side of the correction, not only the litres.
    const trail = await manager.client.audit.list({
      entity: "dispatch",
      entityId: recorded.id,
    });
    const corrected = trail.find((event) => event.action === "correct");
    expect(corrected?.before).toMatchObject({
      money: expect.objectContaining({ amountBdt: "5500.00" }),
    });
    expect(corrected?.after).toMatchObject({
      money: expect.objectContaining({ amountBdt: "6600.00" }),
    });
  });

  it("books an Intake, a Sale and a feed Purchase, and nothing for fodder the farm grew", async () => {
    const bull = await intakeOf(18_000, "2037-02-01T04:00:00.000Z");
    const [bought] = await moneyOf(bull.intakeId);
    expect(bought).toMatchObject({
      source: "intake",
      direction: "out",
      amountBdt: 18_000,
      categoryEn: "Cattle purchases",
      counterpartyName: `গাবতলী হাট ${suffix}`,
      paymentMethod: "bank",
      approval: "not_needed",
    });

    const manager = await as("manager", "2037-02-20T04:00:00.000Z");
    // The Manager put the price in wrong: the same Money Event is put right, not a second one booked.
    await manager.client.intake.correct({
      id: bull.intakeId,
      changes: { purchasePriceBdt: { from: 18_000, to: 18_500 } },
      reason: "হাটের রসিদে ১৮,৫০০",
    });
    expect(await moneyOf(bull.intakeId)).toEqual([
      expect.objectContaining({ amountBdt: 18_500, paymentMethod: "bank" }),
    ]);

    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      buyer: { name: `কসাই ${suffix}` },
      priceBdt: 19_500,
      weightKg: 262,
      destination: "কারওয়ান বাজার",
      vehicle: "ঢাকা মেট্রো ট ১১-২২৩৩",
      driver: "করিম",
    });
    expect(await moneyOf(sold.id)).toEqual([
      expect.objectContaining({
        source: "sale",
        direction: "in",
        amountBdt: 19_500,
        // Nobody said, and the farm's gate is cash unless somebody says otherwise.
        paymentMethod: "cash",
      }),
    ]);
    await manager.client.sale.correct({
      id: sold.id,
      changes: {
        priceBdt: { from: 19_500, to: 19_000 },
        paymentMethod: { from: "cash", to: "bkash" },
      },
      reason: "বিকাশে দিয়েছেন, ৫০০ কম",
    });
    expect(await moneyOf(sold.id)).toEqual([
      expect.objectContaining({ amountBdt: 19_000, paymentMethod: "bkash" }),
    ]);
    // A year on, past the Manager's window, the Owner can still put the same Sale right.
    const yearOn = await as("owner", "2038-02-25T04:00:00.000Z");
    await yearOn.client.sale.correct({
      id: sold.id,
      changes: { priceBdt: { from: 19_000, to: 19_200 } },
      reason: "মালিক রসিদ মিলিয়ে দেখেছেন",
    });
    expect(await moneyOf(sold.id)).toEqual([
      expect.objectContaining({ amountBdt: 19_200 }),
    ]);

    const feed = await manager.client.feed.addItem({
      name: { bn: `ভুসি ${suffix}` },
      unit: "kg",
    });
    const lorry = await manager.client.stock.receive({
      feedItemId: feed.id,
      kind: "purchase",
      quantity: 500,
      priceBdt: 15_000,
      seller: { name: `ভুসির দোকান ${suffix}` },
      receivedOn: "2037-02-20",
      paymentMethod: "cash",
    });
    await manager.client.stock.correct({
      id: lorry.id,
      changes: { priceBdt: { from: 15_000, to: 16_000 } },
      reason: "রসিদে ১৬,০০০ লেখা",
    });
    expect(await moneyOf(lorry.id)).toEqual([
      expect.objectContaining({
        source: "feed_in",
        direction: "out",
        amountBdt: 16_000,
        categoryEn: "Feed",
      }),
    ]);

    const harvest = await manager.client.stock.receive({
      feedItemId: feed.id,
      kind: "harvest",
      quantity: 800,
      receivedOn: "2037-02-20",
    });
    expect(await moneyOf(harvest.id)).toEqual([]);

    // The Owner is not asked to approve the Owner's own say: over the threshold, it waits for nobody.
    const owner = await as("owner", "2037-02-21T04:00:00.000Z");
    await owner.client.stock.correct({
      id: lorry.id,
      changes: { priceBdt: { from: 16_000, to: 25_000 } },
      reason: "মালিক নিজে দাম দিয়েছেন",
    });
    expect(await moneyOf(lorry.id)).toEqual([
      expect.objectContaining({ amountBdt: 25_000, approval: "not_needed" }),
    ]);

    // Retired, so a Stock Count on another file's clock does not find a lorry from 2037 in the store.
    await manager.client.feed.retireItem({ id: feed.id });
  });

  it("holds the money over the threshold and never the Sale, until the Owner approves it", async () => {
    const bull = await intakeOf(85_000, "2037-03-01T04:00:00.000Z");
    // The bull is on the farm, as bought, whatever the money is waiting for.
    const manager = await as("manager", "2037-03-01T05:00:00.000Z");
    const onTheFarm = await manager.client.animals.byTag({
      tagNumber: bull.tagNumber,
    });
    expect(onTheFarm.state).toBe("quarantine");
    const [waiting] = await moneyOf(bull.intakeId);
    expect(waiting).toMatchObject({ amountBdt: 85_000, approval: "awaiting" });
    const id = waiting?.id ?? "";

    // And a Sale over the threshold: she leaves, sold, and only the money waits.
    const sold = await manager.client.sale.record({
      tagNumber: bull.tagNumber,
      buyer: { name: `ঈদের ক্রেতা ${suffix}` },
      priceBdt: 140_000,
      weightKg: 260,
      destination: "গাবতলী",
      vehicle: "ঢাকা মেট্রো ন ২২-৩৩৪৪",
      driver: "রহিম",
    });
    expect(sold.state).toBe("sold");
    const [soldMoney] = await moneyOf(sold.id);
    expect(soldMoney).toMatchObject({
      amountBdt: 140_000,
      approval: "awaiting",
    });

    // On the Owner's queue, and in the Owner's digest.
    const owner = await as("owner", "2037-03-01T06:00:00.000Z");
    const home = await owner.client.home.owner();
    expect(home.needsYou.moneyAwaiting).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, amountBdt: 85_000, source: "intake" }),
      ])
    );
    expect(await owner.client.alerts.mine({ about: id })).toEqual([
      expect.objectContaining({ kind: "money_awaiting_approval" }),
    ]);

    // The Owner's alone.
    for (const role of ["manager", "vet", "staff"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const other = await as(role, "2037-03-01T06:00:00.000Z");
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        other.client.money.approve({ id, amountBdt: 85_000 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // An amount the Owner did not read is not approved.
    await expect(
      owner.client.money.approve({ id, amountBdt: 58_000 })
    ).rejects.toMatchObject({ data: { refusal: "amount_changed" } });
    await owner.client.money.approve({ id, amountBdt: 85_000 });
    const [approved] = await moneyOf(bull.intakeId);
    expect(approved).toMatchObject({ approval: "approved" });
    expect(approved?.approvedByName).toBeTruthy();
    const trail = await owner.client.audit.list({
      entity: "money_event",
      entityId: id,
    });
    expect(trail).toEqual([
      expect.objectContaining({ action: "update", roleUsed: "owner" }),
    ]);
    await expect(
      owner.client.money.approve({ id, amountBdt: 85_000 })
    ).rejects.toMatchObject({ data: { refusal: "not_awaiting_approval" } });
    // Approved, the notice about it is taken down.
    expect(await owner.client.alerts.mine({ about: id })).toEqual([]);
    const after = await owner.client.home.owner();
    expect(after.needsYou.moneyAwaiting.map((one) => one.id)).not.toContain(id);
  });

  it("asks again when a correction changes an approved amount", async () => {
    const manager = await as("manager", "2037-04-01T04:00:00.000Z");
    const recorded = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2037-04-01T02:00:00.000Z"),
      litres: 500,
      buyer: { name: `প্রাণ ডেইরি ${suffix}` },
      pricePerLitreBdt: 50,
    });
    const [waiting] = await moneyOf(recorded.id);
    expect(waiting).toMatchObject({ amountBdt: 25_000, approval: "awaiting" });
    const owner = await as("owner", "2037-04-01T05:00:00.000Z");
    const id = waiting?.id ?? "";
    await owner.client.money.approve({ id, amountBdt: 25_000 });

    // A note changes nothing the Owner approved.
    await manager.client.milk.correctDispatch({
      id: recorded.id,
      changes: { challan: { from: null, to: "CH-77" } },
      reason: "চালান পরে এল",
    });
    const [kept] = await moneyOf(recorded.id);
    expect(kept?.approval).toBe("approved");

    await manager.client.milk.correctDispatch({
      id: recorded.id,
      changes: { litres: { from: 500, to: 520 } },
      reason: "মাপে ভুল",
    });
    const [asked] = await moneyOf(recorded.id);
    expect(asked).toMatchObject({
      amountBdt: 26_000,
      approval: "awaiting",
    });
    // The Owner is told about the new amount, and only the new amount.
    expect(await owner.client.alerts.mine({ about: id })).toEqual([
      expect.objectContaining({
        kind: "money_awaiting_approval",
        params: expect.objectContaining({ amountBdt: 26_000 }),
      }),
    ]);

    // Under the threshold again, it waits for nobody and the notice comes down.
    await manager.client.milk.correctDispatch({
      id: recorded.id,
      changes: { litres: { from: 520, to: 300 } },
      reason: "দুটো গাড়ির দুধ এক সাথে লেখা হয়েছিল",
    });
    const [under] = await moneyOf(recorded.id);
    expect(under).toMatchObject({ amountBdt: 15_000, approval: "not_needed" });
    expect(await owner.client.alerts.mine({ about: id })).toEqual([]);
  });

  it("books medicine bought for the Drug List, with the doses it holds", async () => {
    const vet = await as("vet", "2037-05-01T04:00:00.000Z");
    const product = await vet.client.drugs.add({
      name: { bn: `অক্সিটেট্রাসাইক্লিন ${suffix}` },
      milkWithdrawalDays: 7,
      meatWithdrawalDays: 28,
    });
    const manager = await as("manager", "2037-05-02T04:00:00.000Z");
    const bought = await manager.client.drugs.purchase({
      drugProductId: product.id,
      quantity: "১০ ভায়াল",
      doses: 10,
      priceBdt: 1200,
      seller: { name: `ফার্মেসি ${suffix}` },
      purchasedOn: "2037-05-02",
    });
    const purchases = await manager.client.drugs.purchases({
      drugProductId: product.id,
    });
    expect(purchases).toEqual([
      expect.objectContaining({
        id: bought.id,
        quantity: "১০ ভায়াল",
        doses: 10,
        priceBdt: 1200,
        sellerName: `ফার্মেসি ${suffix}`,
      }),
    ]);
    expect(await moneyOf(bought.id)).toEqual([
      expect.objectContaining({
        source: "medicine_purchase",
        direction: "out",
        amountBdt: 1200,
        categoryEn: "Medicine",
      }),
    ]);
  });

  it("takes the Vet's own fee, naming the animals seen, and shows the Vet no other money", async () => {
    const bull = await intakeOf(15_000, "2037-06-01T04:00:00.000Z");
    const vet = await as("vet", "2037-06-02T04:00:00.000Z");
    const fee = await vet.client.money.vetFee({
      amountBdt: 1500,
      visitedOn: "2037-06-02",
      animalTags: [bull.tagNumber],
      note: "জ্বরের চিকিৎসা",
    });
    expect(await vet.client.money.myFees()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fee.id,
          amountBdt: 1500,
          tagNumbers: [bull.tagNumber],
        }),
      ])
    );
    const [money] = await moneyOf(fee.id);
    expect(money).toMatchObject({
      source: "vet_fee",
      direction: "out",
      amountBdt: 1500,
      categoryEn: "Vet fees",
    });

    await expect(vet.client.money.list(YEAR)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const manager = await as("manager", "2037-06-02T04:00:00.000Z");
    await expect(
      manager.client.money.vetFee({ amountBdt: 1, visitedOn: "2037-06-02" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      vet.client.money.vetFee({ amountBdt: 1500, visitedOn: "2037-06-03" })
    ).rejects.toMatchObject({ data: { refusal: "visited_in_the_future" } });
  });

  it("shows Barn Staff no money anywhere", async () => {
    const staff = await as("staff", "2037-07-01T04:00:00.000Z");
    await expect(staff.client.money.list(YEAR)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(staff.client.money.myFees()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      staff.client.drugs.purchases({ drugProductId: "x" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Nor the Approval Threshold, which is a money figure: not Barn Staff's, and not the Vet's.
    const farmToStaff = await staff.client.farm.current();
    expect(farmToStaff).not.toHaveProperty("approvalThresholdBdt");
    const vet = await as("vet", "2037-07-01T04:00:00.000Z");
    expect(await vet.client.farm.current()).not.toHaveProperty(
      "approvalThresholdBdt"
    );
    const manager = await as("manager", "2037-07-01T04:00:00.000Z");
    expect(await manager.client.farm.current()).toHaveProperty(
      "approvalThresholdBdt"
    );
  });
});
