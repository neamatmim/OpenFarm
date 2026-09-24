import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * হিসাব নিকাশ — the sheet an Investor checks the whole run against.
 *
 * Two runs are settled here. One made money and did not divide evenly: sixty per cent of its profit
 * leaves three taka over, which is the Farm's, and the sheet has to show that rather than let a man
 * multiply his Units by the per-Unit figure and find himself short. The other lost money, and a loss has
 * to read as a loss — the label, the unsigned figure, and a share that comes off capital rather than
 * being added to it.
 *
 * Two Investors signed the first, so the one thing this sheet must never do — carry one man's money to
 * another — has something to fail at.
 *
 * Every expected figure is worked by hand. A test that re-derives the answer the way the code does can
 * never disagree with it.
 */
const suffix = `closing-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

type Client = Awaited<ReturnType<typeof as>>;

/** The run that made money: twenty Units, two men, two bulls. */
const WON = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2053-01-20",
  targetWindowStart: "2053-02-17",
  targetWindowEnd: "2053-02-19",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

/** The run that lost: ten Units, one man, one bull sold for half what he cost. */
const LOST = {
  targetCapitalBdt: 500_000,
  floorBdt: 0,
  decideBy: "2053-01-20",
  targetWindowStart: "2053-02-17",
  targetWindowEnd: "2053-02-19",
  unitPriceBdt: 50_000,
  units: 10,
  cattleBudgetBdt: 400_000,
};

let wonId = "";
let lostId = "";
/** His Agreement on the winning run, the other man's on it, and the one on the losing run. */
let hisWon = "";
let theOtherMansWon = "";
let hisLost = "";
const HIM = `রফিক ${suffix}`;
const THE_OTHER_MAN = `জসিম ${suffix}`;
const LOSER = `কামাল ${suffix}`;

const signOn = async (
  owner: Client,
  ventureId: string,
  name: string,
  phone: string,
  units: number,
  which: string
) => {
  const person = await owner.client.investors.record({ name, phone });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2053-01-02",
    stampSerial: `AA ${which} ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: units * 50_000,
    movedOn: "2053-01-03",
    paymentMethod: "bank",
    reference: `TRF-${which}-${suffix}`,
  });
  return agreement.id;
};

/** A bull off the lorry on the Venture's own Float. */
const aBull = async (ventureId: string, penId: string, which: string) => {
  const buying = await as("owner", "2053-01-04T04:00:00.000Z");
  const trip = await buying.client.trips.record({
    wentTo: `হাট ${which} ${suffix}`,
    wentOn: "2053-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.client.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: 100_000,
    movedOn: "2053-01-04",
    paymentMethod: "bank",
    reference: `FLT-${which}-${suffix}`,
  });
  const manager = await as("manager", "2053-01-04T05:00:00.000Z");
  const her = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    buyingTripId: trip.id,
    ventureId,
    arrivedAt: new Date("2053-01-04T05:00:00.000Z"),
    targetWindowStart: WON.targetWindowStart,
    targetWindowEnd: WON.targetWindowEnd,
  });
  await buying.client.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackBdt: 0,
    movedOn: "2053-01-04",
    reference: `DEP-${which}-${suffix}`,
  });
  return her.tagNumber;
};

const sell = async (tagNumber: string, priceBdt: number, which: string) => {
  const selling = await as("manager", "2053-02-18T05:00:00.000Z");
  await selling.client.sale.record({
    tagNumber,
    buyer: { name: `ক্রেতা ${which} ${suffix}` },
    priceBdt,
    weightKg: 320,
    destination: `ঢাকা ${suffix}`,
    vehicle: `ঢাকা মেট্রো ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod: "bank",
  });
};

/** Everything cleared, approved, and every taka out. */
const closeUp = async (ventureId: string, which: string) => {
  // The Owner's own money in, which comes back at cost before any capital does.
  const lending = await as("owner", "2053-02-20T04:00:00.000Z");
  await lending.client.ventures.advance({
    ventureId,
    amountBdt: 50_000,
    movedOn: "2053-02-20",
    paymentMethod: "bank",
    reference: `ADV-${which}-${suffix}`,
  });
  // Each month read against what the farm believes that month ended on — not against today's balance,
  // which by now carries February's movements as well.
  const reading = await as("owner", "2053-03-01T04:00:00.000Z");
  for (const month of ["2053-01", "2053-02"]) {
    // oxlint-disable-next-line no-await-in-loop -- one month at a time
    const believed = await reading.client.ventures.expectedAtMonthEnd({
      ventureId,
      month,
    });
    // oxlint-disable-next-line no-await-in-loop -- one month at a time
    await reading.client.ventures.checkTheBank({
      ventureId,
      month,
      readBdt: believed.expectedBdt,
    });
  }
  const settling = await as("owner", "2053-03-02T04:00:00.000Z");
  await settling.client.ventures.approveSettlement({ ventureId });
  const approved = await settling.client.ventures.approvedSettlement({
    ventureId,
  });
  await settling.client.ventures.repayAdvance({
    ventureId,
    movedOn: "2053-03-02",
    paymentMethod: "bank",
    reference: `ADVBACK-${which}-${suffix}`,
  });
  for (const his of approved?.shares ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor at a time
    await settling.client.ventures.paySettlement({
      ventureId,
      agreementId: his.agreementId,
      amountBdt: his.payoutBdt,
      movedOn: "2053-03-02",
      paymentMethod: "bank",
      reference: `PAY-${his.agreementId.slice(-6)}-${suffix}`,
    });
  }
  if ((approved?.farmBdt ?? 0) > 0) {
    await settling.client.ventures.takeTheFarmsShare({
      ventureId,
      movedOn: "2053-03-02",
      paymentMethod: "bank",
      reference: `FARM-${which}-${suffix}`,
    });
  }
};

beforeAll(async () => {
  const owner = await as("owner", "2053-01-01T04:00:00.000Z");
  await owner.client.farm.setIdentity({
    address: `গ্রাম: শিমুলিয়া, সাভার ${suffix}`,
    phone: "+8801711000099",
    registrationNumber: `DLS/SAV/2053/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2055-03-31",
  });
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });

  const won = await owner.client.ventures.open({
    name: `জেতা ভেঞ্চার ${suffix}`,
    ...WON,
  });
  wonId = won.id;
  hisWon = await signOn(owner, wonId, HIM, "01999000011", 13, "1");
  theOtherMansWon = await signOn(
    owner,
    wonId,
    THE_OTHER_MAN,
    "01999000021",
    7,
    "2"
  );
  await owner.client.ventures.startBuying({ id: wonId });

  const lost = await owner.client.ventures.open({
    name: `হারা ভেঞ্চার ${suffix}`,
    ...LOST,
  });
  lostId = lost.id;
  hisLost = await signOn(owner, lostId, LOSER, "01999000031", 10, "3");
  await owner.client.ventures.startBuying({ id: lostId });

  // Two bulls on the winning run at a lakh each, sold for four lakh five thousand and five between
  // them: two lakh five thousand and five of profit.
  const first = await aBull(wonId, pen.id, "a");
  const second = await aBull(wonId, pen.id, "b");
  // And one on the losing run, sold for half what he cost.
  const third = await aBull(lostId, pen.id, "c");

  await sell(first, 202_505, "a");
  await sell(second, 202_500, "b");
  await sell(third, 50_000, "c");

  await closeUp(wonId, "won");
  await closeUp(lostId, "lost");
});

describe("the sheet an Investor checks the whole run against", () => {
  it("shows the run's figures and how they divide", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.settlement({
      agreementId: hisWon,
    });
    // Four lakh five thousand and five in, two lakh out on the bulls.
    expect(text).toContain("মোট বিক্রি / Proceeds: ৪,০৫,০০৫ টাকা");
    expect(text).toContain("পশু কেনা / Cattle bought: ২,০০,০০০ টাকা");
    expect(text).toContain("লাভ / Profit: ২,০৫,০০৫ টাকা");
    // Sixty per cent of that is ১,২৩,০০৩, which will not divide twenty ways in whole taka: ৬,১৫০ a
    // Unit and three taka left over, and the three are the Farm's.
    expect(text).toContain("প্রতি ইউনিট মুনাফা / Profit per Unit: ৬,১৫০ টাকা");
    // The line he reads first: fifty thousand a Unit in, fifty-six thousand one hundred and fifty back.
    expect(text).toContain("প্রতি ইউনিট / Per Unit: ৫০,০০০ টাকা দিয়ে ৫৬,১৫০ টাকা");
    expect(text).toContain("ভগ্নাংশ খামারে / Rounding to the Farm: ৩ টাকা");
    expect(text).toContain("খামারের অংশ / The Farm's share: ৮২,০০৫ টাকা");
  });

  it("follows the figures to his own payout, with the reference it went on", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.settlement({
      agreementId: hisWon,
    });
    // Thirteen Units of the twenty: ৬,৫০,০০০ in, ৭৯,৯৫০ of profit, ৭,২৯,৯৫০ back.
    expect(text).toContain("ইউনিট / Units held: ১৩");
    expect(text).toContain("মূলধন ফেরত / Capital returned: ৬,৫০,০০০ টাকা");
    expect(text).toContain("মুনাফার অংশ / Your share of the profit: ৭৯,৯৫০ টাকা");
    expect(text).toContain("মোট প্রাপ্য / Your payout: ৭,২৯,৯৫০ টাকা");
    expect(text).toContain(`PAY-${hisWon.slice(-6)}-${suffix}`);
  });

  it("says the Owner's Advance came back, and never as a charge", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.settlement({
      agreementId: hisWon,
    });
    expect(text).toContain(
      "মালিকের অগ্রিম ফেরত / Owner's Advance repaid: ৫০,০০০ টাকা"
    );
    // The charges are the seven the Settlement froze, and an Advance is not one of them — the costs it
    // paid for are already in the list.
    const charged = text.slice(
      text.indexOf("যা খরচ হলো"),
      text.indexOf("লাভ / Profit")
    );
    expect(charged).not.toContain("অগ্রিম");
  });

  it("tells the herd's story, so the result has a reason", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.settlement({
      agreementId: hisWon,
    });
    // Headed as the records rather than as frozen, because a Sale put right after settlement would
    // move this average and not a taka of the account above it.
    expect(text).toContain("পালের হিসাব (নথি অনুযায়ী)");
    expect(text).toContain("কেনা হয়েছে / Bought: ২ · গড়ে ১,০০,০০০ টাকা");
    // Four lakh five thousand and five between two of them averages ২,০২,৫০২.৫, and the half-taka
    // stays: it is an average, and rounding it would make the two prices above it not add up.
    expect(text).toContain("বিক্রি হয়েছে / Sold: ২ · গড়ে ২,০২,৫০২.৫ টাকা");
    expect(text).toContain("মারা গেছে / Lost: ০");
  });

  it("reads a loss as a loss, off capital rather than onto it", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.settlement({
      agreementId: hisLost,
    });
    // A lakh spent, fifty thousand back: fifty thousand lost, and the word says so with no sign on
    // the figure.
    expect(text).toContain("ক্ষতি / Loss: ৫০,০০০ টাকা");
    expect(text).not.toContain("-৫০,০০০");
    expect(text).not.toContain("লাভ / Profit");
    // His ten Units take sixty per cent of it — ৩০,০০০ — and it comes off his five lakh.
    expect(text).toContain(
      "ক্ষতির অংশ (মূলধন থেকে) / Your share of the loss, off capital: ৩০,০০০ টাকা"
    );
    expect(text).toContain("মোট প্রাপ্য / Your payout: ৪,৭০,০০০ টাকা");
    // The Farm bears its forty per cent too — ২০,০০০ — and the line says so rather than reading as
    // the Farm taking money out of a run that lost it.
    expect(text).toContain(
      "খামারের ভাগের ক্ষতি / The Farm's share of the loss: ২০,০০০ টাকা"
    );
    expect(text).not.toContain("খামারের অংশ");
    // And a Unit lost three thousand of the fifty thousand it put in, said as a loss rather than as a
    // gain of three thousand.
    expect(text).toContain("প্রতি ইউনিট ক্ষতি / Loss per Unit: ৩,০০০ টাকা");
    expect(text).not.toContain("মুনাফা / Profit per Unit");
    expect(text).toContain("প্রতি ইউনিট / Per Unit: ৫০,০০০ টাকা দিয়ে ৪৭,০০০ টাকা");
  });

  it("carries nothing of the other man who signed the same run", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.settlement({
      agreementId: hisWon,
    });
    expect(text).toContain(HIM);
    expect(text).not.toContain(THE_OTHER_MAN);
    // Seven Units and ৩,৫০,০০০ are his neighbour's business.
    expect(text).not.toContain("৩,৯৩,০৫০");
    expect(text).not.toContain(`PAY-${theOtherMansWon.slice(-6)}-${suffix}`);
  });

  it("says the figures were frozen, and that later news comes as an Adjustment", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const { text } = await owner.client.investorStatements.settlement({
      agreementId: hisWon,
    });
    expect(text).toContain("বণ্টন সমন্বয় হিসেবে আসবে");
    expect(text).toContain(
      "Anything arriving later comes as a Settlement Adjustment, not by this sheet being rewritten."
    );
    // And the footer every statement carries.
    expect(text).toContain(
      "No return is guaranteed. A loss comes off capital."
    );
  });

  it("is refused for a Venture whose Settlement is not approved", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const open = await owner.client.ventures.open({
      name: `চলমান ${suffix}`,
      ...LOST,
    });
    const agreementId = await signOn(
      owner,
      open.id,
      `নতুন ${suffix}`,
      "01999000041",
      10,
      "4"
    );
    await expect(
      owner.client.investorStatements.settlement({ agreementId })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "not_settled_yet" },
    });
  });

  it("records the Export, and is the Owner's alone", async () => {
    const owner = await as("owner", "2053-03-04T04:00:00.000Z");
    await owner.client.investorStatements.settlement({ agreementId: hisWon });
    const trail = await owner.client.audit.list({
      entity: "investment_agreement",
      entityId: hisWon,
    });
    expect(
      trail.find(
        (event) =>
          event.action === "export" &&
          (event.after as { paper?: string })?.paper === "settlement_statement"
      )
    ).toMatchObject({ after: { payoutBdt: 729_950 } });

    const manager = await as("manager", "2053-03-04T04:00:00.000Z");
    await expect(
      manager.client.investorStatements.settlement({ agreementId: hisWon })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("shows an Adjustment beside the frozen figures, never instead of them", async () => {
    // A Herd Cost the Farm entered late, charged to the animals for a month these bulls stood. The
    // costing moves; the Settlement does not.
    const owner = await as("owner", "2053-03-05T04:00:00.000Z");
    const category = await owner.client.money.addCategory({
      nameBn: `দেরিতে আসা খরচ ${suffix}`,
      direction: "out",
    });
    await owner.client.money.setChargedToAnimals({
      categoryId: category.id,
      chargedToAnimals: true,
    });
    const spending = await as("manager", "2053-03-05T05:00:00.000Z");
    await spending.client.money.enter({
      categoryId: category.id,
      amountBdt: 20_000,
      occurredOn: "2053-01-20",
      counterparty: { name: `দোকান ${suffix}` },
      paymentMethod: "cash",
      side: "fattening",
      note: `দেরিতে ${suffix}`,
    });
    const raising = await as("owner", "2053-03-06T04:00:00.000Z");
    await raising.client.ventures.raiseAdjustment({
      ventureId: wonId,
      reason: `জানুয়ারির ওষুধের বিল দেরিতে এসেছে ${suffix}`,
    });

    const { text } = await raising.client.investorStatements.settlement({
      agreementId: hisWon,
    });
    // The frozen figures stand exactly as they were — the sheet is reissued, not restated.
    expect(text).toContain("লাভ / Profit: ২,০৫,০০৫ টাকা");
    expect(text).toContain("মোট প্রাপ্য / Your payout: ৭,২৯,৯৫০ টাকা");
    // And the late news is at the foot of it, in his own money, marked as a fall. A share that fell is
    // never collected back, so nothing is owed either way.
    expect(text).toContain("বণ্টন সমন্বয় / Settlement Adjustments");
    expect(text).toContain(`জানুয়ারির ওষুধের বিল দেরিতে এসেছে ${suffix}`);
    expect(text).toContain("কমেছে / down");
    // And what became of it, in words rather than as the word the database keeps.
    expect(text).toContain("লেখা আছে / noted");
  });
});

describe("an Investor's own page", () => {
  it("reads his Agreements and every taka of his, paid out included, and none of the other man's", async () => {
    const owner = await as("owner", "2053-03-03T04:00:00.000Z");
    const listed = await owner.client.investors.list();
    const him = listed.people.find((one) => one.name === HIM);
    if (!him) {
      throw new Error("expected him on the list");
    }

    const his = await owner.client.investors.agreements({ id: him.id });

    expect(his.agreements).toEqual([
      expect.objectContaining({
        id: hisWon,
        units: 13,
        promisedBdt: 650_000,
        capitalHeldBdt: 650_000,
        hasPaper: true,
        investorsPercent: 60,
        farmPercent: 40,
        // Thirteen Units of the twenty: ৬,৫০,০০০ back and ৭৯,৯৫০ of profit, paid on the day it was.
        settlement: expect.objectContaining({
          capitalBdt: 650_000,
          shareBdt: 79_950,
          payoutBdt: 729_950,
          paidOn: "2053-03-02",
        }),
      }),
    ]);
    expect(
      his.movements.map((one) => [one.kind, one.amountBdt, one.movedOn])
    ).toEqual([
      ["payout", 729_950, "2053-03-02"],
      ["capital_in", 650_000, "2053-01-03"],
    ]);
    expect(JSON.stringify(his)).not.toContain(theOtherMansWon);
    expect(JSON.stringify(his)).not.toContain(hisLost);
  });
});
