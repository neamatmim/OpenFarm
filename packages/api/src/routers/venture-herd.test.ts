import { uuidv7 } from "@OpenFarm/db/ids";
import { and } from "@OpenFarm/db/operators";
import { sale } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { paperText } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { whatSheLastWeighed } from "../venture-store";
import { appRouter } from "./index";

/**
 * What a Venture's cattle are doing — the reading অগ্রগতি is made from.
 *
 * Six bulls and two Ventures, arranged so that every fact this has to tell apart is in the story: one
 * weighed and photographed, one nobody has weighed since he came off the lorry, one who died, one sold
 * across to the second Venture partway through, one weighed later and gaining more slowly, and one sold
 * to a buyer.
 *
 * The two standing weighed bulls gain at different rates over different spans on purpose. Anything less
 * and the herd's own rate would agree with the average of theirs, and the one design decision this
 * reading turns on would have no test that could fail.
 *
 * Every expected figure is worked by hand from the readings. A test that recomputes the answer the way
 * the code does can never disagree with it.
 */
const suffix = `herd-${Date.now()}`;

/** A Latin figure just before a Bangla unit, on a paper read in Bangla: the one thing neither reader reads cleanly. */
const LATIN_BESIDE_BANGLA = /[0-9][0-9,.]* (?:টাকা|দিন|কেজি)/u;
/** A Bangla numeral on a paper read in English. */
const BANGLA_FIGURE = /[০-৯]/u;

const at = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

const asManager = (instant: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(instant) });

const plan = {
  targetCapitalMoney: 500_000,
  floorMoney: 0,
  decideBy: "2052-01-03",
  targetWindowStart: "2052-04-01",
  targetWindowEnd: "2052-04-10",
  unitPriceMoney: 50_000,
  units: 10,
  cattleBudgetMoney: 400_000,
};

/** The round that puts a bull on the scale, and nothing else. */
const weighInSop = (): SopContent => ({
  name: { bn: `ওজন ${suffix}` },
  purpose: { bn: "প্রতিটি পশুর ওজন নেওয়া" },
  triggers: [{ kind: "schedule", times: ["07:00"] }],
  appliesTo: { side: "fattening", states: ["quarantine", "fattening"] },
  assignedRole: "manager",
  checkerRole: null,
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

let firstVenture = "";
let secondVenture = "";
let penId = "";
let sopId = "";
/** Six bulls: weighed, never weighed, died, sold across to the other Venture, weighed later and more
 *  slowly, and one sold to a buyer. */
const tags: string[] = [];

type Client = Awaited<ReturnType<typeof at>>;

const aVenture = async (owner: Client, which: number, splits: number[]) => {
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${which} ${suffix}`,
    ...plan,
  });
  // Everybody signs before buying starts, because Units are fixed once it does.
  for (const [at_, units] of splits.entries()) {
    const who = `${which}-${at_ + 1}`;
    // oxlint-disable-next-line no-await-in-loop -- one man signs at a time
    const person = await owner.client.investors.record({
      name: `বিনিয়োগকারী ${who} ${suffix}`,
      phone: `0198${which}${String(at_).padStart(6, "0")}`,
    });
    // oxlint-disable-next-line no-await-in-loop -- one paper at a time
    const agreement = await owner.client.ventures.agreements.sign({
      ventureId: venture.id,
      investorId: person.id,
      units,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2052-01-01",
      stampSerial: `AA ${who} ${suffix}`,
    });
    // oxlint-disable-next-line no-await-in-loop
    await owner.client.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    // oxlint-disable-next-line no-await-in-loop
    await owner.client.ventures.takeCapital({
      agreementId: agreement.id,
      amountMoney: units * plan.unitPriceMoney,
      movedOn: "2052-01-03",
      paymentMethod: "bank",
      reference: `TRF-${who}-${suffix}`,
    });
  }
  await owner.client.ventures.startBuying({ id: venture.id });
  return venture.id;
};

/** One round of the scale, weighing whichever bulls the caller names. */
const weigh = async (day: string, readings: [number, number][]) => {
  const manager = await asManager(`${day}T07:30:00.000Z`);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId });
  const instance = today.find((one) => one.definitionId === sopId);
  const id = instance?.id ?? "";
  await manager.client.work.claim({ id });
  for (const [index, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as a round is walked
    await manager.client.work.completeStep({
      instanceId: id,
      stepId: "weigh",
      animalTag: tags[index] ?? "",
      evidence: [kg],
    });
  }
};

beforeAll(async () => {
  const owner = await at("2052-01-01T04:00:00.000Z");
  // Every Export is stamped with the Registration number, so the farm has to have written one down.
  await owner.client.farm.setIdentity({
    address: `গ্রাম: শিমুলিয়া, সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000099",
    registrationNumber: `DLS/SAV/2052/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2054-03-31",
  });
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  // Two men on the first Venture — six Units and four — so a sheet for one has the other's name,
  // Units and money within reach of a careless read.
  firstVenture = await aVenture(owner, 1, [6, 4]);
  secondVenture = await aVenture(owner, 2, [10]);

  // Six bulls, all onto the first Venture's books, all at 200 kg on 4 January.
  const buying = await at("2052-01-04T04:00:00.000Z");
  const trip = await buying.client.buyingTrips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2052-01-04",
    brokerMoney: 0,
    transportMoney: 0,
    keepMoney: 0,
  });
  await buying.client.ventures.floats.draw({
    ventureId: firstVenture,
    buyingTripId: trip.id,
    amountMoney: 400_000,
    movedOn: "2052-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await asManager("2052-01-04T05:00:00.000Z");
  for (let which = 0; which < 6; which += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one beast off the lorry at a time
    const her = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceMoney: 60_000,
      weightKg: 200,
      estimatedAgeMonths: 20,
      buyingTripId: trip.id,
      ventureId: firstVenture,
      arrivedAt: new Date("2052-01-04T05:00:00.000Z"),
      targetWindowStart: plan.targetWindowStart,
      targetWindowEnd: plan.targetWindowEnd,
    });
    tags.push(her.tagNumber);
  }
  await buying.client.ventures.floats.reconcile({
    buyingTripId: trip.id,
    // Four lakh out, three lakh sixty spent on six bulls, forty thousand home again.
    cashBackMoney: 40_000,
    movedOn: "2052-01-04",
    reference: `DEP-${suffix}`,
  });

  const sop = await owner.client.sops.create({ content: weighInSop() });
  sopId = sop.definitionId;

  // A photograph of the first bull, so the sheet knows there is a face to leave room for. Nobody has
  // photographed the others.
  const photographing = await asManager("2052-01-05T05:00:00.000Z");
  await photographing.client.animals.setPhoto({
    tagNumber: tags[0] ?? "",
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });

  // 1 February, twenty-eight days on: four of them go on the scale at 228 kg — a kilo a day each. The
  // second bull never goes on it at all, and the fifth waits a fortnight.
  await weigh("2052-02-01", [
    [0, 228],
    [2, 228],
    [3, 228],
    [5, 228],
  ]);

  // 15 February, forty-two days on: the fifth reaches 221, which is half a kilo a day. Two standing
  // bulls now gain at different rates over different spans, which is what tells the herd's own rate
  // from the average of theirs.
  await weigh("2052-02-15", [[4, 221]]);
  // And on the 17th the scale says 400 kg for him: 179 kg in two days, which the farm doubts. Nothing an Investor
  // reads or the Owner's sums are made of may move for it — not the averages, not the line, not his gain.
  await weigh("2052-02-17", [[4, 400]]);

  // The third dies on the 5th of February.
  const losing = await asManager("2052-02-05T05:00:00.000Z");
  await losing.client.animals.recordMortality({
    photo: A_DEATH_PHOTO,
    tagNumber: tags[2] ?? "",
    kind: "died",
    cause: `পেট ফাঁপা ${suffix}`,
    disposal: "buried",
  });

  // And on the 10th the fourth is sold across to the second Venture, at her latest weight.
  const selling = await at("2052-02-10T04:00:00.000Z");
  await selling.client.ventures.sellInternally({
    tagNumber: tags[3] ?? "",
    toVentureId: secondVenture,
    rateMoneyPerKg: 500,
    note: `হাটের দর ${suffix}`,
    soldOn: "2052-02-10",
    paymentMethod: "bank",
    reference: `INT-${suffix}`,
    priceMoney: 228 * 500,
  });

  // And the sixth goes to a buyer on the 18th — after the Internal Sale, because the first Sale moves
  // the Venture to Selling and a Venture that is Selling will not trade an animal across.
  const toABuyer = await asManager("2052-02-18T05:00:00.000Z");
  await toABuyer.client.sales.record({
    tagNumber: tags[5] ?? "",
    buyer: { name: `ক্রেতা ${suffix}` },
    priceMoney: 250_000,
    weightKg: 228,
    destination: `ঢাকা ${suffix}`,
    vehicle: `ঢাকা মেট্রো ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod: "bank",
  });
});

/**
 * This file's SOP applies to the whole Fattening side, so the scheduler raises a round of it in every
 * Pen on the farm that holds one — including the Pens of every other test file, since the database is
 * shared. Retiring it stops new ones; what it already raised has to be shut, or every later
 * `ensureDue` anywhere drags this round along with it.
 */
afterAll(async () => {
  const { eq, inArray } = await import("@OpenFarm/db/operators");
  const db = scratchDb();
  await db
    .update(sopDefinition)
    .set({ retiredAt: new Date() })
    .where(eq(sopDefinition.id, sopId));
  await db
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.definitionId, sopId),
        inArray(sopInstance.state, ["due", "in_progress"])
      )
    );
});

/**
 * The first Venture's plan, written after buying began and so its own baseline: six bulls of 180 to 220 kg at ৳320 a
 * kilo and two of 260 to 300 kg at ৳300, each putting on a kilo a day, sold at ৳500 to ৳600.
 */
const THE_PLAN = {
  lines: [
    { animals: 6, fromKg: 180, toKg: 220, buyMoneyPerKg: 320, dailyGainKg: 1 },
    { animals: 2, fromKg: 260, toKg: 300, buyMoneyPerKg: 300, dailyGainKg: 1 },
  ],
  saleLowMoneyPerKg: 500,
  saleHighMoneyPerKg: 600,
  reason: "পরিকল্পনা পরে লেখা হলো",
};

describe("what a Venture's animals are doing", () => {
  it("counts who stands, who died and who was sold away", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    // Six came in. One died, one went to a buyer, and one went across to the other Venture: gone from this herd as one
    // sold, never vanished from it — six came, and six are accounted for, as the bought line charges for six.
    expect(theirs.standingCount).toBe(3);
    expect(theirs.diedCount).toBe(1);
    expect(theirs.soldCount).toBe(2);
    expect(theirs.animals).toHaveLength(6);
  });

  it("says which bull earned and which did not, worst first", async () => {
    // Story 50. Six came in; one is the other Venture's now, so five are on this paper, and only the one
    // that went to a buyer has earned anything at all.
    const owner = await at("2052-02-20T05:00:00.000Z");
    const theirs = await owner.client.ventures.economics({
      ventureId: firstVenture,
    });

    expect(theirs.animals).toHaveLength(5);
    expect(theirs.soldCount).toBe(1);
    expect(theirs.unsoldCount).toBe(4);

    // A Margin belongs to the sold one alone: the rest have not earned anything yet, and a beast that
    // died never will.
    const withMargin = theirs.animals.filter((one) => one.marginMoney !== null);
    expect(withMargin).toHaveLength(1);
    expect(theirs.marginMoney).toBe(withMargin[0]?.marginMoney);

    // Worst first, and the ones with nothing to compare come last rather than reading as the worst.
    expect(theirs.animals.at(0)?.marginMoney).not.toBeNull();
    expect(theirs.animals.at(-1)?.marginMoney).toBeNull();

    // They put weight on here; nobody has fed them on this farm, so there is nothing charged and each
    // kilogram cost nothing. What a Venture's Cost of Gain is made of is proved where there are real
    // costs to make it of — see settlement.test.ts.
    expect(theirs.gainKg).toBeGreaterThan(0);
    // The fifth put on 21 kg to his 221 on the 15th; the 400 the farm doubted on the 17th is not his gain.
    expect(
      theirs.animals.find((one) => one.tagNumber === tags[4])?.gainKg
    ).toBe(21);
    expect(theirs.chargedMoney).toBe(0);
    expect(theirs.costOfGainMoney).toBe(0);
  });

  it("is the Owner's alone, as the money side of a Venture is", async () => {
    // The Manager reads what they weigh, because he looks after them; what a beast made is hers.
    const manager = await asManager("2052-02-20T06:00:00.000Z");
    await expect(
      manager.client.ventures.economics({ ventureId: firstVenture })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("moves an internally sold animal onto the Venture that now owns her", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: secondVenture,
    });
    expect(theirs.standingCount).toBe(1);
    expect(theirs.animals.map((one) => one.tagNumber)).toEqual([tags[3]]);
  });

  it("tells an animal nobody has weighed from one that has not grown", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    const weighed = theirs.animals.find((one) => one.tagNumber === tags[0]);
    const never = theirs.animals.find((one) => one.tagNumber === tags[1]);
    // 200 kg to 228 kg over twenty-eight days is a kilo a day.
    expect(weighed).toMatchObject({
      intakeKg: 200,
      latestKg: 228,
      dailyGainKg: 1,
    });
    // She came off the lorry at 200 and nobody has put her on the scale since. Her latest weight is
    // what she arrived at, and her gain is *not known* rather than nothing.
    expect(never).toMatchObject({ intakeKg: 200, latestKg: 200 });
    expect(never?.dailyGainKg).toBeNull();
    expect(never?.overDays).toBeNull();
  });

  it("reads a bull bought across from the day it had him, at what it bought him at — never his weeks before", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: secondVenture,
    });
    const his = theirs.animals.find((one) => one.tagNumber === tags[3]);
    // Bought on the 10th at his 228 of 1 February. Nobody has weighed him since he was theirs: he stands at what they
    // bought him at, and what he put on for the first Venture's Investors is not theirs to read as gain.
    expect(his).toMatchObject({ intakeKg: 228, latestKg: 228 });
    expect(his?.dailyGainKg).toBeNull();
    expect(theirs.weights.every((point) => point.day >= "2052-02-10")).toBe(
      true
    );
  });

  it("averages over the animals standing, and works the herd's gain from every animal it has had", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    // Three stand, but only two have been on the scale, and the averages say so and are over those
    // two: 200 each at Intake, 228 and 221 now. The bull nobody weighed is in neither, so "now" is
    // not quietly flattened by an arrival weight that is not a reading.
    expect(theirs.weighedCount).toBe(2);
    expect(theirs.averageIntakeKg).toBe(200);
    expect(theirs.averageLatestKg).toBe(224.5);
    // The herd's gain is over every bull it has had, not the three standing — or it would drift as the fast
    // gainers went to buyers. The first, 28 kg to his weighing on 1 February at 07:30, 28.1 days on; the one who
    // died, the same before he did; the fifth, 21 kg in 42.1 days; the one sold, 28 kg to his 228 at the gate on
    // the 18th, 45 days; and the one sold across, 28 kg to his 228 on the 10th, 36.5 days while he was theirs. 133 kg
    // over 179.8 days is 0.74. Over the two standing alone it was 0.7: this test fails if anybody makes it that.
    expect(theirs.gainKgPerDay).toBe(0.74);
  });

  it("says the day the averages were last read off the scale, from the animals they are over", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    // The fifth bull's round on the 15th, the latest of the two the averages are over. This herd holds no later
    // reading outside them, so it does not prove the others are left out.
    expect(theirs.lastWeighedAt).toEqual(new Date("2052-02-15T07:30:00.000Z"));
    const weighed = theirs.animals.find((one) => one.tagNumber === tags[0]);
    expect(weighed?.latestAt).toEqual(new Date("2052-02-01T07:30:00.000Z"));
  });

  it("follows the averages back through each day the farm weighed, without reading one bull's day as the herd's", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    // The two averaged bulls, as the farm knew them on each day: both off the lorry at 200; the first at 228 on
    // 1 February while the other still stood at his 200; and 228 and 221 on the 15th. Averaging only who was on the
    // scale that day would have read 228 and then 221 — a herd losing weight, from two different bulls.
    expect(theirs.weights).toEqual([
      { day: "2052-01-04", averageKg: 200, animals: 2 },
      { day: "2052-02-01", averageKg: 214, animals: 2 },
      { day: "2052-02-15", averageKg: 224.5, animals: 2 },
    ]);
    // Its ends are the two averages the page says in words.
    expect(theirs.weights.at(0)?.averageKg).toBe(theirs.averageIntakeKg);
    expect(theirs.weights.at(-1)?.averageKg).toBe(theirs.averageLatestKg);
  });

  it("prices an Internal Sale on her last weighing the farm did not doubt", async () => {
    const him = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: tags[4] ?? "" },
      columns: { id: true },
    });
    const weighed = await whatSheLastWeighed(
      scratchDb(),
      theFarm().id,
      him?.id ?? ""
    );
    // Not the 400 kg of the 17th, which at ৳500 a kilo would have moved ৳89,500 more from one purse to the other.
    expect(weighed?.weightKg).toBe(221);
  });

  it("is projected from the animals it stands on, what it sold, and what it has been charged (ADR 0010)", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    await owner.client.ventures.plan.set({
      ventureId: firstVenture,
      ...THE_PLAN,
    });
    const { projection } = await owner.client.ventures.projection({
      ventureId: firstVenture,
    });
    const settlement = await owner.client.ventures.settlement.get({
      ventureId: firstVenture,
    });
    // The three standing, grown to 1 April at their own whole-stay rates: 228 kg at a kilo a day for the 59 days from
    // 1 February is 287; 221 kg at half a kilo for the 45 days from 15 February is 243.5; and the bull nobody weighed
    // has no rate of his own, so he grows at his band's planned kilo a day for the 88 days from his arrival: 288.
    // 818.5 kg. The dead bull and the two sold are not in it.
    expect(projection?.kgAtSale).toBeCloseTo(818.5, 6);
    // What the one sold to a buyer fetched is a fact at both ends — the figure the Settlement counts.
    expect(projection?.realizedMoney).toBe(settlement.proceedsMoney);
    // Charged what the Settlement counts, and the rest of the ৳1,00,000 running budget (৳5,00,000 of capital less
    // ৳4,00,000 for cattle) taken as spent. Selling, it has nothing left to buy.
    const measured = await owner.client.ventures.plan.againstActual({
      ventureId: firstVenture,
    });
    const runningLeft = Math.max(
      0,
      100_000 - (measured?.money.runningSpentMoney ?? 0)
    );
    expect(runningLeft).toBeGreaterThan(0);
    expect(projection?.chargedMoney).toBe(
      settlement.chargedMoney + runningLeft
    );
    expect(projection?.low.proceedsMoney).toBe(
      Math.round(settlement.proceedsMoney + 818.5 * 500)
    );
    expect(projection?.high.proceedsMoney).toBe(
      Math.round(settlement.proceedsMoney + 818.5 * 600)
    );
    // Its Agreements' own split: sixty per cent over the ten Units signed.
    expect(projection).toMatchObject({ investorsPercent: 60, units: 10 });
  });

  it("prices each bull for the Owner at his Venture's prices against what he cost, and for nobody else", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    await owner.client.ventures.plan.set({
      ventureId: firstVenture,
      ...THE_PLAN,
    });
    const { animals } = await owner.client.fattening.prices();
    const first = animals.find((one) => one.tagNumber === tags[0]);
    // ৳60,000 off the lorry and nothing charged since; 228 kg on 1 February. At ৳500 a kilo he fetches ৳1,14,000,
    // ৳54,000 over his cost; at ৳600, ৳1,36,800 and ৳76,800 over. He pays for himself at ৳263.16 a kilo.
    expect(first).toMatchObject({
      costMoney: 60_000,
      costIsWhole: true,
      bought: true,
      latestKg: 228,
      from: "venture",
      breakEvenMoneyPerKg: 263.16,
      low: { priceMoney: 114_000, marginMoney: 54_000 },
      high: { priceMoney: 136_800, marginMoney: 76_800 },
    });

    const manager = await asManager("2052-02-20T06:00:00.000Z");
    await expect(manager.client.fattening.prices()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("says what a kilo fetched in the farm's own sales lately, as a reference beside the market price", async () => {
    // An old cow culled to a butcher on the 19th, 400 kg for ৳1,52,000 — ৳380 a kilo, a Sale like any other.
    const db = scratchDb();
    // This file's own bull: a Tag Number is only unique on one farm, and every test file's farm numbers its own.
    const bull = await db.query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: tags[5] ?? "" },
      columns: { farmId: true },
      with: { sale: { columns: { counterpartyId: true } } },
    });
    const cow = uuidv7();
    await db.insert(animal).values({
      id: cow,
      farmId: bull?.farmId ?? "",
      tagNumber: `D-C-${suffix}`,
      sex: "female",
      side: "dairy",
      state: "sold",
      penId,
      source: "born",
    });
    await db.insert(sale).values({
      id: uuidv7(),
      farmId: bull?.farmId ?? "",
      animalId: cow,
      counterpartyId: bull?.sale?.counterpartyId ?? "",
      priceMoney: 152_000,
      weightKg: "400",
      destination: `কসাই ${suffix}`,
      vehicle: "ভ্যান",
      driver: "চালক",
      note: "বয়স হয়েছে",
      soldAt: new Date("2052-02-19T05:00:00.000Z"),
    });

    const owner = await at("2052-02-20T04:00:00.000Z");
    const { recentSales } = await owner.client.fattening.prices();
    // The one bull sold to a buyer, on the 18th: ৳2,50,000 for 228 kg, ৳1,096.49 a kilo. The one sold across to the
    // other Venture is not a sale to a buyer, and the culled cow is not what a fattened animal fetches: neither is in it.
    expect(recentSales).toMatchObject({ moneyPerKg: 1096.49, animals: 1 });
  });

  it("keeps the farm's market price a kilo as the Owner sets it, and the Owner's alone", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    await owner.client.fattening.setMarketPrice({
      lowMoneyPerKg: 480,
      highMoneyPerKg: 560,
    });
    // A request reads the farm as it stands when it is made.
    const later = await at("2052-02-20T05:00:00.000Z");
    const { market } = await later.client.fattening.prices();
    expect(market).toMatchObject({ lowMoneyPerKg: 480, highMoneyPerKg: 560 });
    await expect(
      owner.client.fattening.setMarketPrice({
        lowMoneyPerKg: 600,
        highMoneyPerKg: 560,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const manager = await asManager("2052-02-20T06:00:00.000Z");
    await expect(
      manager.client.fattening.setMarketPrice({
        lowMoneyPerKg: 480,
        highMoneyPerKg: 560,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("measures what it bought, how it grows and what it makes against its plan", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    // Its plan, made after buying began: its own baseline, and it says why.
    await owner.client.ventures.plan.set({
      ventureId: firstVenture,
      ...THE_PLAN,
    });
    const measured = await owner.client.ventures.plan.againstActual({
      ventureId: firstVenture,
    });

    // Six bulls of 200 kg at ৳60,000 each, ৳300 a kilo, all in the first band — the one later sold across to the other
    // Venture was this one's when it came. The plan had six there at 200 kg and ৳320: ৳3,84,000.
    expect(measured?.buying.bands[0]).toEqual({
      line: { fromKg: 180, toKg: 220, breedId: null },
      planned: { animals: 6, kg: 1200, costMoney: 384_000, moneyPerKg: 320 },
      bought: { animals: 6, kg: 1200, costMoney: 360_000, moneyPerKg: 300 },
    });
    expect(measured?.buying.bands[1]?.bought.animals).toBe(0);
    expect(measured?.buying.outside.animals).toBe(0);
    // Forty-eight days after the decide-by day the plan has six at 248 kg and two at 328: 268 kg a head. The two
    // weighed standing average 224.5.
    expect(measured?.growth).toMatchObject({
      plannedKgToday: 268,
      actualKgToday: 224.5,
      weighed: 2,
    });
    // 2,472 kg at sale after 89 days on feed, sold at ৳500 and ৳600, less ৳5,52,000 of cattle and the ৳1,00,000
    // running budget.
    expect(measured?.money).toMatchObject({
      plannedCattleMoney: 552_000,
      boughtMoney: 360_000,
      planned: { lowMoney: 584_000, highMoney: 831_200 },
    });

    const manager = await asManager("2052-02-20T06:00:00.000Z");
    await expect(
      manager.client.ventures.plan.againstActual({ ventureId: firstVenture })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("counts an animal bought across from another Venture as bought, at what she weighed and cost that day", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    // The second Venture means to buy one bull of 220 to 240 kg, and has: the one it took across at 228 kg for ৳1,14,000.
    await owner.client.ventures.plan.set({
      ventureId: secondVenture,
      lines: [
        {
          animals: 1,
          fromKg: 220,
          toKg: 240,
          buyMoneyPerKg: 500,
          dailyGainKg: 1,
        },
      ],
      saleLowMoneyPerKg: 500,
      saleHighMoneyPerKg: 600,
      reason: "পরিকল্পনা পরে লেখা হলো",
    });
    const measured = await owner.client.ventures.plan.againstActual({
      ventureId: secondVenture,
    });
    expect(measured?.buying.bands[0]?.bought).toEqual({
      animals: 1,
      kg: 228,
      costMoney: 114_000,
      moneyPerKg: 500,
    });
    // So nothing is left to buy, and he is counted once: 228 kg on 1 February at a kilo a day for the 59 days to the
    // window, 287 kg — not again as a bull the plan has still to buy.
    const { projection } = await owner.client.ventures.projection({
      ventureId: secondVenture,
    });
    expect(projection?.kgAtSale).toBeCloseTo(287, 6);
  });

  it("counts the days to the window and never projects past it", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    // 20 February to 1 April.
    expect(theirs.daysToWindow).toBe(41);
    const printed = JSON.stringify(theirs);
    expect(printed).not.toContain("projected");
    expect(printed).not.toContain("reachesTarget");
    expect(printed).not.toContain("onTrack");
  });

  it("says whether the farm holds a photograph of her, without carrying one", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    // One of them has been photographed and the rest have not, and the sheet has to read properly
    // either way — nothing obliges a photograph at Intake.
    const photographed = theirs.animals.find(
      (one) => one.tagNumber === tags[0]
    );
    const not = theirs.animals.find((one) => one.tagNumber === tags[1]);
    expect(photographed?.hasPhoto).toBe(true);
    expect(not?.hasPhoto).toBe(false);
  });

  it("is the Manager's to read as well, and says nothing of Investors", async () => {
    const manager = await asManager("2052-02-20T04:00:00.000Z");
    const theirs = await manager.client.ventures.herd({
      ventureId: firstVenture,
    });
    expect(theirs.standingCount).toBe(3);
    expect(JSON.stringify(theirs)).not.toContain("বিনিয়োগকারী");
  });
});

describe("what the Manager may see of a Venture", () => {
  it("shows him the work and none of the money between her and her Investors", async () => {
    // Its animals are his to look after, so the budgets, what has gone against them and what is going
    // wrong are his. Who paid for them, and what any of them is owed, is not.
    const manager = await asManager("2052-02-20T06:00:00.000Z");
    const running = await manager.client.ventures.running();
    const mine = running.find((one) => one.id === firstVenture);
    expect(mine).toMatchObject({
      name: `ভেঞ্চার 1 ${suffix}`,
      cattleBudgetMoney: expect.any(Number),
      runningBudgetMoney: expect.any(Number),
      spentMoney: expect.any(Number),
      runningBudgetLow: expect.any(Boolean),
      animalsStanding: 3,
    });
    // Asked of the answer itself and not of the screen: a field the client merely does not draw is
    // still a field the client was sent.
    for (const secret of [
      "signedFor",
      "capitalInMoney",
      "paidOutMoney",
      "balanceMoney",
      "unitPriceMoney",
      "units",
      "targetCapitalMoney",
      "floorMoney",
    ]) {
      expect(mine).not.toHaveProperty(secret);
    }
    // The Owner may read the same thing, because she may do anything he does.
    const owner = await at("2052-02-20T06:30:00.000Z");
    expect(await owner.client.ventures.running()).toHaveLength(running.length);
  });
});

describe("অগ্রগতি — the sheet while the run goes on", () => {
  /** His Agreement on the first Venture, and the other man's on the second. */
  const hisAgreement = async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const agreements = await owner.client.ventures.agreements.list({
      ventureId: firstVenture,
    });
    return agreements[0]?.id ?? "";
  };

  it("says how his animals are doing and where his money has gone", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { document } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    const text = paperText(document, "bn");
    expect(text).toContain("অগ্রগতি");
    expect(text).toContain(`বিনিয়োগকারী 1-1 ${suffix}`);
    // Six Units of the ten this Venture has: sixty per cent, and not a word about who holds the four.
    expect(text).toContain("ইউনিট: ৬ (৬০%)");
    // Three standing, one sold to a buyer, one lost.
    expect(text).toContain("দাঁড়িয়ে আছে: ৩");
    expect(text).toContain("মারা গেছে: ১");
    // The bulls it has actually weighed, and what they average.
    expect(text).toContain("ওজন নেওয়া হয়েছে: ২");
    expect(text).toContain("২২৪.৫ কেজি");
    // The herd's gain is over every bull it has had, not the two weighed above it, and says so.
    expect(text).toContain("দৈনিক বৃদ্ধি (বিক্রি ও মৃতসহ সব পশুর): ০.৭৪ কেজি");
    expect(text).not.toMatch(LATIN_BESIDE_BANGLA);
  });

  it("says the same in English, in English numerals and English units", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { document } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    const text = paperText(document, "en");
    expect(text).toContain("Progress statement");
    expect(text).toContain("Units held: 6 (60%)");
    expect(text).toContain("Standing: 3");
    expect(text).toContain("Died: 1");
    expect(text).toContain("Weighed: 2");
    expect(text).toContain("224.5 kg");
    expect(text).toContain(
      "Daily gain (every animal so far, sold and dead included): 0.74 kg"
    );
    expect(text).toContain("Days to the window: 41 days");
    expect(text).toContain("Cattle bought · 360,000 taka");
    expect(text).toContain("Cattle budget left: 154,000 taka");
    expect(text).toContain("not weighed");
    expect(text).toContain(
      "No return is guaranteed. A loss comes off capital."
    );
    expect(text).not.toMatch(BANGLA_FIGURE);
    expect(text).not.toMatch(/টাকা|কেজি|দিন/u);
  });

  it("says in words that a Venture has bought nothing yet", async () => {
    // A third Venture, signed and paid into and buying, with not one animal on it — which is every
    // Venture for the first days of its run, and which the Owner can ask a sheet of, because the
    // joining letter is wanted at exactly that moment and sits beside this button.
    const owner = await at("2052-02-20T04:00:00.000Z");
    const empty = await aVenture(owner, 3, [10]);
    const agreements = await owner.client.ventures.agreements.list({
      ventureId: empty,
    });
    const { document } = await owner.client.investorStatements.progress({
      agreementId: agreements[0]?.id ?? "",
    });
    const text = paperText(document, "bn");
    expect(text).toContain("এখনো কোনো পশু নেই");
    expect(paperText(document, "en")).toContain("None yet");
    // And no column header standing over nothing, which is what she was shown before.
    expect(text).not.toContain("ট্যাগ · শুরুর ওজন");
  });

  it("names a beast nobody has weighed rather than showing her as flat", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { document } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    expect(paperText(document, "bn")).toContain("ওজন নেওয়া হয়নি");
    expect(paperText(document, "en")).toContain("not weighed");
  });

  it("shows the spend by Category against both budgets, and no finer", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { document } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    const text = paperText(document, "bn");
    // The Settlement's own seven words, so the sheet he gets now adds up the way the sheet at the end
    // will. Six bulls at sixty thousand is three lakh sixty.
    expect(text).toContain("পশু কেনা · ৩,৬০,০০০ টাকা");
    expect(text).toContain("খাবার");
    // Four lakh came in for buying. Three lakh sixty went out on the Float and stayed out — six bulls
    // at sixty thousand — and then one of them was sold across to the other Venture for ১,১৪,০০০,
    // which comes back to the cattle side. Four lakh less ২,৪৬,০০০ drawn leaves ১,৫৪,০০০.
    expect(text).toContain("পশু কেনার বাজেট: ৪,০০,০০০ টাকা");
    expect(text).toContain("পশু কেনার বাজেটের বাকি: ১,৫৪,০০০ টাকা");
    // And one lakh set aside for keeping them, of which nothing has gone yet — nobody has fed or
    // dosed these bulls. What the account *holds* against this budget is another figure entirely:
    // a quarter of a lakh of sale money is sitting in it, and printing that as "left" would tell a
    // man there is more of his running budget left than there ever was.
    expect(text).toContain("পরিচালনার বাজেট: ১,০০,০০০ টাকা");
    expect(text).toContain("পরিচালনায় খরচ হয়েছে: ০ টাকা");
    // Never the Farm's buying: no seller, no price a kilo — in either language.
    expect(JSON.stringify(document)).not.toContain(`ব্যাপারী ${suffix}`);
    expect(text).not.toContain("প্রতি কেজি");
    expect(paperText(document, "en")).not.toMatch(/per kg|a kilo/iu);
  });

  it("carries no projection, and never another Investor", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { document } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    const text = paperText(document, "bn");
    // The man holding the other four Units of this very Venture is none of his business, and neither
    // is the one on the second Venture — in neither language.
    const both = JSON.stringify(document);
    expect(both).not.toContain(`বিনিয়োগকারী 1-2 ${suffix}`);
    expect(both).not.toContain(`বিনিয়োগকারী 2-1 ${suffix}`);
    expect(both).not.toContain(`TRF-1-2-${suffix}`);
    expect(text).toContain("কোনো মুনাফার নিশ্চয়তা নেই");
    // Days to the window is a count; nothing says what a bull will weigh or fetch.
    expect(text).toContain("লক্ষ্য সময় বাকি: ৪১ দিন");
  });

  it("sends the photographs beside the sheet rather than inside it", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { document, photos } = await owner.client.investorStatements.progress(
      {
        agreementId: await hisAgreement(),
      }
    );
    // One of the standing bulls has been photographed. The paper itself carries no picture — the
    // face travels with it for whatever draws it.
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      tagNumber: tags[0],
      contentType: "image/jpeg",
    });
    expect(JSON.stringify(document)).not.toContain("aGVsbG8=");
  });

  it("records the Export, and is the Owner's alone", async () => {
    const agreementId = await hisAgreement();
    const owner = await at("2052-02-21T04:00:00.000Z");
    await owner.client.investorStatements.progress({ agreementId });
    const trail = await owner.client.audit.list({
      entity: "investment_agreement",
      entityId: agreementId,
    });
    expect(
      trail.find(
        (event) =>
          event.action === "export" &&
          (event.after as { paper?: string })?.paper === "progress_statement"
      )
    ).toBeDefined();

    const manager = await asManager("2052-02-21T04:00:00.000Z");
    await expect(
      manager.client.investorStatements.progress({ agreementId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a Venture whose Target Window an Amendment moved", () => {
  it("counts the days and grows the herd to the window in force, not the one it opened with", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    // Everybody on the second Venture signs to sell a month later: 1 May rather than 1 April.
    await owner.client.ventures.agreements.amend({
      ventureId: secondVenture,
      investorsPercent: 60,
      targetWindowStart: "2052-05-01",
      targetWindowEnd: "2052-05-10",
      signedOn: "2052-02-19",
      reason: `ঈদ পিছিয়েছে ${suffix}`,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    const theirs = await owner.client.ventures.herd({
      ventureId: secondVenture,
    });
    // 20 February to 1 May: the 41 days to 1 April and 30 more.
    expect(theirs.daysToWindow).toBe(71);
    // The bull taken across grows a kilo a day for those 30 days more: 287 kg becomes 317.
    const { projection } = await owner.client.ventures.projection({
      ventureId: secondVenture,
    });
    expect(projection?.kgAtSale).toBeCloseTo(317, 6);
    // And its plan is fed to the same window: 3 January to 1 May is 119 days, where 1 April was 89.
    const itsPlan = await owner.client.ventures.plan.get({
      ventureId: secondVenture,
    });
    expect(itsPlan.daysOnFeed).toBe(119);
  });
});
