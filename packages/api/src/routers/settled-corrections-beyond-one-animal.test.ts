import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { correctStepAsShown } from "../test/correct-step";
import { appRouter } from "./index";

/**
 * A settled Venture refuses the Corrections that reach past the record they name.
 *
 * A feed arrival's price re-prices every feeding of that Feed Item; money entered by hand and charged to
 * the animals is split across a whole Side; a Step Completion moves whatever it fed or weighed. None of the
 * three says a Venture, and each can move what several were settled on at once — so each is put to the
 * costing, and refused where a settled Venture is charged by it. The refusal names them, because an Owner
 * told only "no" would otherwise have to go through the Ventures herself to find where the Settlement
 * Adjustment belongs.
 *
 * Two Ventures stand in one Pen with a bull of the Farm's own, so every one of the three reaches both of
 * them at once — and so that what is charged to the Farm's bull alone is charged to no Venture, and goes
 * through exactly as it did before any of this.
 */
const suffix = `wide-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

type Owner = Awaited<ReturnType<typeof as>>;

const plan = {
  targetCapitalBdt: 500_000,
  floorBdt: 0,
  decideBy: "2049-01-03",
  targetWindowStart: "2049-01-18",
  targetWindowEnd: "2049-01-20",
  unitPriceBdt: 50_000,
  units: 10,
  cattleBudgetBdt: 400_000,
};

/** One Step for the whole Pen: what went into the troughs, once, for everybody standing there. */
const feedSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}` },
  purpose: { bn: "পেনে খাবার দেওয়া" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "manager",
  checkerRole: null,
  graceMinutes: 120,
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

let penId = "";
/** A second Pen no Venture ever stood in, where the Farm's own bull eats out of the same sacks. */
let elsewherePenId = "";
let feedSopId = "";
/** The two settled Ventures, in the order their names sort in, which is the order a refusal names them. */
let ventures: { id: string; name: string }[] = [];
/** The arrival every feeding is priced from, and a second one of feed nobody ever ate. */
let arrivalId = "";
let untouchedArrivalId = "";
let feedItemId = "";
/** The Category the Owner marked as charged to the animals, and the two months entered under it. */
let herdCostId = "";
let januaryMoneyId = "";
let februaryMoneyId = "";
/** The January feeding, which both Ventures' bulls ate, and February's, which only the Farm's bull did. */
let januaryStepId = "";
let februaryStepId = "";
/** The feeding in the other Pen, the day before — no Venture's bull at the trough, and it prices theirs. */
let elsewhereStepId = "";

const theCompletion = async (instanceId: string) => {
  const row = await scratchDb().query.stepCompletion.findFirst({
    where: { instanceId, stepId: "feed" },
    columns: { id: true },
  });
  return row?.id ?? "";
};

/** A Pen fed once, for everybody standing in it. */
const feedThePen = async (which: string, instant: string, givenKg: number) => {
  const manager = await as("manager", instant);
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId: which });
  const instance = today.find((one) => one.definitionId === feedSopId);
  const id = instance?.id ?? "";
  await manager.client.instances.claim({ id });
  await manager.client.instances.completeStep({
    instanceId: id,
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId, givenKg }],
  });
  return await theCompletion(id);
};

/** A Venture signed for, paid into, and with one bull bought on its own Float and brought home. */
const aVentureWithABull = async (owner: Owner, which: number) => {
  const name = `ভেঞ্চার ${which} ${suffix}`;
  const venture = await owner.client.ventures.open({ name, ...plan });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0194${String(which).padStart(7, "0")}`,
  });
  const agreement = await owner.client.ventures.sign({
    ventureId: venture.id,
    investorId: person.id,
    units: 10,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2049-01-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 500_000,
    movedOn: "2049-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}-${which}`,
  });
  await owner.client.ventures.startBuying({ id: venture.id });

  const buying = await as("owner", "2049-01-04T04:00:00.000Z");
  const trip = await buying.client.trips.record({
    wentTo: `হাট ${which} ${suffix}`,
    wentOn: "2049-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.client.ventures.drawFloat({
    ventureId: venture.id,
    buyingTripId: trip.id,
    amountBdt: 200_000,
    movedOn: "2049-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}-${which}`,
  });
  const manager = await as("manager", "2049-01-04T05:00:00.000Z");
  const her = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    buyingTripId: trip.id,
    ventureId: venture.id,
    arrivedAt: new Date("2049-01-04T05:00:00.000Z"),
    targetWindowStart: plan.targetWindowStart,
    targetWindowEnd: plan.targetWindowEnd,
  });
  await buying.client.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackBdt: 100_000,
    movedOn: "2049-01-04",
    reference: `DEP-${suffix}-${which}`,
  });
  return { id: venture.id, name, tagNumber: her.tagNumber };
};

/** Everything that stands between a Venture and its Settlement, cleared — then approved and paid out. */
const settle = async (ventureId: string, month: string) => {
  const reading = await as("owner", "2049-02-01T04:00:00.000Z");
  const held = await reading.client.ventures.list();
  await reading.client.ventures.checkTheBank({
    ventureId,
    month,
    readBdt: held.find((one) => one.id === ventureId)?.balanceBdt ?? 0,
  });
  const paying = await as("owner", "2049-02-02T04:00:00.000Z");
  const consumed = await paying.client.ventures.consumption({
    ventureId,
    month,
  });
  await paying.client.ventures.reimburse({
    ventureId,
    month,
    movedOn: "2049-02-02",
    paymentMethod: "bank",
    reference: `REI-${suffix}-${ventureId.slice(-6)}`,
    amountBdt: consumed.totalBdt,
  });
};

const payOut = async (ventureId: string) => {
  const settling = await as("owner", "2049-03-02T04:00:00.000Z");
  const reading = await settling.client.ventures.list();
  await settling.client.ventures.checkTheBank({
    ventureId,
    month: "2049-02",
    readBdt: reading.find((one) => one.id === ventureId)?.balanceBdt ?? 0,
  });
  await settling.client.ventures.approveSettlement({ ventureId });
  const approved = await settling.client.ventures.approvedSettlement({
    ventureId,
  });
  for (const his of approved?.shares ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time
    await settling.client.ventures.paySettlement({
      ventureId,
      agreementId: his.agreementId,
      amountBdt: his.payoutBdt,
      movedOn: "2049-03-02",
      paymentMethod: "bank",
      reference: `PAY-${suffix}-${his.agreementId.slice(-6)}`,
    });
  }
  if ((approved?.farmBdt ?? 0) > 0) {
    await settling.client.ventures.takeTheFarmsShare({
      ventureId,
      movedOn: "2049-03-02",
      paymentMethod: "bank",
      reference: `FARM-${suffix}-${ventureId.slice(-6)}`,
    });
  }
};

beforeAll(async () => {
  const owner = await as("owner", "2049-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const elsewhere = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `আলাদা ${suffix}`,
  });
  elsewherePenId = elsewhere.id;

  const first = await aVentureWithABull(owner, 1);
  const second = await aVentureWithABull(owner, 2);
  ventures = [
    { id: first.id, name: first.name },
    { id: second.id, name: second.name },
  ];

  // And a bull of the Farm's own in the same Pen, who eats the same feed out of the Farm's own pocket.
  // He is what stays behind when the two runs are over, so a cost that reaches only him reaches no
  // Venture — which is how the Correction that touches nothing settled is told from the ones that do.
  const manager = await as("manager", "2049-01-04T05:30:00.000Z");
  await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2049-01-04T05:30:00.000Z"),
    targetWindowStart: "2049-06-01",
    targetWindowEnd: "2049-06-30",
  });
  // And one more of the Farm's own, in the Pen no Venture ever stands in.
  await manager.client.intake.record({
    penId: elsewherePenId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2049-01-04T05:15:00.000Z"),
    targetWindowStart: "2049-06-01",
    targetWindowEnd: "2049-06-30",
  });

  // Feed bought, a ration the Pen is on, and the SOP that puts it out.
  const feeding = await as("manager", "2049-01-05T05:00:00.000Z");
  const item = await feeding.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
  });
  feedItemId = item.id;
  const arrival = await feeding.client.stock.receive({
    feedItemId,
    kind: "purchase",
    quantity: 5000,
    priceBdt: 200_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2049-01-05",
  });
  arrivalId = arrival.id;
  // A second Feed Item that came in and was never put in front of anybody.
  const straw = await feeding.client.feed.addItem({
    name: { bn: `খড় ${suffix}` },
  });
  const untouched = await feeding.client.stock.receive({
    feedItemId: straw.id,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 10_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2049-01-05",
  });
  untouchedArrivalId = untouched.id;
  const ration = await feeding.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId, kgPerAnimalPerDay: 5 }],
  });
  await feeding.client.feed.assignRation({ penId, rationId: ration.rationId });
  await feeding.client.feed.assignRation({
    penId: elsewherePenId,
    rationId: ration.rationId,
  });
  const sop = await owner.client.sops.create({ content: feedSop() });
  feedSopId = sop.definitionId;

  // The other Pen eats out of the same sacks on the 5th, taking a thousand kilos off what is standing.
  elsewhereStepId = await feedThePen(
    elsewherePenId,
    "2049-01-05T06:30:00.000Z",
    1000
  );
  // A second lot comes in on the 6th and is averaged over what is standing then — which is what the
  // Pen next door ate out of. From here the two feedings are joined: move the 5th and the 6th moves.
  const topUp = await as("manager", "2049-01-06T05:00:00.000Z");
  await topUp.client.stock.receive({
    feedItemId,
    kind: "purchase",
    quantity: 1000,
    priceBdt: 60_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2049-01-06",
  });
  // Then a thousand kilos in front of the Ventures' two bulls and the Farm's, at the blended price.
  januaryStepId = await feedThePen(penId, "2049-01-06T06:30:00.000Z", 1000);

  // Money entered by hand under a Category the Owner marks as the herd's, so January's is split across
  // everybody standing that month — the two Ventures' bulls among them.
  const spraying = await owner.client.money.addCategory({
    nameBn: `মাছি স্প্রে ${suffix}`,
    direction: "out",
  });
  herdCostId = spraying.id;
  await owner.client.money.setChargedToAnimals({
    categoryId: herdCostId,
    chargedToAnimals: true,
  });
  const spending = await as("manager", "2049-01-10T04:00:00.000Z");
  const january = await spending.client.money.enter({
    categoryId: herdCostId,
    amountBdt: 9000,
    occurredOn: "2049-01-10",
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: `জানুয়ারি ${suffix}`,
  });
  januaryMoneyId = january.id;

  // Both Ventures' bulls go to a buyer inside the Target Window, and each run is squared off.
  const selling = await as("manager", "2049-01-19T05:00:00.000Z");
  for (const [at, tagNumber] of [first.tagNumber, second.tagNumber].entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one buyer at a time
    await selling.client.sale.record({
      tagNumber,
      buyer: { name: `ক্রেতা ${at} ${suffix}` },
      priceBdt: 300_000,
      weightKg: 320,
      destination: `ঢাকা ${suffix}`,
      vehicle: `ঢাকা মেট্রো ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
    });
  }
  await settle(first.id, "2049-01");
  await settle(second.id, "2049-01");

  // February: the Farm's bull is the only one left standing, so what he eats and what is sprayed on him
  // is the Farm's own and reaches nobody's Investors.
  februaryStepId = await feedThePen(penId, "2049-02-10T06:30:00.000Z", 100);
  const later = await as("manager", "2049-02-11T04:00:00.000Z");
  const february = await later.client.money.enter({
    categoryId: herdCostId,
    amountBdt: 4000,
    occurredOn: "2049-02-11",
    counterparty: { name: `দোকান ${suffix}` },
    paymentMethod: "cash",
    side: "fattening",
    note: `ফেব্রুয়ারি ${suffix}`,
  });
  februaryMoneyId = february.id;

  await payOut(first.id);
  await payOut(second.id);
});

/** The refusal as the reader gets it: the word, and the Ventures standing in the way, by name. */
const settledRefusal = {
  code: "BAD_REQUEST",
  data: { refusal: "venture_is_settled" },
};

const namesIn = (error: unknown) =>
  (
    (error as { data?: { ventures?: { name: string }[] } }).data?.ventures ?? []
  ).map((one) => one.name);

describe("a Correction that reaches past the record it names", () => {
  it("has two settled Ventures to stand in its way", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    const list = await owner.client.ventures.list();
    expect(
      ventures.map((one) => list.find((row) => row.id === one.id)?.state)
    ).toEqual(["settled", "settled"]);
  });

  it("refuses a feed arrival whose price every settled feeding was read off", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    await expect(
      owner.client.stock.correct({
        id: arrivalId,
        reason: `দাম ভুল ছিল ${suffix}`,
        changes: { priceBdt: { from: 200_000, to: 180_000 } },
      })
    ).rejects.toMatchObject(settledRefusal);
  });

  it("names every settled Venture in the way, not just the first", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    const refused = await owner.client.stock
      .correct({
        id: arrivalId,
        reason: `দাম ভুল ছিল ${suffix}`,
        changes: { priceBdt: { from: 200_000, to: 180_000 } },
      })
      .catch((error: unknown) => error);
    // Both of them ate out of that sack, so a Settlement Adjustment is owed on both — and she is told
    // so here rather than having to go through the Ventures one at a time to find out.
    expect(namesIn(refused).toSorted()).toEqual(
      ventures.map((one) => one.name).toSorted()
    );
  });

  it("refuses money entered by hand that a settled month was charged", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    await expect(
      owner.client.money.correctEntered({
        id: januaryMoneyId,
        reason: `রসিদে অন্য অঙ্ক ${suffix}`,
        changes: { amountBdt: { from: 9000, to: 7500 } },
      })
    ).rejects.toMatchObject(settledRefusal);
  });

  it("refuses a Step whose feeding a settled Venture's bull ate", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    await expect(
      correctStepAsShown(owner.client, {
        completionId: januaryStepId,
        reason: `ওজন ভুল লেখা হয়েছিল ${suffix}`,
        evidence: [true],
        feeding: [{ feedItemId, givenKg: 800 }],
      })
    ).rejects.toMatchObject(settledRefusal);
  });

  it("refuses a Step in a Pen no Venture stood in, for what it re-priced", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    // Nobody's Venture was at that trough. But those kilos came off what was standing when the next lot
    // arrived, so the price the settled bulls were fed at the morning after is worked out from them —
    // and a Settlement was approved on that figure.
    await expect(
      correctStepAsShown(owner.client, {
        completionId: elsewhereStepId,
        reason: `অন্য পেনের ওজন ভুল ${suffix}`,
        evidence: [true],
        feeding: [{ feedItemId, givenKg: 500 }],
      })
    ).rejects.toMatchObject(settledRefusal);
  });

  it("lets a feed arrival nobody was fed from through", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    const put = await owner.client.stock.correct({
      id: untouchedArrivalId,
      reason: `খড়ের দাম ভুল ${suffix}`,
      changes: { priceBdt: { from: 10_000, to: 9000 } },
    });
    expect(put).toMatchObject({ id: untouchedArrivalId });
  });

  it("lets money charged to the Farm's own bull alone through", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    const put = await owner.client.money.correctEntered({
      id: februaryMoneyId,
      reason: `রসিদে অন্য অঙ্ক ${suffix}`,
      changes: { amountBdt: { from: 4000, to: 3500 } },
    });
    expect(put).toMatchObject({ id: februaryMoneyId });
  });

  it("lets a Step through that fed nobody's Venture", async () => {
    const owner = await as("owner", "2049-03-03T04:00:00.000Z");
    const put = await correctStepAsShown(owner.client, {
      completionId: februaryStepId,
      reason: `ওজন ভুল লেখা হয়েছিল ${suffix}`,
      evidence: [true],
      feeding: [{ feedItemId, givenKg: 80 }],
    });
    expect(put).toMatchObject({ completionId: februaryStepId });
  });

  it("refuses money a Correction would carry back into a settled month", async () => {
    const owner = await as("owner", "2049-03-04T04:00:00.000Z");
    // The spraying was really January's. Moving it there charges it to the bulls the Investors were
    // paid on, so it is refused for where it would land rather than for where it sits.
    await expect(
      owner.client.money.correctEntered({
        id: februaryMoneyId,
        reason: `আসলে জানুয়ারির খরচ ${suffix}`,
        changes: { occurredOn: { from: "2049-02-11", to: "2049-01-15" } },
      })
    ).rejects.toMatchObject(settledRefusal);
  });
});
