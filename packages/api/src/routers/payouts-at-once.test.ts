import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Every Investor's payout sent on one day from one sheet. Worked as the Adjustment's test is: ten Units at ৳50,000, five
// each to two Investors on a 60% split, one bull bought at ৳80,000 and sold for ৳1,00,000 — so each is owed ৳2,56,000.

const suffix = `${Date.now()}`.slice(-6);

const at = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

/** A Venture of two Investors, its one bull sold and its Settlement approved: nothing paid out yet. */
const anApprovedRun = async (mark: string, approve = true) => {
  const { client: owner } = await at("2098-01-02T04:00:00.000Z");
  const venture = await owner.ventures.open({
    name: `একসাথে পাঠানো ${mark} ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2098-01-02",
    targetWindowStart: "2098-06-01",
    targetWindowEnd: "2098-06-05",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  const papers: string[] = [];
  for (const [name, digit] of [
    ["করিম", "1"],
    ["রহিম", "2"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor signed at a time
    const person = await owner.investors.record({
      name: `${name} ${mark} ${suffix}`,
      phone: `0172${suffix}${mark}${digit}`,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    const agreement = await owner.ventures.agreements.sign({
      ventureId: venture.id,
      investorId: person.id,
      units: 5,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2098-01-02",
      stampSerial: `P-${mark}-${name}-${suffix}`,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    await owner.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    await owner.ventures.takeCapital({
      agreementId: agreement.id,
      amountMoney: 250_000,
      movedOn: "2098-01-02",
      paymentMethod: "bank",
      reference: `IN-${mark}-${name}-${suffix}`,
    });
    papers.push(agreement.id);
  }
  await owner.ventures.startBuying({ id: venture.id });
  const shed = await owner.sheds.create({ name: `পাঠানো ${mark} ${suffix}` });
  const pen = await owner.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${mark} ${suffix}`,
  });
  const { client: buying } = await at("2098-01-05T06:00:00.000Z");
  const bull = await buying.intakes.record({
    penId: pen.id,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2098-01-05T05:00:00.000Z"),
    ventureId: venture.id,
    targetWindowStart: "2098-06-01",
    targetWindowEnd: "2098-06-05",
    ...PAID_FROM_THE_ACCOUNT,
  });
  const { client: selling } = await at("2098-01-10T06:00:00.000Z");
  await selling.sales.record({
    tagNumber: bull.tagNumber,
    buyer: { name: `কসাই ${suffix}` },
    destination: "গাবতলী",
    vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
    driver: "সোহেল",
    priceMoney: 100_000,
    weightKg: 300,
    paymentMethod: "bank",
    reference: `SALE-${mark}-${suffix}`,
  });
  if (approve) {
    const { client: settling } = await at("2098-01-15T06:00:00.000Z");
    await settling.ventures.settlement.approve({ ventureId: venture.id });
  }
  return { ventureId: venture.id, papers };
};

/** Which shares have gone out, in the Settlement's order. */
const paidOut = async (ventureId: string) => {
  const { client: owner } = await at("2098-01-16T04:00:00.000Z");
  const approved = await owner.ventures.settlement.approved({ ventureId });
  return approved?.shares.map((one) => one.paid) ?? [];
};

/** How many of a Settlement snapshot's shares have gone out. */
const paidIn = (snapshot: unknown) =>
  (
    (snapshot as { shares?: { paidMovementId: string | null }[] } | null)
      ?.shares ?? []
  ).filter((one) => one.paidMovementId !== null).length;

beforeAll(async () => {
  const { client: owner } = await at("2098-01-02T04:00:00.000Z");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2098/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2099-03-31",
  });
});

describe("sending every payout at once", () => {
  it("pays each Investor his share on the day, a transfer each, as Send it would", async () => {
    const { ventureId, papers } = await anApprovedRun("1");
    const [a = "", b = ""] = papers;
    const { client: owner } = await at("2098-01-16T04:00:00.000Z");

    const sent = await owner.ventures.settlement.payMany({
      ventureId,
      movedOn: "2098-01-16",
      payouts: [
        { agreementId: a, amountMoney: 256_000, reference: `OUT-A-${suffix}` },
        { agreementId: b, amountMoney: 256_000, reference: `OUT-B-${suffix}` },
      ],
    });

    expect(sent).toEqual({ paid: 2, paidMoney: 512_000 });
    expect(await paidOut(ventureId)).toEqual([true, true]);
  });

  it("refuses the same transfer on two lines, naming the second, and sends nothing", async () => {
    const { ventureId, papers } = await anApprovedRun("2");
    const [a = "", b = ""] = papers;
    const { client: owner } = await at("2098-01-16T04:00:00.000Z");

    await expect(
      owner.ventures.settlement.payMany({
        ventureId,
        movedOn: "2098-01-16",
        payouts: [
          { agreementId: a, amountMoney: 256_000, reference: `SAME-${suffix}` },
          {
            agreementId: b,
            amountMoney: 256_000,
            reference: ` same-${suffix}`,
          },
        ],
      })
    ).rejects.toMatchObject({
      data: { refusal: "payout_reference_twice", row: 2 },
    });
    expect(await paidOut(ventureId)).toEqual([false, false]);
  });

  it("refuses a line that is not what its Investor is owed, naming it, and sends the line above it neither", async () => {
    const { ventureId, papers } = await anApprovedRun("3");
    const [a = "", b = ""] = papers;
    const { client: owner } = await at("2098-01-16T04:00:00.000Z");

    await expect(
      owner.ventures.settlement.payMany({
        ventureId,
        movedOn: "2098-01-16",
        payouts: [
          { agreementId: a, amountMoney: 256_000, reference: `OK-${suffix}` },
          {
            agreementId: b,
            amountMoney: 250_000,
            reference: `WRONG-${suffix}`,
          },
        ],
      })
    ).rejects.toMatchObject({
      data: { refusal: "not_what_he_is_owed", row: 2 },
    });
    expect(await paidOut(ventureId)).toEqual([false, false]);
  });

  it("says a refusal of the whole sheet without naming a line of it", async () => {
    const { ventureId, papers } = await anApprovedRun("4", false);
    const [a = "", b = ""] = papers;
    const { client: owner } = await at("2098-01-16T04:00:00.000Z");

    const refused = await owner.ventures.settlement
      .payMany({
        ventureId,
        movedOn: "2098-01-16",
        payouts: [
          { agreementId: a, amountMoney: 256_000, reference: `NA-A-${suffix}` },
          { agreementId: b, amountMoney: 256_000, reference: `NA-B-${suffix}` },
        ],
      })
      .catch((error: unknown) => error);

    expect(refused).toMatchObject({ data: { refusal: "not_yet_approved" } });
    expect((refused as { data: object }).data).not.toHaveProperty("row");
  });

  it("keeps the trail's before and after true when one payout goes from its row while the sheet sends the other", async () => {
    const { ventureId, papers } = await anApprovedRun("5");
    const [a = "", b = ""] = papers;
    const { client: owner } = await at("2098-01-16T04:00:00.000Z");

    await Promise.all([
      owner.ventures.settlement.payMany({
        ventureId,
        movedOn: "2098-01-16",
        payouts: [
          {
            agreementId: a,
            amountMoney: 256_000,
            reference: `RACE-A-${suffix}`,
          },
        ],
      }),
      owner.ventures.settlement.pay({
        ventureId,
        agreementId: b,
        amountMoney: 256_000,
        movedOn: "2098-01-16",
        paymentMethod: "bank",
        reference: `RACE-B-${suffix}`,
      }),
    ]);

    const trail = await owner.audit.list({
      entity: "venture_settlement",
      entityId: ventureId,
    });
    // Whichever went second read the first one's payout in its before: two payouts, one already out.
    const counts = trail
      .filter((one) => one.action === "update")
      .map((one) => [paidIn(one.before), paidIn(one.after)])
      .toSorted();
    expect(counts).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });
});
