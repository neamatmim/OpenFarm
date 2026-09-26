import { and } from "@OpenFarm/db/operators";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import { sopDefinition } from "@OpenFarm/db/schema/sop";
import type { SopContent } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
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

const at = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

const asManager = (instant: string) =>
  createTestClient(appRouter, { as: "manager", clock: new FakeClock(instant) });

const plan = {
  targetCapitalBdt: 500_000,
  floorBdt: 0,
  decideBy: "2052-01-03",
  targetWindowStart: "2052-04-01",
  targetWindowEnd: "2052-04-10",
  unitPriceBdt: 50_000,
  units: 10,
  cattleBudgetBdt: 400_000,
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
    const agreement = await owner.client.ventures.sign({
      ventureId: venture.id,
      investorId: person.id,
      units,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
      stampValueBdt: 300,
      stampedOn: "2052-01-02",
      stampSerial: `AA ${who} ${suffix}`,
    });
    // oxlint-disable-next-line no-await-in-loop
    await owner.client.ventures.keepAgreementPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    // oxlint-disable-next-line no-await-in-loop
    await owner.client.ventures.takeCapital({
      agreementId: agreement.id,
      amountBdt: units * plan.unitPriceBdt,
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
  await manager.client.instances.ensureDue();
  const today = await manager.client.instances.today({ penId });
  const instance = today.find((one) => one.definitionId === sopId);
  const id = instance?.id ?? "";
  await manager.client.instances.claim({ id });
  for (const [index, kg] of readings) {
    // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as a round is walked
    await manager.client.instances.completeStep({
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
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
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
  const trip = await buying.client.trips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2052-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.client.ventures.drawFloat({
    ventureId: firstVenture,
    buyingTripId: trip.id,
    amountBdt: 400_000,
    movedOn: "2052-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await asManager("2052-01-04T05:00:00.000Z");
  for (let which = 0; which < 6; which += 1) {
    // oxlint-disable-next-line no-await-in-loop -- one beast off the lorry at a time
    const her = await manager.client.intake.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${suffix}` },
      purchasePriceBdt: 60_000,
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
  await buying.client.ventures.reconcileFloat({
    buyingTripId: trip.id,
    // Four lakh out, three lakh sixty spent on six bulls, forty thousand home again.
    cashBackBdt: 40_000,
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

  // The third dies on the 5th of February.
  const losing = await asManager("2052-02-05T05:00:00.000Z");
  await losing.client.animals.recordMortality({
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
    rateBdtPerKg: 500,
    note: `হাটের দর ${suffix}`,
    soldOn: "2052-02-10",
    paymentMethod: "bank",
    reference: `INT-${suffix}`,
    priceBdt: 228 * 500,
  });

  // And the sixth goes to a buyer on the 18th — after the Internal Sale, because the first Sale moves
  // the Venture to Selling and a Venture that is Selling will not trade an animal across.
  const toABuyer = await asManager("2052-02-18T05:00:00.000Z");
  await toABuyer.client.sale.record({
    tagNumber: tags[5] ?? "",
    buyer: { name: `ক্রেতা ${suffix}` },
    priceBdt: 250_000,
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

describe("what a Venture's animals are doing", () => {
  it("counts who stands, who died and who was sold away", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const theirs = await owner.client.ventures.herd({
      ventureId: firstVenture,
    });
    // Six came in. One died, one went to a buyer, and one went across to the other Venture and is no
    // longer on this paper at all, because whose she is, is asked of the day it is printed.
    expect(theirs.standingCount).toBe(3);
    expect(theirs.diedCount).toBe(1);
    expect(theirs.soldCount).toBe(1);
    expect(theirs.animals).toHaveLength(5);
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
    const withMargin = theirs.animals.filter((one) => one.marginBdt !== null);
    expect(withMargin).toHaveLength(1);
    expect(theirs.marginBdt).toBe(withMargin[0]?.marginBdt);

    // Worst first, and the ones with nothing to compare come last rather than reading as the worst.
    expect(theirs.animals.at(0)?.marginBdt).not.toBeNull();
    expect(theirs.animals.at(-1)?.marginBdt).toBeNull();

    // They put weight on here; nobody has fed them on this farm, so there is nothing charged and each
    // kilogram cost nothing. What a Venture's Cost of Gain is made of is proved where there are real
    // costs to make it of — see settlement.test.ts.
    expect(theirs.gainKg).toBeGreaterThan(0);
    expect(theirs.chargedBdt).toBe(0);
    expect(theirs.costOfGainBdt).toBe(0);
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

  it("averages over the animals standing, and works the herd's gain from the whole herd", async () => {
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
    // Forty-nine kilogrammes on over seventy days on feed — 28 kg in 28 days and 21 kg in 42. The
    // herd's own rate, which is 0.7; the mean of the two animals' rates would be 0.75, and this test
    // fails if anybody makes it that.
    expect(theirs.gainKgPerDay).toBe(0.7);
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
      cattleBudgetBdt: expect.any(Number),
      runningBudgetBdt: expect.any(Number),
      spentBdt: expect.any(Number),
      runningBudgetLow: expect.any(Boolean),
      animalsStanding: 3,
    });
    // Asked of the answer itself and not of the screen: a field the client merely does not draw is
    // still a field the client was sent.
    for (const secret of [
      "signedFor",
      "capitalInBdt",
      "paidOutBdt",
      "balanceBdt",
      "unitPriceBdt",
      "units",
      "targetCapitalBdt",
      "floorBdt",
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
    const agreements = await owner.client.ventures.agreements({
      ventureId: firstVenture,
    });
    return agreements[0]?.id ?? "";
  };

  it("says how his animals are doing and where his money has gone", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    expect(text).toContain("অগ্রগতি / Progress statement");
    expect(text).toContain(`বিনিয়োগকারী 1-1 ${suffix}`);
    // Six Units of the ten this Venture has: sixty per cent, and not a word about who holds the four.
    expect(text).toContain("৬ (৬০%)");
    // Three standing, one sold to a buyer, one lost.
    expect(text).toContain("দাঁড়িয়ে আছে / Standing: ৩");
    expect(text).toContain("মারা গেছে / Lost: ১");
    // The bulls it has actually weighed, and what they average.
    expect(text).toContain("ওজন নেওয়া হয়েছে / Weighed: ২");
    expect(text).toContain("২২৪.৫");
  });

  it("says in words that a Venture has bought nothing yet", async () => {
    // A third Venture, signed and paid into and buying, with not one animal on it — which is every
    // Venture for the first days of its run, and which the Owner can ask a sheet of, because the
    // joining letter is wanted at exactly that moment and sits beside this button.
    const owner = await at("2052-02-20T04:00:00.000Z");
    const empty = await aVenture(owner, 3, [10]);
    const agreements = await owner.client.ventures.agreements({
      ventureId: empty,
    });
    const { text } = await owner.client.investorStatements.progress({
      agreementId: agreements[0]?.id ?? "",
    });
    expect(text).toContain("এখনো কোনো পশু নেই / none yet");
    // And no column header standing over nothing, which is what she was shown before.
    expect(text).not.toContain("ট্যাগ · শুরুর ওজন");
  });

  it("names a beast nobody has weighed rather than showing her as flat", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    expect(text).toContain("ওজন নেওয়া হয়নি / not weighed");
  });

  it("shows the spend by Category against both budgets, and no finer", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    // The Settlement's own seven words, so the sheet he gets now adds up the way the sheet at the end
    // will. Six bulls at sixty thousand is three lakh sixty.
    expect(text).toContain("পশু কেনা / Cattle bought: ৩,৬০,০০০");
    expect(text).toContain("খাবার / Feed");
    // Four lakh came in for buying. Three lakh sixty went out on the Float and stayed out — six bulls
    // at sixty thousand — and then one of them was sold across to the other Venture for ১,১৪,০০০,
    // which comes back to the cattle side. Four lakh less ২,৪৬,০০০ drawn leaves ১,৫৪,০০০.
    expect(text).toContain(
      "পশু কেনার বাজেট / Cattle budget: ৪,০০,০০০ টাকা · বাকি ১,৫৪,০০০ টাকা"
    );
    // And one lakh set aside for keeping them, of which nothing has gone yet — nobody has fed or
    // dosed these bulls. What the account *holds* against this budget is another figure entirely:
    // a quarter of a lakh of sale money is sitting in it, and printing that as "left" would tell a
    // man there is more of his running budget left than there ever was.
    expect(text).toContain(
      "পরিচালনার বাজেট / Running budget: ১,০০,০০০ টাকা · খরচ হয়েছে ০ টাকা"
    );
    // Never the Farm's buying: no seller, no price a kilo.
    expect(text).not.toContain(`ব্যাপারী ${suffix}`);
    expect(text).not.toContain("প্রতি কেজি");
  });

  it("carries no projection, and never another Investor", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    // The man holding the other four Units of this very Venture is none of his business, and neither
    // is the one on the second Venture.
    expect(text).not.toContain(`বিনিয়োগকারী 1-2 ${suffix}`);
    expect(text).not.toContain(`বিনিয়োগকারী 2-1 ${suffix}`);
    expect(text).not.toContain(`TRF-1-2-${suffix}`);
    expect(text).toContain("কোনো মুনাফার নিশ্চয়তা নেই");
    // Days to the window is a count; nothing says what a bull will weigh or fetch.
    expect(text).toContain("লক্ষ্য সময় বাকি / Days to the window: ৪১ দিন");
  });

  it("sends the photographs beside the sheet rather than inside it", async () => {
    const owner = await at("2052-02-20T04:00:00.000Z");
    const { text, photos } = await owner.client.investorStatements.progress({
      agreementId: await hisAgreement(),
    });
    // One of the standing bulls has been photographed. The sheet itself stays a plain string — the
    // face travels with it for whatever draws it.
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      tagNumber: tags[0],
      contentType: "image/jpeg",
    });
    expect(text).not.toContain("aGVsbG8=");
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
