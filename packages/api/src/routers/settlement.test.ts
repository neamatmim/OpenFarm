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
 * What a Settlement is, and what blocks it: the close-out of a Venture shown before anything is done, and
 * refused in words while anything about it is still a guess.
 */
const suffix = `settle-${Date.now()}`;

const as = (role: "owner" | "manager" | "staff", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2047-01-20",
  targetWindowStart: "2047-03-17",
  targetWindowEnd: "2047-03-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

const feedSop = (): SopContent => ({
  name: { bn: `খাওয়ানো ${suffix}`, en: "Feeding" },
  purpose: { bn: "পেনে খাবার দেওয়া" },
  triggers: [{ kind: "schedule", times: ["06:00"] }],
  assignedRole: "staff",
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

type Owner = Awaited<ReturnType<typeof as>>;

let penId = "";
let ventureId = "";
let feedItemId = "";
let tripId = "";
let feedSopId = "";
const tags: string[] = [];
const saleIds: string[] = [];
const intakeIds: string[] = [];

const theSettlement = async (owner: Owner, which = ventureId) =>
  await owner.client.ventures.settlement({ ventureId: which });

const wordsOf = (blocks: readonly { word: string }[]) =>
  blocks.map((one) => one.word);

/** A Venture signed for, paid into and buying. */
const funded = async (owner: Owner, which: number) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${which} ${suffix}`,
    ...plan,
  });
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${which} ${suffix}`,
    phone: `0192${String(which).padStart(7, "0")}`,
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

  ventureId = await funded(owner, 1);

  // Two bulls bought on the Venture's own Float, so their price and the outing's costs are its charges.
  const manager = await as("manager", "2047-01-04T05:00:00.000Z");
  const buying = await as("owner", "2047-01-04T04:00:00.000Z");
  const trip = await buying.client.trips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2047-01-04",
    brokerBdt: 2000,
    transportBdt: 3000,
    keepBdt: 0,
  });
  tripId = trip.id;
  await buying.client.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: 200_000,
    movedOn: "2047-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const broughtIn = async () => {
    const her = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 80_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      buyingTripId: trip.id,
      ventureId,
      arrivedAt: new Date("2047-01-04T05:00:00.000Z"),
      targetWindowStart: plan.targetWindowStart,
      targetWindowEnd: plan.targetWindowEnd,
    });
    tags.push(her.tagNumber);
    intakeIds.push(her.intakeId);
  };
  await broughtIn();
  await broughtIn();

  // Feed, so there is something for a month's Reimbursement to be about.
  const feeding = await as("manager", "2047-01-05T05:00:00.000Z");
  const item = await feeding.client.feed.addItem({
    name: { bn: `দানাদার ${suffix}` },
  });
  feedItemId = item.id;
  await feeding.client.stock.receive({
    feedItemId,
    kind: "purchase",
    quantity: 5000,
    priceBdt: 200_000,
    seller: { name: `ডিলার ${suffix}` },
    receivedOn: "2047-01-05",
  });
  const ration = await feeding.client.feed.saveRation({
    name: { bn: `রেশন ${suffix}` },
    items: [{ feedItemId, kgPerAnimalPerDay: 5 }],
  });
  await feeding.client.feed.assignRation({
    penId,
    rationId: ration.rationId,
  });
  const sop = await owner.client.sops.create({ content: feedSop() });
  feedSopId = sop.definitionId;
  const scheduler = await as("owner", "2047-01-06T06:30:00.000Z");
  await scheduler.client.instances.ensureDue();
  const today = await scheduler.client.instances.today({ penId });
  const instance = today.find((one) => one.definitionId === sop.definitionId);
  const staff = await as("staff", "2047-01-06T06:30:00.000Z");
  await staff.client.instances.claim({ id: instance?.id ?? "" });
  // A thousand kilos at forty taka: forty thousand of feed, charged to the two of them.
  await staff.client.instances.completeStep({
    instanceId: instance?.id ?? "",
    stepId: "feed",
    evidence: [true],
    feeding: [{ feedItemId, givenKg: 1000 }],
  });
});

describe("what a Settlement is", () => {
  it("says everything that makes it a guess, and still shows the figures", async () => {
    const owner = await as("owner", "2047-02-05T04:00:00.000Z");
    const settlement = await theSettlement(owner);
    // Both bulls still standing, the Float not counted home, January not reimbursed and never read
    // against the bank.
    expect(wordsOf(settlement.blocks)).toEqual([
      "an_animal_still_stands",
      "a_float_is_open",
      "a_reimbursement_is_owed",
      "the_bank_disagrees",
    ]);
    // And the figures come all the same, because she is owed the shape of the answer while she works.
    expect(settlement.charges.map((one) => one.word)).toEqual([
      "bought",
      "hasil",
      "trips",
      "feed",
      "medicine",
      "vet",
      "herd",
    ]);
    expect(settlement.units).toBe(20);
    expect(settlement.investorsPercent).toBe(60);
  });

  it("divides on the terms in force, not on the terms that were signed", async () => {
    // An amendment that moved the paper and not the money would be worse than no amendment at all: the
    // যোগদানপত্র would promise a man fifty-five while the Settlement quietly paid him sixty.
    const owner = await as("owner", "2047-02-05T05:00:00.000Z");
    const third = await funded(owner, 3);
    await owner.client.ventures.amend({
      ventureId: third,
      investorsPercent: 55,
      targetWindowStart: plan.targetWindowStart,
      targetWindowEnd: plan.targetWindowEnd,
      signedOn: "2047-02-04",
      reason: `সবাই মিলে ভাগ বদলেছি ${suffix}`,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    const settlement = await theSettlement(owner, third);
    expect(settlement.investorsPercent).toBe(55);
    // And two Agreements are not in disagreement merely because one amendment moved them both.
    expect(wordsOf(settlement.blocks)).not.toContain("agreements_disagree");
  });

  it("charges a herd nobody has weighed, and will not rate it", async () => {
    // Story 50. These bulls have really been bought, carried and fed, so there is something charged to
    // them — but nobody has put them on the scale since they arrived, so nothing is known to have been
    // gained. A rate over no gain is not zero and not infinity: it is unanswerable, and says so.
    const owner = await as("owner", "2047-02-05T06:00:00.000Z");
    const theirs = await owner.client.ventures.economics({ ventureId });

    expect(theirs.animals).toHaveLength(2);
    expect(theirs.chargedBdt).toBeGreaterThan(0);
    expect(theirs.gainKg).toBe(0);
    expect(theirs.costOfGainBdt).toBeNull();
    expect(theirs.animals.every((one) => one.costOfGainBdt === null)).toBe(
      true
    );

    // Neither has been sold, so neither has earned a Margin yet and the herd has none either.
    expect(theirs.soldCount).toBe(0);
    expect(theirs.unsoldCount).toBe(2);
    expect(theirs.marginBdt).toBeNull();
    expect(theirs.animals.every((one) => one.marginBdt === null)).toBe(true);
  });

  it("charges the run what its animals cost, whichever purse paid", async () => {
    const owner = await as("owner", "2047-02-06T04:00:00.000Z");
    const settlement = await theSettlement(owner);
    const line = (word: string) =>
      settlement.charges.find((one) => one.word === word)?.bdt;
    // Two bulls at eighty thousand, out of its own Float.
    expect(line("bought")).toBe(160_000);
    // The outing's broker and lorry, split between the two of them.
    expect(line("trips")).toBe(5000);
    // A thousand kilos at forty taka, which the Farm bought and will be reimbursed for.
    expect(line("feed")).toBe(40_000);
  });

  it("clears every block, and then adds up exactly", async () => {
    // The Float comes home: two hundred thousand went out, a hundred and sixty bought the bulls and
    // five thousand was the outing's own cost, so thirty-five thousand comes back.
    const counting = await as("owner", "2047-02-01T04:00:00.000Z");
    await counting.client.ventures.reconcileFloat({
      buyingTripId: tripId,
      cashBackBdt: 35_000,
      movedOn: "2047-02-01",
      reference: `DEP-${suffix}`,
    });
    // January's feed is repaid.
    const paying = await as("owner", "2047-02-02T04:00:00.000Z");
    await paying.client.ventures.reimburse({
      ventureId,
      month: "2047-01",
      movedOn: "2047-02-02",
      paymentMethod: "bank",
      reference: `REI-${suffix}`,
      amountBdt: 40_000,
    });
    // The Owner's own money goes in to keep them, and comes back at cost before any capital does.
    await paying.client.ventures.advance({
      ventureId,
      amountBdt: 50_000,
      movedOn: "2047-02-02",
      paymentMethod: "bank",
      reference: `ADV-${suffix}`,
    });

    // Both months read against the statement.
    const reading = await as("owner", "2047-03-01T04:00:00.000Z");
    await reading.client.ventures.checkTheBank({
      ventureId,
      month: "2047-01",
      readBdt: 800_000,
    });
    await reading.client.ventures.checkTheBank({
      ventureId,
      month: "2047-02",
      readBdt: 845_000,
    });

    // They eat again in March, the month she means to settle in — a month that cannot be reimbursed
    // until it is over, and so a month the Settlement must not quietly promise its way past.
    const scheduler = await as("owner", "2047-03-10T06:30:00.000Z");
    await scheduler.client.instances.ensureDue();
    const due = await scheduler.client.instances.today({ penId });
    const instance = due.find((one) => one.definitionId === feedSopId);
    const eating = await as("staff", "2047-03-10T06:30:00.000Z");
    await eating.client.instances.claim({ id: instance?.id ?? "" });
    await eating.client.instances.completeStep({
      instanceId: instance?.id ?? "",
      stepId: "feed",
      evidence: [true],
      feeding: [{ feedItemId, givenKg: 100 }],
    });

    // And both bulls go to a buyer, for four lakh five thousand and five taka between them.
    const selling = await as("manager", "2047-03-18T05:00:00.000Z");
    for (const [at, priceBdt] of [
      [0, 202_505],
      [1, 202_500],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one lorry at a time
      const sold = await selling.client.sale.record({
        tagNumber: tags[at] ?? "",
        buyer: { name: `ক্রেতা ${at} ${suffix}` },
        priceBdt,
        weightKg: 340,
        destination: `ঢাকা ${suffix}`,
        vehicle: `ঢাকা মেট্রো ${suffix}`,
        driver: `চালক ${suffix}`,
        paymentMethod: "bank",
      });
      saleIds.push(sold.id);
    }

    const owner = await as("owner", "2047-03-25T04:00:00.000Z");
    const settlement = await theSettlement(owner);
    // March's feed is owed to the Farm and cannot be paid until March is over. A Settlement that let
    // that through would promise the Investors money the account still has to part with.
    expect(wordsOf(settlement.blocks)).toEqual(["a_reimbursement_is_owed"]);
    expect(settlement.blocks[0]).toMatchObject({ months: ["2047-03"] });
  });

  it("adds up exactly once nothing at all is owed", async () => {
    // March ends, its feed is repaid and its statement read.
    const april = await as("owner", "2047-04-01T04:00:00.000Z");
    await april.client.ventures.reimburse({
      ventureId,
      month: "2047-03",
      movedOn: "2047-04-01",
      paymentMethod: "bank",
      reference: `REI2-${suffix}`,
      amountBdt: 4000,
    });
    await april.client.ventures.checkTheBank({
      ventureId,
      month: "2047-03",
      readBdt: 1_250_005,
    });

    const owner = await as("owner", "2047-04-05T04:00:00.000Z");
    const settlement = await theSettlement(owner);
    expect(settlement.blocks).toEqual([]);
    expect(settlement).toMatchObject({
      proceedsBdt: 405_005,
      chargedBdt: 209_000,
      profitBdt: 196_005,
      // Sixty per cent of one lakh ninety-six thousand and five is a hundred and seventeen thousand
      // six hundred and three, which will not divide twenty ways in whole taka: three taka is left
      // over and it is the Farm's.
      investorsBdt: 117_603,
      perUnitBdt: 5880,
      roundingBdt: 3,
      farmBdt: 78_405,
      advanceBdt: 50_000,
      capitalBdt: 1_000_000,
    });
    expect(settlement.payouts).toEqual([
      expect.objectContaining({
        units: 20,
        capitalBdt: 1_000_000,
        shareBdt: 117_600,
        payoutBdt: 1_117_600,
      }),
    ]);

    // The whole of it: what the Owner is owed back, what the Investors are paid, and the Farm's share
    // are exactly what the account holds. A Settlement that does not is one that cannot be paid — and
    // it only holds because nothing is owed, which is what every block above is for.
    const owedOut =
      settlement.advanceBdt +
      settlement.payouts.reduce((sum, one) => sum + one.payoutBdt, 0) +
      settlement.farmBdt;
    expect(owedOut).toBe(settlement.balanceBdt);
  });

  it("says a price is missing, and shows a loss as a loss", async () => {
    // A second run, fed on the farm's own harvested fodder, which has no price until somebody sets one.
    const owner = await as("owner", "2047-04-01T04:00:00.000Z");
    const second = await funded(owner, 2);
    const manager = await as("manager", "2047-04-02T05:00:00.000Z");
    const trip = await owner.client.trips.record({
      wentTo: `হাট দুই ${suffix}`,
      wentOn: "2047-04-01",
      brokerBdt: 0,
      transportBdt: 0,
      keepBdt: 0,
    });
    await owner.client.ventures.drawFloat({
      ventureId: second,
      buyingTripId: trip.id,
      amountBdt: 100_000,
      movedOn: "2047-04-01",
      paymentMethod: "bank",
      reference: `FLT2-${suffix}`,
    });
    const her = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 100_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      buyingTripId: trip.id,
      ventureId: second,
      arrivedAt: new Date("2047-04-02T05:00:00.000Z"),
      targetWindowStart: plan.targetWindowStart,
      targetWindowEnd: plan.targetWindowEnd,
    });
    // The farm's own fodder: harvested, never bought, so the store holds kilos at no price at all and
    // nothing can say what a kilo of it cost.
    const fodder = await manager.client.feed.addItem({
      name: { bn: `নিজের খড় ${suffix}` },
    });
    await manager.client.stock.receive({
      feedItemId: fodder.id,
      kind: "harvest",
      quantity: 2000,
      receivedOn: "2047-04-02",
    });
    const ration = await manager.client.feed.saveRation({
      name: { bn: `রেশন দুই ${suffix}` },
      items: [{ feedItemId: fodder.id, kgPerAnimalPerDay: 5 }],
    });
    await manager.client.feed.assignRation({
      penId,
      rationId: ration.rationId,
    });
    const scheduler = await as("owner", "2047-04-02T06:30:00.000Z");
    await scheduler.client.instances.ensureDue();
    const due = await scheduler.client.instances.today({ penId });
    const instance = due.find((one) => one.definitionId === feedSopId);
    const staff = await as("staff", "2047-04-02T06:30:00.000Z");
    await staff.client.instances.claim({ id: instance?.id ?? "" });
    await staff.client.instances.completeStep({
      instanceId: instance?.id ?? "",
      stepId: "feed",
      evidence: [true],
      feeding: [{ feedItemId: fodder.id, givenKg: 300 }],
    });

    // The Owner's own money in this one as well, so an Advance is seen coming back out of a run that
    // lost money as well as one that made money.
    const advancing = await as("owner", "2047-04-02T07:00:00.000Z");
    await advancing.client.ventures.advance({
      ventureId: second,
      amountBdt: 10_000,
      movedOn: "2047-04-02",
      paymentMethod: "bank",
      reference: `ADV2-${suffix}`,
    });

    const blocked = await theSettlement(owner, second);
    // Three hundred kilos nobody can put a price on, she is still standing, and the Float that bought
    // her has not been counted home.
    expect(wordsOf(blocked.blocks)).toEqual([
      "an_animal_still_stands",
      "a_price_is_missing",
      "a_float_is_open",
    ]);

    // She goes for well under what she cost, and the run loses money.
    const selling = await as("manager", "2047-04-03T05:00:00.000Z");
    await selling.client.sale.record({
      tagNumber: her.tagNumber,
      buyer: { name: `ক্রেতা দুই ${suffix}` },
      priceBdt: 60_000,
      weightKg: 210,
      destination: `ঢাকা ${suffix}`,
      vehicle: `ঢাকা মেট্রো ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
    });
    const after = await as("owner", "2047-04-04T04:00:00.000Z");
    const settlement = await theSettlement(after, second);
    // Forty thousand less than she cost, and it reads as a loss rather than as nothing.
    expect(settlement).toMatchObject({
      proceedsBdt: 60_000,
      chargedBdt: 100_000,
      profitBdt: -40_000,
      investorsBdt: -24_000,
      perUnitBdt: -1200,
      farmBdt: -16_000,
      // Repaid at cost, out of a run that lost money: the Owner's taka went in to feed their animals.
      advanceBdt: 10_000,
    });
    // It comes off the capital the Investor gets back, by the Units he holds.
    expect(settlement.payouts[0]).toMatchObject({
      units: 20,
      capitalBdt: 1_000_000,
      shareBdt: -24_000,
      payoutBdt: 976_000,
    });
  });

  it("refuses a payout before anything is approved", async () => {
    const owner = await as("owner", "2047-04-06T03:00:00.000Z");
    const agreements = await owner.client.ventures.agreements({ ventureId });
    await expect(
      owner.client.ventures.paySettlement({
        ventureId,
        agreementId: agreements[0]?.id ?? "",
        amountBdt: 1_117_600,
        movedOn: "2047-04-06",
        paymentMethod: "bank",
        reference: `PAY-${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_yet_approved" },
    });
  });

  it("freezes the figures on approval, whatever the costing says afterwards", async () => {
    const owner = await as("owner", "2047-04-06T04:00:00.000Z");
    await owner.client.ventures.approveSettlement({
      ventureId,
      note: `হিসাব চূড়ান্ত ${suffix}`,
    });
    const approved = await owner.client.ventures.approvedSettlement({
      ventureId,
    });
    expect(approved).toMatchObject({
      profitBdt: 196_005,
      perUnitBdt: 5880,
      farmBdt: 78_405,
      advanceBdt: 50_000,
      allPaid: false,
    });

    // A late cost lands — the vet's bill for a visit that named one of them. The costing moves; what
    // was approved does not.
    const late = await as("owner", "2047-04-07T04:00:00.000Z");
    const categories = await late.client.money.categories();
    const charged = categories.find(
      (one) => one.enterable && one.chargeable && one.direction === "out"
    );
    await late.client.money.setChargedToAnimals({
      categoryId: charged?.id ?? "",
      chargedToAnimals: true,
    });
    await late.client.money.enter({
      side: "fattening",
      categoryId: charged?.id ?? "",
      amountBdt: 9000,
      occurredOn: "2047-03-11",
      counterparty: { name: `দোকান ${suffix}` },
      note: `দেরিতে আসা খরচ ${suffix}`,
      paymentMethod: "bank",
    });
    const stillSays = await late.client.ventures.approvedSettlement({
      ventureId,
    });
    expect(stillSays).toMatchObject({ profitBdt: 196_005, perUnitBdt: 5880 });

    // Approving twice is two answers to one question.
    await expect(
      late.client.ventures.approveSettlement({ ventureId })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "already_approved" },
    });
  });

  it("pays each Investor what he is owed, and refuses anything else", async () => {
    const owner = await as("owner", "2047-04-08T04:00:00.000Z");
    const approved = await owner.client.ventures.approvedSettlement({
      ventureId,
    });
    const his = approved?.shares[0];
    // Her own money comes back before any capital does, whatever else is right about the payment.
    await expect(
      owner.client.ventures.paySettlement({
        ventureId,
        agreementId: his?.agreementId ?? "",
        amountBdt: 1_117_600,
        movedOn: "2047-04-08",
        paymentMethod: "bank",
        reference: `PAY-${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "advance_comes_first" },
    });
    await owner.client.ventures.repayAdvance({
      ventureId,
      movedOn: "2047-04-08",
      paymentMethod: "bank",
      reference: `ADVBACK-${suffix}`,
    });

    // And not a figure she has typed from memory.
    await expect(
      owner.client.ventures.paySettlement({
        ventureId,
        agreementId: his?.agreementId ?? "",
        amountBdt: 1_200_000,
        movedOn: "2047-04-08",
        paymentMethod: "bank",
        reference: `PAY-${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_what_he_is_owed" },
    });

    await owner.client.ventures.paySettlement({
      ventureId,
      agreementId: his?.agreementId ?? "",
      amountBdt: 1_117_600,
      movedOn: "2047-04-08",
      paymentMethod: "bank",
      reference: `PAY-${suffix}`,
    });
    // Twice for one man is once too many.
    await expect(
      owner.client.ventures.paySettlement({
        ventureId,
        agreementId: his?.agreementId ?? "",
        amountBdt: 1_117_600,
        movedOn: "2047-04-08",
        paymentMethod: "bank",
        reference: `PAY2-${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "already_paid" },
    });

    // It went out on a movement of the Venture's money, with the reference it went on.
    const movements = await owner.client.ventures.movements({ ventureId });
    expect(movements.find((one) => one.kind === "payout")).toMatchObject({
      amountBdt: 1_117_600,
      movedOn: "2047-04-08",
      reference: `PAY-${suffix}`,
    });
  });

  it("takes his word for it, and settles on the last of the money", async () => {
    const owner = await as("owner", "2047-04-09T04:00:00.000Z");
    const approved = await owner.client.ventures.approvedSettlement({
      ventureId,
    });
    const his = approved?.shares[0];
    await owner.client.ventures.acknowledgePayout({
      ventureId,
      agreementId: his?.agreementId ?? "",
      note: `ফোনে বললেন পেয়েছেন ${suffix}`,
    });
    const said = await owner.client.ventures.approvedSettlement({ ventureId });
    expect(said?.shares[0]).toMatchObject({
      paid: true,
      acknowledgedNote: `ফোনে বললেন পেয়েছেন ${suffix}`,
    });

    // Not finished yet: the Farm's own share is still sitting in the account, and the Farm's money
    // never stays in a Venture Account.
    const between = await owner.client.ventures.list();
    expect(between.find((one) => one.id === ventureId)?.state).toBe("selling");

    const booksBefore = await owner.client.money.list({
      from: "2047-04-01",
      to: "2047-04-30",
    });
    const took = await owner.client.ventures.takeTheFarmsShare({
      ventureId,
      movedOn: "2047-04-09",
      paymentMethod: "bank",
      reference: `FARM-${suffix}`,
    });
    // The last of the money out, and the Venture is Settled by itself. The account closes at nothing,
    // which is what a closed account reads.
    const after = await owner.client.ventures.list();
    expect(after.find((one) => one.id === ventureId)).toMatchObject({
      state: "settled",
      balanceBdt: 0,
    });

    // And it arrives where it was going: what the Farm managed the run for is the Farm's earnings, so
    // it is income on the Farm's own books. An Investor's payout is not, and never was — that is his
    // own capital and profit going home.
    const books = await owner.client.money.list({
      from: "2047-04-01",
      to: "2047-04-30",
    });
    const earned = books.events.filter((one) => one.source === "farm_share");
    expect(earned).toHaveLength(1);
    expect(earned[0]).toMatchObject({
      direction: "in",
      amountBdt: took.paidBdt,
    });
    expect(books.events.length).toBe(booksBefore.events.length + 1);
  });

  it("shuts the doors a settled Venture should have shut", async () => {
    const owner = await as("owner", "2047-04-10T04:00:00.000Z");
    // Its books are closed on the figures every Investor was paid on, so nothing may move its money —
    // and it is shut from the moment the Settlement is approved, not from the moment it is Settled.
    await expect(
      owner.client.ventures.advance({
        ventureId,
        amountBdt: 1000,
        movedOn: "2047-04-10",
        paymentMethod: "bank",
        reference: `LATE-ADV-${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "already_approved" },
    });

    // Nor is an Intake of one of its animals, whose price and Hasil the Settlement was worked out
    // from — the words say what to do instead.
    await expect(
      owner.client.intake.correct({
        id: intakeIds[0] ?? "",
        reason: `দাম ভুল ছিল ${suffix}`,
        changes: { purchasePriceBdt: { from: 80_000, to: 70_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_is_settled" },
    });

    // Nor may the terms move any more. Every Investor has been paid on the split and the window as
    // they stood at approval; an amendment afterwards would restate what the money already did.
    await expect(
      owner.client.ventures.amend({
        ventureId,
        investorsPercent: 50,
        targetWindowStart: plan.targetWindowStart,
        targetWindowEnd: plan.targetWindowEnd,
        signedOn: "2047-04-10",
        reason: `দেরিতে সংশোধন ${suffix}`,
        contentType: "image/jpeg",
        data: "aGVsbG8=",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "already_approved" },
    });

    // And a movement of its money is no longer the Owner's to put right: a Settlement Adjustment is.
    const movements = await owner.client.ventures.movements({ ventureId });
    const capital = movements.find((one) => one.kind === "capital_in");
    await expect(
      owner.client.ventures.correctMovement({
        id: capital?.id ?? "",
        reason: `ভুল ছিল ${suffix}`,
        changes: { amountBdt: { from: 1_000_000, to: 900_000 } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "venture_is_settled" },
    });
  });

  it("notes a small Adjustment and moves nothing", async () => {
    const owner = await as("owner", "2047-04-11T04:00:00.000Z");
    // Her line for what is worth a trip to the bank.
    await owner.client.farm.setParameters({ adjustmentThresholdBdt: 10_000 });
    // A vet's bill that was in a pocket: two hundred taka against one of the bulls.
    const late = await as("owner", "2047-04-11T05:00:00.000Z");
    const categories = await late.client.money.categories();
    const charged = categories.find(
      (one) => one.enterable && one.chargeable && one.direction === "out"
    );
    await late.client.money.enter({
      side: "fattening",
      categoryId: charged?.id ?? "",
      amountBdt: 200,
      occurredOn: "2047-03-12",
      counterparty: { name: `ডাক্তার ${suffix}` },
      note: `পকেটে পড়ে ছিল ${suffix}`,
      paymentMethod: "bank",
    });
    const raised = await late.client.ventures.raiseAdjustment({
      ventureId,
      reason: `দেরিতে আসা ভেটের বিল ${suffix}`,
    });
    // An Adjustment is measured against the figures that were frozen, not against the last Adjustment,
    // so it carries everything that has landed since — the nine thousand from before and this two
    // hundred. Five and a half thousand across the Units, which is under her line: written down, and
    // nothing moves.
    expect(raised.outcome).toBe("noted");

    const settlement = await late.client.ventures.approvedSettlement({
      ventureId,
    });
    // And the Settlement's own figures have not moved a taka.
    expect(settlement).toMatchObject({ profitBdt: 196_005, perUnitBdt: 5880 });
    expect(settlement?.adjustments[0]).toMatchObject({
      outcome: "noted",
      reason: `দেরিতে আসা ভেটের বিল ${suffix}`,
    });
  });

  it("notes a large one the Investors lost by, and chases nobody", async () => {
    const owner = await as("owner", "2047-04-12T04:00:00.000Z");
    const categories = await owner.client.money.categories();
    const charged = categories.find(
      (one) => one.enterable && one.chargeable && one.direction === "out"
    );
    // Twenty thousand this time: well over her line, and all of it bad news.
    await owner.client.money.enter({
      side: "fattening",
      categoryId: charged?.id ?? "",
      amountBdt: 20_000,
      occurredOn: "2047-03-13",
      counterparty: { name: `দোকান দুই ${suffix}` },
      note: `বড় বিল ${suffix}`,
      paymentMethod: "bank",
    });
    const raised = await owner.client.ventures.raiseAdjustment({
      ventureId,
      reason: `দেরিতে আসা বড় খরচ ${suffix}`,
    });
    // Over her line, but downward: money already paid is never chased, so there is nothing anybody can
    // do about it and it would be ceremony to leave it waiting to be waived.
    expect(raised.outcome).toBe("noted");
    await expect(
      owner.client.ventures.payAdjustment({
        ventureId,
        adjustmentId: raised.id,
        movedOn: "2047-04-12",
        paymentMethod: "bank",
        reference: `ADJ-${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "adjustment_is_closed" },
    });

    const settlement = await owner.client.ventures.approvedSettlement({
      ventureId,
    });
    // And the Settlement's own figures have not moved through any of it.
    expect(settlement).toMatchObject({ profitBdt: 196_005, perUnitBdt: 5880 });
  });

  it("pays one the Investors gained by, out of the Farm's own books", async () => {
    const owner = await as("owner", "2047-04-13T04:00:00.000Z");
    // The buyer had underpaid and made it up: the Sale is put right upwards, months after settling.
    await owner.client.sale.correct({
      id: saleIds[0] ?? "",
      reason: `ক্রেতা বাকি টাকা দিয়েছে ${suffix}`,
      changes: { priceBdt: { from: 202_505, to: 260_000 } },
    });
    const raised = await owner.client.ventures.raiseAdjustment({
      ventureId,
      reason: `বিক্রির দাম সংশোধন ${suffix}`,
    });
    expect(raised.outcome).toBe("outstanding");

    const before = await owner.client.money.list({
      from: "2047-04-01",
      to: "2047-04-30",
    });
    const paid = await owner.client.ventures.payAdjustment({
      ventureId,
      adjustmentId: raised.id,
      movedOn: "2047-04-13",
      paymentMethod: "bank",
      reference: `ADJPAY-${suffix}`,
    });
    expect(paid.paidBdt).toBeGreaterThan(0);

    // On the Farm's own books, because the Venture Account closed when the Settlement was paid out.
    const after = await owner.client.money.list({
      from: "2047-04-01",
      to: "2047-04-30",
    });
    const supplementary = after.events.filter(
      (one) => one.source === "settlement_adjustment"
    );
    expect(supplementary).toHaveLength(1);
    expect(after.events.length).toBe(before.events.length + 1);

    const settlement = await owner.client.ventures.approvedSettlement({
      ventureId,
    });
    // And after everything — noted, waived and paid — the Settlement still says what it always said.
    expect(settlement).toMatchObject({ profitBdt: 196_005, perUnitBdt: 5880 });
    expect(settlement?.adjustments.map((one) => one.outcome)).toEqual([
      "noted",
      "noted",
      "paid",
    ]);
  });

  it("does not pay the same good news twice", async () => {
    const owner = await as("owner", "2047-04-14T04:00:00.000Z");
    const paidAlready = await owner.client.money.list({
      from: "2047-04-01",
      to: "2047-04-30",
    });
    const before = paidAlready.events
      .filter((one) => one.source === "settlement_adjustment")
      .reduce((sum, one) => sum + one.amountBdt, 0);

    // A second piece of late news, worth much less than the first.
    await owner.client.sale.correct({
      id: saleIds[1] ?? "",
      reason: `আরেকটু বেশি এসেছে ${suffix}`,
      changes: { priceBdt: { from: 202_500, to: 212_500 } },
    });
    const raised = await owner.client.ventures.raiseAdjustment({
      ventureId,
      reason: `দ্বিতীয় সংশোধন ${suffix}`,
    });
    const paid = await owner.client.ventures.payAdjustment({
      ventureId,
      adjustmentId: raised.id,
      movedOn: "2047-04-14",
      paymentMethod: "bank",
      reference: `ADJPAY2-${suffix}`,
    });

    // Ten thousand of new proceeds, sixty per cent of it to the Investors: six thousand, floored across
    // twenty Units. Not the whole difference since the Settlement, which the first payout already sent.
    expect(paid.paidBdt).toBeLessThan(10_000);
    const after = await owner.client.money.list({
      from: "2047-04-01",
      to: "2047-04-30",
    });
    const total = after.events
      .filter((one) => one.source === "settlement_adjustment")
      .reduce((sum, one) => sum + one.amountBdt, 0);
    expect(total - before).toBe(paid.paidBdt);
  });

  it("lets the Owner waive one she would rather not send", async () => {
    const owner = await as("owner", "2047-04-15T04:00:00.000Z");
    // More good news, over her line — and she decides it is not worth a trip to the bank after all.
    await owner.client.sale.correct({
      id: saleIds[1] ?? "",
      reason: `আরও কিছু এসেছে ${suffix}`,
      changes: { priceBdt: { from: 212_500, to: 245_000 } },
    });
    const raised = await owner.client.ventures.raiseAdjustment({
      ventureId,
      reason: `তৃতীয় সংশোধন ${suffix}`,
    });
    expect(raised.outcome).toBe("outstanding");
    await owner.client.ventures.waiveAdjustment({
      ventureId,
      adjustmentId: raised.id,
      note: `খামার বহন করবে ${suffix}`,
    });
    // Once dealt with, it stays dealt with.
    await expect(
      owner.client.ventures.waiveAdjustment({
        ventureId,
        adjustmentId: raised.id,
        note: `আবার ${suffix}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "adjustment_is_closed" },
    });
    const settlement = await owner.client.ventures.approvedSettlement({
      ventureId,
    });
    // Through noted, paid and waived alike, the Settlement says what it always said.
    expect(settlement).toMatchObject({ profitBdt: 196_005, perUnitBdt: 5880 });
    expect(settlement?.adjustments.at(-1)).toMatchObject({
      outcome: "waived",
      waivedNote: `খামার বহন করবে ${suffix}`,
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager", "2047-03-26T04:00:00.000Z");
    await expect(
      manager.client.ventures.settlement({ ventureId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
