import { eq } from "@OpenFarm/db/operators";
import { penAssignment } from "@OpenFarm/db/schema/herd";
import { venture as ventureTable } from "@OpenFarm/db/schema/venture";
import type { SopContent } from "@OpenFarm/domain";
import { EXIT_STATES, seasonOf } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { theirHerdStory } from "../investor-statement-store";
import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { theirProgress } from "../venture-herd-store";
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
  const agreement = await owner.client.ventures.agreements.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2047-02-01",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.agreements.keepPaper({
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

/** One bull of the Farm's own, bought at so many kilos — a hundred and eighty unless said. */
const bull = async (instant: string, weightKg = 180) => {
  const manager = await as("manager", instant);
  return await manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg,
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
    // Weighed again, heavier: the price is struck on the latest reading and not the first. A kilo in a day — more
    // would be a reading the farm doubts, and no price is struck on one of those.
    await weigh("2047-02-06", [[hers.tagNumber, 201]]);

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
      priceMoney: 70_350,
    });
    expect(sold).toMatchObject({
      weightKg: 201,
      rateMoneyPerKg: 350,
      priceMoney: 70_350,
    });

    // She is the Venture's now, and the Venture's account is lighter by what she cost.
    const her = await owner.client.animals.get({ tagNumber: hers.tagNumber });
    expect(her.owner).toMatchObject({ id: ventureId });
    const after = await owner.client.ventures.list();
    const venture = after.find((one) => one.id === ventureId);
    expect(venture).toMatchObject({
      balanceMoney: heldBefore - 70_350,
      spentMoney: 70_350,
    });
    // Both sides of the money name her, so each leads to her page.
    const movements = await owner.client.ventures.movements.list({ ventureId });
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
    const movements = await owner.client.ventures.movements.list({ ventureId });
    const bought = movements.find((one) => one.kind === "internal_buy");
    // A sale is two movements, a price and the Farm's own Money Event. Correcting the Venture's side
    // alone would leave the Farm's books saying it was paid something else for the same animal.
    await expect(
      owner.client.ventures.movements.correct({
        id: bought?.id ?? "",
        reason: `দর ভুল ছিল ${suffix}`,
        changes: { amountMoney: { from: 70_350, to: 70_000 } },
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

    const hers = await bull("2047-02-07T05:00:00.000Z", 210);
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
    const hers = await bull("2047-03-10T05:00:00.000Z", 210);
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
    const hers = await bull("2047-02-04T06:00:00.000Z", 220);
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
    const stale = await bull("2047-02-14T05:00:00.000Z", 250);
    const fresh = await bull("2047-02-14T05:00:00.000Z", 250);
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
    const hers = await bull("2047-02-10T05:00:00.000Z", 400);
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
    const hers = await bull("2047-02-12T05:00:00.000Z", 260);
    await weigh("2047-02-13", [[hers.tagNumber, 260]]);
    // Dead after she came, the morning she was weighed.
    const morning = await as("owner", "2047-02-13T06:00:00.000Z");
    await morning.client.animals.recordMortality({
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
    const hers = await bull("2047-02-12T05:00:00.000Z", 230);
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
    const hers = await bull("2047-02-15T05:00:00.000Z", 240);
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

    // And the first Venture's closing story still adds up: every bull it bought is sold, sold on, bought back, dead,
    // lost or standing — the one sold on to the other Venture among them, not missing from all six.
    const story = await theirHerdStory(scratchDb(), theFarm().id, ventureId);
    const standing = await scratchDb().query.animal.findMany({
      where: {
        farmId: theFarm().id,
        ownerVentureId: ventureId,
        state: { notIn: [...EXIT_STATES] },
      },
      columns: { id: true },
    });
    expect(story.boughtCount).toBe(
      story.soldCount +
        story.soldAcrossCount +
        story.boughtBackCount +
        story.diedCount +
        story.lostCount +
        standing.length
    );
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
    const hers = await bull("2047-02-18T05:00:00.000Z", 250);
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
    const weighed = await bull("2047-03-01T05:00:00.000Z", 240);
    const unweighed = await bull("2047-03-01T05:10:00.000Z");
    const gone = await bull("2047-03-01T05:20:00.000Z", 250);
    await weigh("2047-03-02", [
      [weighed.tagNumber, 240],
      [gone.tagNumber, 250],
    ]);
    // Dead after he came, the morning he was weighed.
    const morning = await as("owner", "2047-03-02T06:00:00.000Z");
    await morning.client.animals.recordMortality({
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
    const [paper] = await owner.client.ventures.agreements.list({ ventureId });
    // Twenty Units at fifty thousand, paid in full when the Venture was funded.
    expect(paper).toMatchObject({ capitalLeftMoney: 0 });
  });
});

describe("a Venture's animal it bought in, lost and made good", () => {
  it("is made good at what she cost the Venture — her price to it and its charges — not her life on the farm", async () => {
    // Bought by the Farm at ৳60,000; sold on to the Venture at 182 kg × ৳400 = ৳72,800; nothing charged since.
    const hers = await bull("2047-03-08T05:00:00.000Z");
    await weigh("2047-03-10", [[hers.tagNumber, 182]]);
    const owner = await as("owner", "2047-03-10T09:00:00.000Z");
    await owner.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 400,
      note: `আজকের হাটের দর ${suffix}`,
      soldOn: "2047-03-10",
      paymentMethod: "bank",
      reference: `INT-LOST-${suffix}`,
      priceMoney: 72_800,
    });
    const manager = await as("manager", "2047-03-11T05:00:00.000Z");
    await manager.client.animals.notFound({ tagNumber: hers.tagNumber });
    const writing = await as("owner", "2047-03-12T05:00:00.000Z");
    await writing.client.animals.writeOff({
      tagNumber: hers.tagNumber,
      cause: "জানা নেই",
      madeGood: { reference: `MG-INT-${suffix}` },
    });

    const made = await scratchDb().query.ventureMovement.findMany({
      where: {
        farmId: theFarm().id,
        ventureId,
        kind: "made_good",
        reference: `MG-INT-${suffix}`,
      },
      columns: { amountMoney: true },
    });
    expect(made).toEqual([{ amountMoney: 72_800 }]);
  });
});

describe("a bull the Farm bought back from a Venture", () => {
  it("earns the Farm what it sold him for less what it paid for him, not less what somebody else first paid", async () => {
    // The Farm buys him at ৳60,000 and sells him to the Venture at 182 kg × ৳350 = ৳63,700; buys him back at 184 kg ×
    // ৳400 = ৳73,600; a buyer pays ৳90,000. The Farm's Margin on him: ৳16,400 — not ৳30,000 off his first price.
    const his = await bull("2047-08-01T05:00:00.000Z");
    await weigh("2047-08-03", [[his.tagNumber, 182]]);
    const owner = await as("owner", "2047-08-03T09:00:00.000Z");
    await owner.client.ventures.sellInternally({
      tagNumber: his.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 350,
      note: `আজকের হাটের দর ${suffix}`,
      soldOn: "2047-08-03",
      paymentMethod: "bank",
      reference: `INT-OUT-${suffix}`,
      priceMoney: 63_700,
    });
    await weigh("2047-08-05", [[his.tagNumber, 184]]);
    const back = await as("owner", "2047-08-05T09:00:00.000Z");
    await back.client.ventures.sellInternally({
      tagNumber: his.tagNumber,
      rateMoneyPerKg: 400,
      note: `ফেরত কেনা ${suffix}`,
      soldOn: "2047-08-05",
      paymentMethod: "bank",
      reference: `INT-BACK-${suffix}`,
      priceMoney: 73_600,
    });
    // What he has cost the Farm, as his price is weighed against it: what it paid to have him back.
    const pricing = await back.client.fattening.prices();
    expect(
      pricing.animals.find((one) => one.tagNumber === his.tagNumber)?.costMoney
    ).toBe(73_600);
    const manager = await as("manager", "2047-08-10T05:00:00.000Z");
    await manager.client.sales.record({
      tagNumber: his.tagNumber,
      buyer: { name: `কসাই ${suffix}` },
      destination: "গাবতলী",
      vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৬",
      driver: "সোহেল",
      priceMoney: 90_000,
      weightKg: 190,
    });

    const reading = await as("owner", "2047-08-20T04:00:00.000Z");
    const { months } = await reading.client.monthlyReport.get();
    expect(
      months.find((one) => one.month === "2047-08")?.fattening.marginMoney
    ).toBe(16_400);
  });
});

describe("a bull sold to a Venture the day he arrived", () => {
  it("is the Venture's once, at what it paid for him — and his price at the lorry is the Farm's", async () => {
    // What the Venture is charged for buying, as its Settlement reads it: its own buying, and what it paid to take
    // animals on.
    const bought = async (instant: string) => {
      const owner = await as("owner", instant);
      const worked = await owner.client.ventures.settlement.get({ ventureId });
      return worked.charges.find((one) => one.word === "bought")?.amount ?? 0;
    };
    const before = await bought("2047-10-01T02:00:00.000Z");
    // Off the lorry at nine in the morning at ৳60,000, weighed at noon, sold to the Venture that afternoon at 180 kg ×
    // ৳400: the Venture paid ৳72,000 for him, and nothing for the Farm's buying at the lorry.
    const his = await bull("2047-10-01T03:00:00.000Z");
    await weigh("2047-10-01", [[his.tagNumber, 180]]);
    const selling = await as("owner", "2047-10-01T10:00:00.000Z");
    await selling.client.ventures.sellInternally({
      tagNumber: his.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 400,
      note: `একই দিনে ${suffix}`,
      soldOn: "2047-10-01",
      paymentMethod: "bank",
      reference: `INT-SAMEDAY-${suffix}`,
      priceMoney: 72_000,
    });
    expect((await bought("2047-10-01T11:00:00.000Z")) - before).toBe(72_000);
  });

  it("is refused a sale dated before he came", async () => {
    const his = await bull("2047-10-05T03:00:00.000Z");
    await weigh("2047-10-05", [[his.tagNumber, 180]]);
    const owner = await as("owner", "2047-10-05T10:00:00.000Z");
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: his.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 400,
        note: `আগের তারিখে ${suffix}`,
        soldOn: "2047-10-04",
        paymentMethod: "bank",
        reference: `INT-BEFORE-${suffix}`,
        priceMoney: 72_000,
      })
    ).rejects.toMatchObject({ data: { refusal: "sold_before_she_came" } });
  });

  it("is refused a sale dated on a day that has not come yet", async () => {
    // A day typed ten days on would make him the Venture's at once, and his death before that day unsayable.
    const his = await bull("2047-10-06T03:00:00.000Z");
    await weigh("2047-10-06", [[his.tagNumber, 180]]);
    const owner = await as("owner", "2047-10-06T10:00:00.000Z");
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: his.tagNumber,
        toVentureId: ventureId,
        rateMoneyPerKg: 400,
        note: `পরের তারিখে ${suffix}`,
        soldOn: "2047-10-16",
        paymentMethod: "bank",
        reference: `INT-AHEAD-${suffix}`,
        priceMoney: 72_000,
      })
    ).rejects.toMatchObject({ data: { refusal: "sold_in_the_future" } });
  });
});

describe("a bull sold to a Venture and bought back the day he arrived", () => {
  it("pays his Market Toll into the Farm's Season once, in the Holding he came off the lorry in", async () => {
    // A window of his own, so his Season is finished once he is sold and can be opened out.
    const window = { start: "2047-12-20", end: "2047-12-22" };
    const manager = await as("manager", "2047-11-03T03:00:00.000Z");
    const his = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `হাটের ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      marketTollMoney: 1500,
      weightKg: 180,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2047-11-03T03:00:00.000Z"),
      targetWindowStart: window.start,
      targetWindowEnd: window.end,
    });
    await weigh("2047-11-03", [[his.tagNumber, 180]]);
    const owner = await as("owner", "2047-11-03T10:00:00.000Z");
    await owner.client.ventures.sellInternally({
      tagNumber: his.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 400,
      note: `সকালে বেচা ${suffix}`,
      soldOn: "2047-11-03",
      paymentMethod: "bank",
      reference: `INT-ROUND-OUT-${suffix}`,
      priceMoney: 72_000,
    });
    const later = await as("owner", "2047-11-03T12:00:00.000Z");
    await later.client.ventures.sellInternally({
      tagNumber: his.tagNumber,
      rateMoneyPerKg: 410,
      note: `বিকেলে ফেরত ${suffix}`,
      soldOn: "2047-11-03",
      paymentMethod: "bank",
      reference: `INT-ROUND-BACK-${suffix}`,
      priceMoney: 73_800,
      targetWindow: window,
    });
    // What he has cost the Farm since it had him back: what it paid, and not the toll of the Holding before.
    const pricing = await later.client.fattening.prices();
    expect(
      pricing.animals.find((one) => one.tagNumber === his.tagNumber)?.costMoney
    ).toBe(73_800);
    const selling = await as("manager", "2047-11-20T05:00:00.000Z");
    await selling.client.sales.record({
      tagNumber: his.tagNumber,
      buyer: { name: `কসাই ${suffix}` },
      destination: "গাবতলী",
      vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৭",
      driver: "সোহেল",
      priceMoney: 95_000,
      weightKg: 200,
    });

    const reading = await as("owner", "2047-12-30T04:00:00.000Z");
    const lines = await reading.client.returns.breakdown({
      seasonKey: seasonOf(window).key,
      by: "animal",
    });
    const cost = (came: string) =>
      lines.find(
        (one) =>
          one.line.kind === "animal" &&
          one.line.tagNumber === his.tagNumber &&
          one.line.came === came
      )?.costMoney;
    // Bought at ৳60,000 with ৳1,500 of toll at the lorry; bought back at ৳73,800 just after, with no toll again.
    expect(cost("intake")).toBe(61_500);
    expect(cost("bought_from_venture")).toBe(73_800);
  });
});

describe("an Intake put right after an Internal Sale", () => {
  it("keeps its money with the purse that bought him, and is refused a new owner", async () => {
    const farmBull = await bull("2047-05-01T05:00:00.000Z", 250);
    await weigh("2047-05-02", [[farmBull.tagNumber, 250]]);
    const owner = await as("owner", "2047-05-03T04:00:00.000Z");
    await owner.client.ventures.sellInternally({
      tagNumber: farmBull.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-05-03",
      paymentMethod: "bank",
      reference: `INT-CORR-${suffix}`,
      priceMoney: 75_000,
    });

    // His price at the gate was sixty-one thousand, not sixty: the Farm bought him, and the Farm's books are put right.
    const manager = await as("manager", "2047-05-04T04:00:00.000Z");
    await manager.client.intakes.correct({
      id: farmBull.intakeId,
      reason: "দাম ভুল লেখা হয়েছিল",
      changes: { purchasePriceMoney: { from: 60_000, to: 61_000 } },
    });
    const paid = await scratchDb().query.moneyEvent.findFirst({
      where: { source: "intake", sourceId: farmBull.intakeId },
      columns: { amountMoney: true, purseVentureId: true },
    });
    expect(paid).toMatchObject({ amountMoney: 61_000, purseVentureId: null });

    // Whose he is now was settled by the Internal Sale, not by his Intake.
    await expect(
      owner.client.intakes.correct({
        id: farmBull.intakeId,
        reason: "মালিক ভুল",
        changes: { owner: { from: ventureId, to: null } },
      })
    ).rejects.toMatchObject({ data: { refusal: "sold_on_since" } });
  });
});

describe("a Sale of hers put right", () => {
  it("is not dated before the Internal Sale that made her the Venture's", async () => {
    const farmBull = await bull("2047-06-01T05:00:00.000Z", 250);
    await weigh("2047-06-19", [[farmBull.tagNumber, 250]]);
    const owner = await as("owner", "2047-06-20T04:00:00.000Z");
    await owner.client.ventures.sellInternally({
      tagNumber: farmBull.tagNumber,
      toVentureId: ventureId,
      rateMoneyPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-06-20",
      paymentMethod: "bank",
      reference: `INT-DAY-${suffix}`,
      priceMoney: 75_000,
    });
    const manager = await as("manager", "2047-07-15T05:00:00.000Z");
    const sold = await manager.client.sales.record({
      tagNumber: farmBull.tagNumber,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceMoney: 97_000,
      weightKg: 300,
      destination: `হাট ${suffix}`,
      vehicle: `ট্রাক ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
      reference: `SALE-DAY-${suffix}`,
    });
    await expect(
      manager.client.sales.correct({
        id: sold.id,
        reason: `দিন ভুল ${suffix}`,
        changes: {
          soldAt: {
            from: "2047-07-15T05:00:00.000Z",
            to: new Date("2047-06-15T05:00:00.000Z"),
          },
        },
      })
    ).rejects.toMatchObject({ data: { refusal: "before_she_was_here" } });
  });
});

describe("a bull the Farm sold to a Venture and bought back", () => {
  it("is the Farm's margin from buying him back, not his first stretch twice", async () => {
    const manager = await as("manager", "2047-11-01T05:00:00.000Z");
    const bought = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      marketTollMoney: 2000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2047-11-01T05:00:00.000Z"),
      targetWindowStart: "2047-12-17",
      targetWindowEnd: "2047-12-19",
    });
    await weigh("2047-11-09", [[bought.tagNumber, 250]]);
    const owner = await as("owner", "2047-11-10T04:00:00.000Z");
    // A Venture of its own, still buying: the file's first has been carried on to later states by the tests above.
    const buying = await funded(owner, 7);
    await owner.client.ventures.sellInternally({
      tagNumber: bought.tagNumber,
      toVentureId: buying,
      rateMoneyPerKg: 252,
      note: `দর ${suffix}`,
      soldOn: "2047-11-10",
      paymentMethod: "bank",
      reference: `INT-OUT-${suffix}`,
      priceMoney: 63_000,
    });
    await weigh("2047-11-11", [[bought.tagNumber, 250]]);
    const back = await as("owner", "2047-11-12T04:00:00.000Z");
    await back.client.ventures.sellInternally({
      tagNumber: bought.tagNumber,
      // To the Farm.
      rateMoneyPerKg: 252,
      note: `ফেরত ${suffix}`,
      soldOn: "2047-11-12",
      paymentMethod: "bank",
      reference: `INT-BACK-${suffix}`,
      priceMoney: 63_000,
    });
    // November's margin before he is sold, so his own is what it moves by: other bulls in this file sell that month too.
    const earlier = await as("owner", "2047-12-01T04:00:00.000Z");
    const without = await earlier.client.monthlyReport.get();
    const marginBefore =
      without.months.find((one) => one.month === "2047-11")?.fattening
        .marginMoney ?? 0;
    const selling = await as("manager", "2047-11-12T08:00:00.000Z");
    await selling.client.sales.record({
      tagNumber: bought.tagNumber,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceMoney: 70_000,
      weightKg: 260,
      destination: `হাট ${suffix}`,
      vehicle: `ট্রাক ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
      reference: `BACK-SALE-${suffix}`,
    });
    const reading = await as("owner", "2047-12-01T04:00:00.000Z");
    const his = await reading.client.costs.forAnimal({
      tagNumber: bought.tagNumber,
    });
    const { months } = await reading.client.monthlyReport.get();
    const august = months.find((one) => one.month === "2047-11");
    // Sold at seventy thousand, bought back at sixty-three: the toll he paid on his first stretch was the Venture's
    // price to recover, never the Farm's twice.
    expect(his).toBeDefined();
    expect((august?.fattening.marginMoney ?? 0) - marginBefore).toBe(7000);

    // And the Venture's own progress still has him, gone from its herd: once read off whose he is today, he vanished
    // from it while its paper still charged it for him.
    const run = await scratchDb().query.venture.findFirst({
      where: { id: buying },
      columns: { id: true, targetWindowStart: true, targetWindowEnd: true },
    });
    const progress = await theirProgress(
      scratchDb(),
      theFarm().id,
      run ?? { id: buying, targetWindowStart: "", targetWindowEnd: "" },
      new Date("2047-12-01T04:00:00.000Z")
    );
    expect(
      progress.animals.find((one) => one.tagNumber === bought.tagNumber)
    ).toMatchObject({ standing: false });
  });
});

describe("a bull the Farm's float bought, sold to a Venture before the float is counted home", () => {
  it("is still what the float bought, whoever owns him now", async () => {
    const owner = await as("owner", "2047-10-20T03:00:00.000Z");
    const taker = await funded(owner, 9);
    const manager = await as("manager", "2047-10-20T03:00:00.000Z");
    const trip = await manager.client.buyingTrips.record({
      wentTo: `ফ্লোটের হাট ${suffix}`,
      transportMoney: 2000,
      paymentMethod: "cash",
      wentOn: new Date("2047-10-20T03:00:00.000Z"),
    });
    await owner.client.cash.handOver({
      from: { userId: thePerson("owner").id },
      to: { userId: thePerson("manager").id },
      amountMoney: 150_000,
      buyingTripId: trip.id,
    });
    const bought = [];
    for (const name of ["ক", "খ"]) {
      // One lorry, one bull after the other.
      // oxlint-disable-next-line no-await-in-loop
      const one = await manager.client.intakes.record({
        penId,
        sex: "male",
        seller: { name: `ব্যাপারী ${name} ${suffix}` },
        purchasePriceMoney: 60_000,
        weightKg: 180,
        estimatedAgeMonths: 20,
        arrivedAt: new Date("2047-10-20T03:00:00.000Z"),
        buyingTripId: trip.id,
        paymentMethod: "cash",
        targetWindowStart: "2047-05-17",
        targetWindowEnd: "2047-05-19",
      });
      bought.push(one);
    }
    const [first] = bought;
    await weigh("2047-10-21", [[first?.tagNumber ?? "", 180]]);
    const selling = await as("owner", "2047-10-21T10:00:00.000Z");
    await selling.client.ventures.sellInternally({
      tagNumber: first?.tagNumber ?? "",
      toVentureId: taker,
      rateMoneyPerKg: 400,
      note: `ফ্লোট গোনার আগে ${suffix}`,
      soldOn: "2047-10-21",
      paymentMethod: "bank",
      reference: `INT-FLOAT-${suffix}`,
      priceMoney: 72_000,
    });
    const floats = await selling.client.cash.tripFloats();
    // Both bulls and the lorry: ৳122,000 bought, ৳28,000 to come back.
    expect(floats.find((one) => one.tripId === trip.id)).toMatchObject({
      handedMoney: 150_000,
      boughtMoney: 122_000,
    });
    await selling.client.cash.countFloatHome({
      tripId: trip.id,
      cashBackMoney: 28_000,
    });
  });
});

describe("an Internal Sale put right", () => {
  it("moves the price, both purses and the Farm's books together, and the weighing it was priced from stands", async () => {
    // A Venture of its own, still buying: the file's first has moved on by now.
    const mine = await funded(
      await as("owner", "2047-02-20T04:00:00.000Z"),
      41
    );
    const hers = await bull("2047-02-20T05:00:00.000Z");
    await weigh("2047-02-21", [[hers.tagNumber, 200]]);
    const owner = await as("owner", "2047-02-21T09:00:00.000Z");
    const before = await owner.client.ventures.list();
    const heldBefore = before.find((one) => one.id === mine)?.balanceMoney ?? 0;
    // ৳35 a kilo typed for ৳350.
    const sold = await owner.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: mine,
      rateMoneyPerKg: 35,
      note: `দর ভুল লেখা ${suffix}`,
      soldOn: "2047-02-21",
      paymentMethod: "bank",
      reference: `INT-FIX-${suffix}`,
      priceMoney: 7000,
    });

    await owner.client.ventures.correctInternalSale({
      id: sold.id,
      reason: `দর ৩৫০, ৩৫ নয় ${suffix}`,
      changes: { rateMoneyPerKg: { from: 35, to: 350 } },
    });

    const after = await owner.client.ventures.list();
    expect(after.find((one) => one.id === mine)?.balanceMoney).toBe(
      heldBefore - 70_000
    );
    const money = await scratchDb().query.moneyEvent.findFirst({
      where: { sourceId: sold.id },
      columns: { amountMoney: true },
    });
    expect(money?.amountMoney).toBe(70_000);
    const row = await scratchDb().query.internalSale.findFirst({
      where: { id: sold.id },
      columns: { priceMoney: true, rateMoneyPerKg: true },
    });
    expect(row).toEqual({ priceMoney: 70_000, rateMoneyPerKg: "350.00" });

    // The reading she was priced at is what the sale says she weighed: it is put right through the sale, not under it.
    const animalRow = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: hers.tagNumber },
      columns: { id: true },
    });
    const reading = await scratchDb().query.weighIn.findFirst({
      where: { animalId: animalRow?.id ?? "" },
      columns: { completionId: true },
    });
    const staff = await as("staff", "2047-02-21T08:00:00.000Z");
    await expect(
      correctStepAsShown(staff.client, {
        completionId: reading?.completionId ?? "",
        evidence: [300],
        reason: `ভুল ওজন ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "priced_from_this_weighing" } });
  });
});
