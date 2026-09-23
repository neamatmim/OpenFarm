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
import { appRouter } from "./index";

/**
 * The Internal Sale: an Animal sold between the Farm's herd and a Venture at her latest Weigh-in times a
 * rate the Owner enters, with the money moving through the Venture Account — a sale, not a book entry.
 */
const suffix = `internal-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2047-02-20",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 1_000_000,
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
    stampValueBdt: 300,
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
    amountBdt: 1_000_000,
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
  return await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 60_000,
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
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId });
  const instance = today.find((one) => one.definitionId === definitionId);
  if (!instance) {
    throw new Error("expected a weigh-in instance");
  }
  const staff = await as("staff", `${day}T07:30:00.000Z`);
  await staff.client.instances.claim({ id: instance.id });
  for (const [tagNumber, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- the crush takes one animal at a time
    await staff.client.instances.completeStep({
      instanceId: instance.id,
      stepId: "weigh",
      animalTag: tagNumber,
      evidence: [kg],
    });
  }
};

beforeAll(async () => {
  const owner = await as("owner", "2047-02-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
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
      before.find((one) => one.id === ventureId)?.balanceBdt ?? 0;

    const sold = await owner.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: ventureId,
      rateBdtPerKg: 350,
      note: `আজকের হাটের দর ${suffix}`,
      soldOn: "2047-02-06",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceBdt: 77_000,
    });
    expect(sold).toMatchObject({
      weightKg: 220,
      rateBdtPerKg: 350,
      priceBdt: 77_000,
    });

    // She is the Venture's now, and the Venture's account is lighter by what she cost.
    const her = await owner.client.animals.byTag({ tagNumber: hers.tagNumber });
    expect(her.owner).toMatchObject({ id: ventureId });
    const after = await owner.client.ventures.list();
    const venture = after.find((one) => one.id === ventureId);
    expect(venture).toMatchObject({
      balanceBdt: heldBefore - 77_000,
      spentBdt: 77_000,
    });
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
        changes: { amountBdt: { from: 77_000, to: 70_000 } },
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
      rateBdtPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-08",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceBdt: 63_000,
    });
    const mid = await owner2.client.ventures.list();
    const spentThen = mid.find((one) => one.id === ventureId)?.spentBdt ?? 0;

    // And back to the Farm at the same weight and rate.
    const back = await owner2.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      rateBdtPerKg: 300,
      note: `ফেরত ${suffix}`,
      soldOn: "2047-02-08",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceBdt: 63_000,
    });
    expect(back.priceBdt).toBe(63_000);
    const her = await owner2.client.animals.byTag({
      tagNumber: hers.tagNumber,
    });
    expect(her.owner).toBeNull();
    const after = await owner2.client.ventures.list();
    const venture = after.find((one) => one.id === ventureId);
    // What it was paid for her is the Venture's own proceeds, and its spending is unchanged.
    expect(venture).toMatchObject({
      proceedsBdt: 63_000,
      spentBdt: spentThen,
    });
  });

  it("refuses an animal nobody has weighed", async () => {
    const unweighed = await bull("2047-02-09T05:00:00.000Z");
    const owner = await as("owner", "2047-02-09T09:00:00.000Z");
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: unweighed.tagNumber,
        toVentureId: ventureId,
        rateBdtPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-09",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceBdt: 1,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "never_weighed" },
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
    await manager.client.ready.confirm({ tagNumber: hers.tagNumber });
    await expect(
      owner.client.ventures.sellInternally({
        tagNumber: hers.tagNumber,
        toVentureId: ventureId,
        rateBdtPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-11",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceBdt: 1,
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
        rateBdtPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-13",
        paymentMethod: "bank",
        reference: `INT-DEAD-${suffix}`,
        priceBdt: 78_000,
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
      rateBdtPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-13",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceBdt: 69_000,
    });
    // Already theirs.
    await expect(
      later.client.ventures.sellInternally({
        tagNumber: hers.tagNumber,
        toVentureId: ventureId,
        rateBdtPerKg: 300,
        note: `আবার ${suffix}`,
        soldOn: "2047-02-13",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceBdt: 69_000,
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
      rateBdtPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-16",
      paymentMethod: "bank",
      reference: `INT-${suffix}`,
      priceBdt: 72_000,
    });
    const before = await selling.client.ventures.list();
    const firstSpent =
      before.find((one) => one.id === ventureId)?.spentBdt ?? 0;

    // And on to the other Venture: one pays, the other is paid, on the one act.
    await selling.client.ventures.sellInternally({
      tagNumber: hers.tagNumber,
      toVentureId: other,
      rateBdtPerKg: 300,
      note: `দর ${suffix}`,
      soldOn: "2047-02-16",
      paymentMethod: "bank",
      reference: `INT2-${suffix}`,
      priceBdt: 72_000,
    });
    const after = await selling.client.ventures.list();
    expect(after.find((one) => one.id === ventureId)).toMatchObject({
      proceedsBdt: expect.any(Number),
      spentBdt: firstSpent,
    });
    expect(after.find((one) => one.id === other)).toMatchObject({
      spentBdt: 72_000,
    });
    const her = await selling.client.animals.byTag({
      tagNumber: hers.tagNumber,
    });
    expect(her.owner).toMatchObject({ id: other });
  });

  it("refuses a dairy cow, whatever the rate", async () => {
    const owner = await as("owner", "2047-02-17T04:00:00.000Z");
    const dairyShed = await owner.client.herd.createShed({
      name: `দুধ ${suffix}`,
    });
    const dairyPen = await owner.client.herd.createPen({
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
        rateBdtPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-17",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceBdt: 1,
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
        rateBdtPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-19",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceBdt: 75_000,
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
      expect.objectContaining({ amountBdt: 63_000, direction: "out" }),
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
        rateBdtPerKg: 300,
        note: `দর ${suffix}`,
        soldOn: "2047-02-14",
        paymentMethod: "bank",
        reference: `INT-${suffix}`,
        priceBdt: 1,
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
