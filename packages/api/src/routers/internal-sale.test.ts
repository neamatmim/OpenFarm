import { eq } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { venture as ventureTable } from "@OpenFarm/db/schema/venture";
import type { SopContent } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

/**
 * The Internal Sale: an Animal sold between the Farm's herd and a Venture at her latest Weigh-in times a
 * rate the Owner enters, with the money moving through the Venture Account — a sale, not a book entry.
 */
const suffix = `internal-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2047-02-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 1_000_000,
};

const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}`, en: "Weigh-in" },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "staff",
  checkerRole: "manager",
  graceMinutes: 240,
  steps: [
    {
      id: "weigh",
      text: { bn: "ক্রাশে তুলে ওজন নিন" },
      repeatPerAnimal: true,
      evidence: [
        {
          type: "number",
          required: true,
          unit: { bn: "কেজি" },
          min: 20,
          max: 1200,
        },
      ],
      skipReasons: [{ bn: "ক্রাশে ওঠেনি" }],
      effect: { kind: "weigh_in" },
    },
  ],
});

let penId = "";
let ventureId = "";
let definitionId = "";

type Owner = Awaited<ReturnType<typeof as>>;

/** A Venture with capital, buying. */
const funded = async (owner: Owner, which: number) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${which} ${suffix}`,
    ...plan,
  });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0193${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2047-02-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2047-02-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${which}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });
  return venture.id;
};

/** One bull of the Farm's own. */
const bull = async (instant: string) => {
  const manager = await as("manager", instant);
  return await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 180,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    targetWindowStart: "2047-05-17",
    targetWindowEnd: "2047-05-19",
  });
};

/** The morning's weigh-in, read off the crush. */
const weigh = async (day: string, readings: [string, number][]) => {
  const scheduler = await as("owner", `${day}T07:30:00.000Z`);
  await scheduler.client.work.ensureDue();
  const today = await scheduler.client.work.today({ penId });
  const instance = today.find((one) => one.definitionId === definitionId);
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const staff = await as("staff", `${day}T07:30:00.000Z`);
  await staff.client.work.claim({ id: instance.id });
  for (const [tagNumber, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- the crush takes one animal at a time
    await staff.client.work.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: tagNumber,
      evidence: [kg],
    });
  }
};

beforeAll(async () => {
  const owner = await as("owner", "2047-02-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // The crush is in this Pen, so the person reading the scale has to be assigned to it.
  await as("staff", "2047-02-01T04:00:00.000Z");
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: `pa-${suffix}`,
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pen.id,
    })
    .onConflictDoNothing();
  ({ definitionId } = await owner.client.sops.create({
    content: weighInSop(),
  }));
  ventureId = await funded(owner, 1);
});

describe("the Internal Sale", () => {
  it("prices her at her latest Weigh-in and moves the money", async () => {
    const hers = await bull("2047-02-04T05:00:00.000Z");
    await weigh("2047-02-05", [[hers.tagNumber, 200]]);
    // Weighed again, heavier: the price is struck on the latest reading and not the first.
    await weigh("2047-02-06", [[hers.tagNumber, 220]]);

    const owner = await as("owner", "2047-02-06T09:00:00.000Z");
    const before = await owner.client.ventures.list();
    const heldBefore =
      before.find((one) => one.id === ventureId)?.balanceMoney ?? 0;

    const sold = await owner.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 350,
      note: `আজকের হাটের দর ${suffix}`,
      soldOn: "2047-02-06",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceMoney: 77_000,
    });
    expect(sold).toMatchObject({
      weightKg: 220,
      rateMoneyPerKg: 350,
      priceMoney: 77_000,
    });

    // She is the Venture's now, and the Venture's account is lighter by what she cost.
    const her = await owner.client.animals.get({ tagNumber: hers.tagNumber });
    expect(her.owner).toMatchObject({ id: ventureId });
    const after = await owner.client.ventures.list();
    const venture = after.find((one) => one.id === ventureId);
    expect(venture).toMatchObject({
      balanceMoney: heldBefore - 77_000,
      spentMoney: 77_000,
    });
    // Both sides of the money name her, so each leads to her page.
    const movements = await owner.client.ventures.movements({ ventureId });
    expect(
      movements.find((one) => one.kind === "internal_buy")?.tagNumber
    ).toBe(hers.tagNumber);
    const money = await owner.client.money.list({
      from: "2047-02-06",
      to: "2047-02-06",
    });
    expect(
      money.events.find((one) => one.source === "internal_sale_in")?.tagNumber
    ).toBe(hers.tagNumber);
  });

  it("refuses one side of the sale put right on its own", async () => {
    const owner = await as("owner", "2047-02-06T10:00:00.000Z");
    const movements = await owner.client.ventures.movements({ ventureId });
    const bought = movements.find((one) => one.kind === "internal_buy");
    // A sale is two movements, a price and the Farm's own Money Event. Correcting the Venture's side
    // alone would leave the Farm's books saying it was paid something else for the same animal.
    await expect(
      owner.client.ventures.correctMovement({
        id: bought?.id ?? "",
        reason: `দর ভুল ছিল ${suffix}`,
        changes: { amountMoney: { from: 77_000, to: 70_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "one_side_of_a_sale" },
    });
  });

  it("sends her back the other way, and the money with her", async () => {
    const owner = await as("owner", "2047-02-07T09:00:00.000Z");
    const listed = await owner.client.investors.list();
    expect(listed.people.length).toBeGreaterThan(0);

    const hers = await bull("2047-02-07T05:00:00.000Z");
    await weigh("2047-02-08", [[hers.tagNumber, 210]]);
    const owner2 = await as("owner", "2047-02-08T09:00:00.000Z");
    await owner2.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-08",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceMoney: 63_000,
    });
    const mid = await owner2.client.ventures.list();
    const spentThen = mid.find((one) => one.id === ventureId)?.spentMoney ?? 0;

    // And back to the Farm at the same weight and rate.
    const back = await owner2.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      rateMoneyPerKg: 300,
      note: `ফেরত ${suffix}`,
      soldOn: "2047-02-08",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceMoney: 63_000,
    });
    expect(back.priceMoney).toBe(63_000);
    const her = await owner2.client.animals.get({
      tagNumber: hers.tagNumber,
    });
    expect(her.owner).toBeNull();
    const after = await owner2.client.ventures.list();
    const venture = after.find((one) => one.id === ventureId);
    // What it was paid for her is the Venture's own proceeds, and its spending is unchanged.
    expect(venture).toMatchObject({
      proceedsMoney: 63_000,
      spentMoney: spentThen,
    });
  });

  it("puts one the Farm buys back into the Season of the window it gives her, at the price it paid", async () => {
    // In March, clear of February's money read below. Bought by the Farm for Eid 2047 and weighed at 210 kg; sold to
    // the Venture at ৳300 a kilo — ৳63,000, which ends her first Season — and bought back the same moment at the same
    // price for a winter market, which starts her second at ৳63,000.
    const hers = await bull("2047-03-10T05:00:00.000Z");
    await weigh("2047-03-11", [[hers.tagNumber, 210]]);
    const owner = await as("owner", "2047-03-11T09:00:00.000Z");
    const sale = {
      tagNumber: hers.tagNumber,
      rateMoneyPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-03-11",
      paymentMethod: "bank" as const,
      reference: `INT-W-${suffix}`,
      priceMoney: 63_000,
    };
    await owner.client.ventures.sellInternally({
      ...sale,
      toVentureId: ventureId,
    });
    await owner.client.ventures.sellInternally({
      ...sale,
      targetWindow: { start: "2047-12-01", end: "2047-12-31" },
    });
    const winterOf = async (instant: string) => {
      const { client: reading } = await as("owner", instant);
      const { seasons } = await reading.returns.list();
      return seasons.find((one) => one.key === "window:2047-12-01|2047-12-31");
    };
    // She stands, and this farm has set no market price a kilo: in her Season, named, as any bull with no price is.
    expect(await winterOf("2047-03-11T10:00:00.000Z")).toMatchObject({
      head: 1,
      finished: false,
      gaps: [{ tagNumber: hers.tagNumber, why: "no_price" }],
    });

    // Sold to the Venture again next day at ৳320 a kilo — 210 × 320 = ৳67,200 — which ends the Season she was bought
    // back into: ৳4,200 on the ৳63,000 she came in at, 6.7 on the hundred.
    const later = await as("owner", "2047-03-12T09:00:00.000Z");
    await later.client.ventures.sellInternally({
      ...sale,
      rateMoneyPerKg: 320,
      soldOn: "2047-03-12",
      reference: `INT-W2-${suffix}`,
      priceMoney: 67_200,
      toVentureId: ventureId,
    });
    expect(await winterOf("2047-03-12T10:00:00.000Z")).toMatchObject({
      head: 1,
      finished: true,
      returnOnCost: {
        costMoney: 63_000,
        backMoney: 67_200,
        resultMoney: 4200,
        per100: 6.7,
      },
    });
  });

  it("refuses a Venture whose Cattle Budget does not hold her price", async () => {
    const hers = await bull("2047-02-04T06:00:00.000Z");
    await weigh("2047-02-07", [[hers.tagNumber, 220]]);
    const owner = await as("owner", "2047-02-07T09:00:00.000Z");
    // Twenty-two lakh for a bull, against a Cattle Budget of ten: the buyer pays out of what it holds for cattle.
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: hers.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 10_000,
        note: `ভুল দর ${suffix}`,
        soldOn: "2047-02-07",
        paymentMethod: "bank",
        reference: `INT-TOO-DEAR-${suffix}`,
        priceMoney: 2_200_000,
      })
    ).rejects.toMatchObject({ data: { refusal: "cattle_budget_short" } });
  });

  it("refuses an animal nobody has weighed", async () => {
    const unweighed = await bull("2047-02-09T05:00:00.000Z");
    const owner = await as("owner", "2047-02-09T09:00:00.000Z");
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: unweighed.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-09",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceMoney: 1,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "never_weighed" },
    });
  });

  it("refuses an animal last weighed longer ago than the Owner's days, and takes one weighed lately", async () => {
    const stale = await bull("2047-02-14T05:00:00.000Z");
    const fresh = await bull("2047-02-14T05:00:00.000Z");
    // Twenty days before the sale, and ten.
    await weigh("2047-02-14", [[stale.tagNumber, 250]]);
    await weigh("2047-02-24", [[fresh.tagNumber, 250]]);
    const owner = await as("owner", "2047-03-06T09:00:00.000Z");
    const sold = (tagNumber: string) =>
      owner.client.ventures.sellInternally({
        tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-03-06",
        paymentMethod: "bank",
        reference: `INT-AGE-${tagNumber}-${suffix}`,
        priceMoney: 75_000,
      });
    await expect(sold(stale.tagNumber)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        refusal: "weighed_too_long_ago",
        tagNumber: stale.tagNumber,
        weighedOn: "2047-02-14",
        days: 20,
      },
    });
    await expect(sold(fresh.tagNumber)).resolves.toMatchObject({
      weightKg: 250,
    });
  });

  it("refuses her once she is Ready for Sale", async () => {
    const owner = await as("owner", "2047-02-10T04:00:00.000Z");
    const hers = await bull("2047-02-10T05:00:00.000Z");
    await weigh("2047-02-11", [[hers.tagNumber, 400]]);
    const manager = await as("manager", "2047-02-11T09:00:00.000Z");
    // Out of quarantine and up to weight, so the Manager says she is ready.
    await manager.client.animals.setState({
      tagNumber: hers.tagNumber,
      state: "fattening",
      reason: `কোয়ারেন্টিন শেষ ${suffix}`,
    });
    await manager.client.readyForSale.confirm({ tagNumber: hers.tagNumber });
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: hers.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-11",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceMoney: 1,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "she_is_ready_for_sale" },
    });
  });

  it("refuses a bull that has died: there is no animal left to move", async () => {
    const owner = await as("owner", "2047-02-12T04:00:00.000Z");
    const hers = await bull("2047-02-12T05:00:00.000Z");
    await weigh("2047-02-13", [[hers.tagNumber, 260]]);
    await owner.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: hers.tagNumber,
      kind: "died",
      cause: `বুক ফুলে মারা গেছে ${suffix}`,
      disposal: "buried",
    });
    const later = await as("owner", "2047-02-13T09:00:00.000Z");
    await expect(
      later.client.ventures.sellInternally({
        tagNumber: hers.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-13",
        paymentMethod: "bank",
        reference: `INT-DEAD-${suffix}`,
        priceMoney: 78_000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "she_is_gone" },
    });
  });

  it("refuses a Venture that is selling, and one she already belongs to", async () => {
    const hers = await bull("2047-02-12T05:00:00.000Z");
    await weigh("2047-02-13", [[hers.tagNumber, 230]]);
    const later = await as("owner", "2047-02-13T09:00:00.000Z");
    await later.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-13",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceMoney: 69_000,
    });
    // Already theirs.
    await expect(
      later.client.ventures.sellInternally({
        tagNumber: hers.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 300,
        note: `আবার ${suffix}`,
        soldOn: "2047-02-13",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceMoney: 69_000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "already_that_purse" },
    });
  });

  it("moves her between two Ventures, both sides at once", async () => {
    const owner = await as("owner", "2047-02-15T04:00:00.000Z");
    const other = await funded(owner, 2);
    const hers = await bull("2047-02-15T05:00:00.000Z");
    await weigh("2047-02-16", [[hers.tagNumber, 240]]);
    const selling = await as("owner", "2047-02-16T09:00:00.000Z");
    await selling.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-16",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceMoney: 72_000,
    });
    const before = await selling.client.ventures.list();
    const firstSpent =
      before.find((one) => one.id === ventureId)?.spentMoney ?? 0;

    // And on to the other Venture: one pays, the other is paid, on the one act.
    await selling.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: other,
      rateMoneyPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-16",
      paymentMethod: "bank",
      reference: `INT2-${suffix}`,
      priceMoney: 72_000,
    });
    const after = await selling.client.ventures.list();
    expect(after.find((one) => one.id === ventureId)).toMatchObject({
      proceedsMoney: expect.any(Number),
      spentMoney: firstSpent,
    });
    expect(after.find((one) => one.id === other)).toMatchObject({
      spentMoney: 72_000,
    });
    const her = await selling.client.animals.get({
      tagNumber: hers.tagNumber,
    });
    expect(her.owner).toMatchObject({ id: other });
  });

  it("refuses a dairy cow, whatever the rate", async () => {
    const owner = await as("owner", "2047-02-17T04:00:00.000Z");
    const dairyShed = await owner.client.sheds.create({
      name: `দুধ ${suffix}`,
    });
    const dairyPen = await owner.client.sheds.pens.create({
      quarantine: true,
      shedId: dairyShed.id,
      name: `দুধের ঘর ${suffix}`,
    });
    const cow = await owner.client.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: dairyPen.id,
      source: "bought",
    });
    // Investor money funds fattening; the milking herd is the Farm's own.
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: cow.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-17",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceMoney: 1,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_a_fattening_animal" },
    });
  });

  it("refuses a Venture that has started selling", async () => {
    const owner = await as("owner", "2047-02-18T04:00:00.000Z");
    const winding = await funded(owner, 3);
    const hers = await bull("2047-02-18T05:00:00.000Z");
    await weigh("2047-02-19", [[hers.tagNumber, 250]]);
    const later = await as("owner", "2047-02-19T09:00:00.000Z");
    await later.client.ventures.startFattening({ id: winding });
    // Nothing moves a Venture to selling by hand — the first Sale of one of its Animals does, and that
    // is increment 5's. The row is set straight so the bar this ticket promises can be tested at all.
    await scratchDb()
      .update(ventureTable)
      .set({ state: "selling" })
      .where(eq(ventureTable.id, winding));
    // A Venture counting what it holds does not take one more bull on.
    await expect(
      later.client.ventures.sellInternally({
        tagNumber: hers.tagNumber,
        toVentureId: winding,
        rateMoneyPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-19",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceMoney: 75_000,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "buyer_cannot_trade" },
    });
  });

  it("is the Farm's income when the Farm sells, and its cost when it buys", async () => {
    const owner = await as("owner", "2047-02-20T09:00:00.000Z");
    const money = await owner.client.money.list({
      from: "2047-02-01",
      to: "2047-02-28",
    });
    const sold = money.events.filter(
      (one) => one.source === "internal_sale_in"
    );
    const bought = money.events.filter(
      (one) => one.source === "internal_sale_out"
    );
    // The farm really did receive taka for those bulls, and really did pay for the one it took back.
    expect(sold.length).toBeGreaterThan(0);
    expect(sold.every((one) => one.direction === "in")).toBe(true);
    expect(bought).toEqual([
      expect.objectContaining({ amountMoney: 63_000, direction: "out" }),
    ]);
    // And it is the Farm's own money: none of it carries a Venture's purse.
    expect([...sold, ...bought].every((one) => one.purse === null)).toBe(true);
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2047-02-14T04:00:00.000Z");
    await expect(
      manager.client.ventures.sellInternally({
        tagNumber: "F-0001",
        toVentureId: ventureId,
        rateMoneyPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-14",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceMoney: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the animals the Owner is offered to move", () => {
  it("are the bought Fattening animals still here, weighed, and not yet ready — with their purse and weight", async () => {
    const owner = await as("owner", "2047-03-01T04:00:00.000Z");
    const weighed = await bull("2047-03-01T05:00:00.000Z");
    const unweighed = await bull("2047-03-01T05:10:00.000Z");
    const gone = await bull("2047-03-01T05:20:00.000Z");
    await weigh("2047-03-02", [
      [weighed.tagNumber, 240],
      [gone.tagNumber, 250],
    ]);
    await owner.client.animals.recordMortality({
      photo: A_DEATH_PHOTO,
      tagNumber: gone.tagNumber,
      kind: "died",
      cause: `মারা গেছে ${suffix}`,
      disposal: "buried",
    });

    const later = await as("owner", "2047-03-02T09:00:00.000Z");
    const offered = await later.client.ventures.movableAnimals();
    const tags = new Set(offered.map((one) => one.tagNumber));
    expect(
      offered.find((one) => one.tagNumber === weighed.tagNumber)
    ).toMatchObject({
      purse: null,
      weightKg: 240,
    });
    // Nothing to strike a price on, and nothing left to move.
    expect(tags.has(unweighed.tagNumber)).toBe(false);
    expect(tags.has(gone.tagNumber)).toBe(false);
    // And none offered is one the sale would refuse for being ready, dairy or born here.
    expect(
      offered.every((one) => ["quarantine", "fattening"].includes(one.state))
    ).toBe(true);
  });

  it("names the Venture a bull already belongs to", async () => {
    const owner = await as("owner", "2047-03-03T04:00:00.000Z");
    const offered = await owner.client.ventures.movableAnimals();
    const theirs = offered.filter((one) => one.purse?.id === ventureId);
    expect(theirs.length).toBeGreaterThan(0);
    expect(theirs[0]?.purse?.name).toContain(suffix);
  });

  it("is the Owner's alone to read", async () => {
    const manager = await as("manager", "2047-03-03T04:00:00.000Z");
    await expect(
      manager.client.ventures.movableAnimals()
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("what a paper may still take", () => {
  it("is nothing once its Units are paid for", async () => {
    const owner = await as("owner", "2047-03-04T04:00:00.000Z");
    const [paper] = await owner.client.ventures.agreements({ ventureId });
    // Twenty Units at fifty thousand, paid in full when the Venture was funded.
    expect(paper).toMatchObject({ capitalLeftMoney: 0 });
  });
});
