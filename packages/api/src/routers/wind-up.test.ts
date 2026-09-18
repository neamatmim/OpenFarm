import { penAssignment } from "@OpenFarm/db/schema/herd";
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
 * The buy-back at wind-up: the Wind-up Period ends, animals are still standing, and the Farm buys
 * whatever is left at weight so that nobody's money waits on one slow bull.
 */
const suffix = `windup-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2047-01-20",
  targetWindowStart: "2047-04-17",
  /** Thirty days on from here is 2047-05-19, the last day of the Wind-up Period. */
  targetWindowEnd: "2047-04-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
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

type Owner = Awaited<ReturnType<typeof as>>;

let penId = "";
let definitionId = "";
let ventureId = "";
let neverWeighedVentureId = "";
const tags: string[] = [];
let unweighedTag = "";

const theVenture = async (owner: Owner, which = ventureId) => {
  const ventures = await owner.client.ventures.list();
  return ventures.find((one) => one.id === which);
};

/** A Venture signed for, paid into and buying. */
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
    stampedOn: "2047-01-02",
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
    movedOn: "2047-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${which}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });
  return venture.id;
};

const broughtIn = async (forVenture: string) => {
  const manager = await as("manager", "2047-01-04T05:00:00.000Z");
  const her = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    ventureId: forVenture,
    arrivedAt: new Date("2047-01-04T05:00:00.000Z"),
    targetWindowStart: plan.targetWindowStart,
    targetWindowEnd: plan.targetWindowEnd,
  });
  return her.tagNumber;
};

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
  const owner = await as("owner", "2047-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  await as("staff", "2047-01-01T04:00:00.000Z");
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
  tags.push(
    await broughtIn(ventureId),
    await broughtIn(ventureId),
    await broughtIn(ventureId)
  );
  neverWeighedVentureId = await funded(owner, 2);
  unweighedTag = await broughtIn(neverWeighedVentureId);

  await weigh("2047-04-18", [
    [tags[0] ?? "", 300],
    [tags[1] ?? "", 320],
    [tags[2] ?? "", 280],
  ]);
  await owner.client.ventures.startFattening({ id: ventureId });
  // One sold at the haat inside the window, which is what puts the Venture into Selling — the state the
  // whole wind-up flow happens in. Two are left for the clock to deal with.
  const manager = await as("manager", "2047-04-20T05:00:00.000Z");
  await manager.client.sale.record({
    tagNumber: tags[2] ?? "",
    buyer: { name: `ক্রেতা ${suffix}` },
    priceBdt: 112_000,
    weightKg: 280,
    destination: `ঢাকা ${suffix}`,
    vehicle: `ঢাকা মেট্রো ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod: "bank",
  });
});

const buying = {
  rateBdtPerKg: 400,
  note: `আজকের হাটের দর ${suffix}`,
  paymentMethod: "bank" as const,
  reference: `WND-${suffix}`,
};

describe("the buy-back at wind-up", () => {
  it("shows what is left before anything is bought", async () => {
    const owner = await as("owner", "2047-05-09T04:00:00.000Z");
    const left = await owner.client.ventures.whatIsLeft({ ventureId });
    // The two still standing, with what each last weighed, so the Owner works the price out before she
    // commits. The one already sold at the haat is not among them.
    expect(left.windUpEndsOn).toBe("2047-05-19");
    expect(left.animals.map((one) => one.weightKg).toSorted()).toEqual([
      300, 320,
    ]);
    // And the one nobody has weighed is said to be unweighed while there is still time to fetch her.
    const unweighed = await owner.client.ventures.whatIsLeft({
      ventureId: neverWeighedVentureId,
    });
    expect(unweighed.animals).toEqual([
      { tagNumber: unweighedTag, weightKg: null },
    ]);
  });

  it("is refused while there are still days to sell in", async () => {
    const owner = await as("owner", "2047-05-10T04:00:00.000Z");
    // The tenth of May: the Wind-up Period runs to the nineteenth. It is the clock's act, not a way
    // round the bar on lifting a finished bull out of the pool.
    await expect(
      owner.client.ventures.buyWhatIsLeft({
        ventureId,
        boughtOn: "2047-05-10",
        ...buying,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "wind_up_not_over" },
    });
  });

  it("names the Animal nobody has weighed rather than guessing a price", async () => {
    const owner = await as("owner", "2047-05-20T04:00:00.000Z");
    await expect(
      owner.client.ventures.buyWhatIsLeft({
        ventureId: neverWeighedVentureId,
        boughtOn: "2047-05-20",
        ...buying,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "never_weighed", tagNumber: unweighedTag },
    });
  });

  it("is refused on a day inside the Wind-up Period, however late it is written", async () => {
    const owner = await as("owner", "2047-05-20T04:30:00.000Z");
    // The clock says the period is over — but the day she writes it on is what every month's books
    // read off, and that day may not fall back inside it.
    await expect(
      owner.client.ventures.buyWhatIsLeft({
        ventureId,
        boughtOn: "2047-05-18",
        ...buying,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "wind_up_not_over" },
    });
  });

  it("buys everything left, in one act, each at her own weight", async () => {
    const owner = await as("owner", "2047-05-20T05:00:00.000Z");
    const before = await theVenture(owner);
    expect(before?.state).toBe("selling");
    const bought = await owner.client.ventures.buyWhatIsLeft({
      ventureId,
      boughtOn: "2047-05-20",
      ...buying,
    });
    // Three hundred kilos and three hundred and twenty, at four hundred taka the kilo.
    expect(bought.animals).toHaveLength(2);
    expect(
      bought.animals.map((one) => one.priceBdt).toSorted((a, b) => a - b)
    ).toEqual([120_000, 128_000]);
    expect(bought.totalBdt).toBe(248_000);

    const after = await theVenture(owner);
    expect(after).toMatchObject({
      balanceBdt: (before?.balanceBdt ?? 0) + 248_000,
      animalsStanding: 0,
    });

    // Every one of them is the Farm's now.
    const her = await owner.client.animals.byTag({ tagNumber: tags[0] ?? "" });
    expect(her.owner).toBeNull();

    // And the Farm's own books say it bought two bulls.
    const money = await owner.client.money.list({
      from: "2047-05-01",
      to: "2047-05-31",
    });
    const purchases = money.events.filter(
      (one) => one.source === "internal_sale_out"
    );
    expect(purchases).toHaveLength(2);

    // Each animal has her own Internal Sale in the trail, because what the Owner is asked years later
    // is why this bull was worth that — not what the day came to.
    const trail = await owner.client.audit.list({ entity: "internal_sale" });
    const today = trail.filter(
      (one) =>
        (one.after as { soldOn?: string } | null)?.soldOn === "2047-05-20"
    );
    expect(today).toHaveLength(2);
    expect(today.every((one) => one.reason === buying.note)).toBe(true);

    // And a movement out of the Venture Account for each of them.
    const movements = await owner.client.ventures.movements({ ventureId });
    const sold = movements.filter(
      (one) => one.kind === "internal_sell" && one.movedOn === "2047-05-20"
    );
    expect(sold.map((one) => one.amountBdt).toSorted((a, b) => a - b)).toEqual([
      120_000, 128_000,
    ]);
  });

  it("is refused on a Venture that has been called off", async () => {
    const owner = await as("owner", "2047-05-21T03:00:00.000Z");
    const calledOff = await owner.client.ventures.open({
      name: `বাতিল ${suffix}`,
      ...plan,
    });
    await owner.client.ventures.cancel({
      id: calledOff.id,
      reason: `সীমা ওঠেনি ${suffix}`,
      refunds: [],
    });
    // Its money has gone back; there is nobody left for the Farm to buy anything from.
    await expect(
      owner.client.ventures.buyWhatIsLeft({
        ventureId: calledOff.id,
        boughtOn: "2047-05-21",
        ...buying,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_wrong_state" },
    });
  });

  it("has nothing to buy the second time", async () => {
    const owner = await as("owner", "2047-05-21T04:00:00.000Z");
    await expect(
      owner.client.ventures.buyWhatIsLeft({
        ventureId,
        boughtOn: "2047-05-21",
        ...buying,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "nothing_left_to_buy" },
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2047-05-22T04:00:00.000Z");
    await expect(
      manager.client.ventures.buyWhatIsLeft({
        ventureId,
        boughtOn: "2047-05-22",
        ...buying,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
