import {
  STANDARD_AGREEMENT_PAID_BY_THE_MONTH,
  STANDARD_TEMPLATES,
} from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Farm's own capital in a Venture (built 2026-10-05 on Claude's recommendation, at the Owner's word): the Farm takes
// Units with its own money, at the same price and on the same terms as any Investor — at most half of them, while the
// Venture is open and before any Investor has signed, so every Investor signs knowing. It is a partner for that money:
// its Units share profit and loss as anyone's, beside its mudarib share. Its capital leaves the Farm's own books and
// comes back to them.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2095-01-01T04:00:00.000Z";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    const said = error as { code?: string; data?: { refusal?: string } };
    return said.data?.refusal ?? said.code;
  }
  return "not refused";
};

/** A Venture of ten Units at fifty thousand each, still open. */
const aVenture = async (name: string) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2095-01-25",
    targetWindowStart: "2095-06-01",
    targetWindowEnd: "2095-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  return venture.id;
};

/** An Investor signed for Units of a Venture, the stamped paper on file. */
const signedUp = async (name: string, ventureId: string, units: number) => {
  const owner = await as("owner");
  const person = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone: `0171${suffix}${units}`,
  });
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: person.id,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2095-01-02",
    stampSerial: `S-${name}-${suffix}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return agreement.id;
};

beforeAll(async () => {
  // The Manager is on the farm, or "the Manager is refused" would only mean there was none.
  await as("manager");
  // What every Investment Agreement is written with: the farm as the law knows it.
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000098",
    registrationNumber: `DLS/SAV/2095/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2097-03-31",
  });
});

describe("the Farm's own Units on a Venture", () => {
  it("are taken by the Owner while it is open and nobody has signed, and listed as the Farm's", async () => {
    const ventureId = await aVenture("খামারের");
    const owner = await as("owner");
    const taken = await owner.ventures.agreements.farmTakes({
      ventureId,
      units: 4,
    });
    const listed = await owner.ventures.agreements.list({ ventureId });
    expect(listed).toEqual([
      expect.objectContaining({
        id: taken.id,
        units: 4,
        investorsPercent: 60,
        stamp: expect.objectContaining({ kind: "farm_own" }),
        isFarm: true,
      }),
    ]);
    // Not a person: not on the Investors page, and adds nobody to the Investor Cap.
    const people = await owner.investors.list();
    expect(people.people.some((one) => one.id === listed[0]?.investorId)).toBe(
      false
    );
  });

  it("are at most half the Units, once, and never after an Investor has signed", async () => {
    const owner = await as("owner");
    const half = await aVenture("অর্ধেক");
    expect(
      await refusalOf(
        owner.ventures.agreements.farmTakes({
          ventureId: half,
          units: 6,
        })
      )
    ).toBe("farm_units_over_half");
    await owner.ventures.agreements.farmTakes({
      ventureId: half,
      units: 5,
    });
    expect(
      await refusalOf(
        owner.ventures.agreements.farmTakes({
          ventureId: half,
          units: 1,
        })
      )
    ).toBe("farm_has_units_already");

    const signed = await aVenture("সই হওয়া");
    await signedUp("আগে সই", signed, 2);
    expect(
      await refusalOf(
        owner.ventures.agreements.farmTakes({
          ventureId: signed,
          units: 2,
        })
      )
    ).toBe("investors_signed_already");
  });

  it("are the Owner's alone", async () => {
    const ventureId = await aVenture("ম্যানেজার");
    const manager = await as("manager");
    await expect(
      manager.ventures.agreements.farmTakes({
        ventureId,
        units: 2,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("are paid for from the Farm's own books, by bank, with no stamped paper to keep", async () => {
    const ventureId = await aVenture("টাকা");
    const owner = await as("owner");
    const taken = await owner.ventures.agreements.farmTakes({
      ventureId,
      units: 2,
    });
    const paid = await owner.ventures.takeCapital({
      agreementId: taken.id,
      amountMoney: 100_000,
      movedOn: "2095-01-01",
      paymentMethod: "bank",
      reference: `FARM-${suffix}`,
    });
    const money = await scratchDb().query.moneyEvent.findMany({
      where: {
        farmId: theFarm().id,
        source: "venture_capital_out",
        sourceId: paid.id,
      },
    });
    expect(money).toEqual([
      expect.objectContaining({ amountMoney: 100_000, direction: "out" }),
    ]);
    // Its Money Event stands on the Farm's books beside it: put right together, the two still say one transfer.
    const listed = await owner.ventures.movements.list({ ventureId });
    expect(listed.find((one) => one.id === paid.id)?.whyItStands).toBeNull();
    await owner.ventures.movements.correct({
      id: paid.id,
      reason: `ভুল অঙ্ক ${suffix}`,
      changes: {
        amountMoney: { from: 100_000, to: 90_000 },
        reference: { from: `FARM-${suffix}`, to: `FARM-2-${suffix}` },
      },
    });
    const followed = await scratchDb().query.moneyEvent.findMany({
      where: {
        farmId: theFarm().id,
        source: "venture_capital_out",
        sourceId: paid.id,
      },
      columns: { amountMoney: true, reference: true },
    });
    expect(followed).toEqual([
      { amountMoney: 90_000, reference: `FARM-2-${suffix}` },
    ]);
    // Put back as it was, for what the tests after this one read.
    await owner.ventures.movements.correct({
      id: paid.id,
      reason: `আগের অঙ্কে ফেরত ${suffix}`,
      changes: {
        amountMoney: { from: 90_000, to: 100_000 },
        reference: { from: `FARM-2-${suffix}`, to: `FARM-${suffix}` },
      },
    });
  });
});

describe("the Farm's own capital coming back", () => {
  it("comes back to the Farm's own books when the Venture is called off", async () => {
    const ventureId = await aVenture("ফেরত");
    const owner = await as("owner");
    const taken = await owner.ventures.agreements.farmTakes({
      ventureId,
      units: 2,
    });
    const paid = await owner.ventures.takeCapital({
      agreementId: taken.id,
      amountMoney: 100_000,
      movedOn: "2095-01-01",
      paymentMethod: "bank",
      reference: `FARM-IN-${suffix}`,
    });
    await owner.ventures.cancel({
      id: ventureId,
      reason: "টাকা ওঠেনি",
      refunds: [
        {
          movementId: paid.id,
          movedOn: "2095-01-05",
          reference: `FARM-BACK-${suffix}`,
        },
      ],
    });
    const refunds = await scratchDb().query.ventureMovement.findMany({
      where: { farmId: theFarm().id, ventureId, kind: "refund" },
      columns: { id: true },
    });
    const back = await scratchDb().query.moneyEvent.findMany({
      where: {
        farmId: theFarm().id,
        source: "venture_capital_back",
        sourceId: { in: refunds.map((one) => one.id) },
      },
    });
    expect(back).toEqual([
      expect.objectContaining({ amountMoney: 100_000, direction: "in" }),
    ]);
  });
});

/** The Owner on a day of their choosing. */
const at = (instant: string) =>
  createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(instant),
  });

describe("the Farm's own Units at Settlement", () => {
  it("share the run's profit as an Investor's do, and come home to the Farm's books as capital and return apart", async () => {
    // Twenty Units at ৳50,000: the Farm takes ten, an Investor the other ten, both on a 60% split. One bull bought at
    // ৳80,000 by bank and sold for ৳1,00,000: ৳20,000 profit, 60% to the Units — ৳12,000, ৳600 a Unit — and 40%, ৳8,000,
    // to the Farm as mudarib. The Farm's ten Units: ৳5,00,000 back and ৳6,000 on top.
    const { client: owner } = await at("2096-01-02T04:00:00.000Z");
    const venture = await owner.ventures.open({
      name: `হিসাব নিকাশ ${suffix}`,
      targetCapitalMoney: 1_000_000,
      floorMoney: 0,
      decideBy: "2096-01-02",
      targetWindowStart: "2096-06-01",
      targetWindowEnd: "2096-06-05",
      unitPriceMoney: 50_000,
      units: 20,
      cattleBudgetMoney: 800_000,
    });
    const farms = await owner.ventures.agreements.farmTakes({
      ventureId: venture.id,
      units: 10,
    });
    const theirs = await signedUp("হিসাবের জন", venture.id, 10);
    for (const [agreementId, reference] of [
      [farms.id, `FARM-${suffix}`],
      [theirs, `INV-${suffix}`],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one payment at a time
      await owner.ventures.takeCapital({
        agreementId,
        amountMoney: 500_000,
        movedOn: "2096-01-02",
        paymentMethod: "bank",
        reference,
      });
    }
    await owner.ventures.startBuying({ id: venture.id });
    const shed = await owner.sheds.create({ name: `হিসাব ${suffix}` });
    const pen = await owner.sheds.pens.create({
      quarantine: true,
      shedId: shed.id,
      name: `ফ্যাটেনিং ${suffix}`,
    });
    const { client: buying } = await at("2096-01-05T06:00:00.000Z");
    const bull = await buying.intakes.record({
      penId: pen.id,
      sex: "male",
      seller: { name: `প্রতিবেশী ${suffix}` },
      purchasePriceMoney: 80_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date("2096-01-05T05:00:00.000Z"),
      ventureId: venture.id,
      targetWindowStart: "2096-06-01",
      targetWindowEnd: "2096-06-05",
      ...PAID_FROM_THE_ACCOUNT,
    });
    const { client: selling } = await at("2096-01-10T06:00:00.000Z");
    const sold = await selling.sales.record({
      tagNumber: bull.tagNumber,
      buyer: { name: `কসাই ${suffix}` },
      destination: "গাবতলী",
      vehicle: "ঢাকা মেট্রো-ট ১১-২২৩৪",
      driver: "সোহেল",
      priceMoney: 100_000,
      weightKg: 300,
      paymentMethod: "bank",
      reference: `SALE-${suffix}`,
    });
    const { client: settling } = await at("2096-01-15T06:00:00.000Z");
    const worked = await settling.ventures.settlement.get({
      ventureId: venture.id,
    });
    expect(worked.blocks).toEqual([]);
    await settling.ventures.settlement.approve({ ventureId: venture.id });
    const approved = await settling.ventures.settlement.approved({
      ventureId: venture.id,
    });
    const share = approved?.shares.find((one) => one.agreementId === farms.id);
    expect(share).toMatchObject({
      capitalMoney: 500_000,
      payoutMoney: 506_000,
    });
    // The Farm banks with an account it has listed: both halves land in it, on the one transfer's reference.
    const current = await settling.farmAccounts.create({
      kind: "bank",
      name: `চলতি হিসাব ${suffix}`,
      number: `0${suffix}11`,
      bank: "সোনালী ব্যাংক",
      branch: "সাভার",
    });
    const paid = await settling.ventures.settlement.pay({
      ventureId: venture.id,
      agreementId: farms.id,
      amountMoney: 506_000,
      movedOn: "2096-01-15",
      paymentMethod: "bank",
      reference: `FARM-BACK-${suffix}`,
      farmAccountId: current.id,
    });
    expect(paid.paidMoney).toBe(506_000);
    // Landed on the Farm's own books as it went: nobody is left to say they had it.
    const after = await settling.ventures.settlement.approved({
      ventureId: venture.id,
    });
    expect(
      after?.shares.find((one) => one.agreementId === farms.id)?.acknowledgedAt
    ).toBeTruthy();
    const home = await scratchDb().query.moneyEvent.findMany({
      where: {
        farmId: theFarm().id,
        source: { in: ["venture_capital_back", "venture_capital_return"] },
        occurredAt: { gte: new Date("2096-01-01T00:00:00Z") },
      },
      columns: {
        source: true,
        amountMoney: true,
        direction: true,
        farmAccountId: true,
        reference: true,
      },
    });
    // Both in the account it went into, on the one transfer's reference: the account adds up to what the bank shows.
    expect(home).toEqual(
      expect.arrayContaining([
        {
          source: "venture_capital_back",
          amountMoney: 500_000,
          direction: "in",
          farmAccountId: current.id,
          reference: `FARM-BACK-${suffix}`,
        },
        {
          source: "venture_capital_return",
          amountMoney: 6000,
          direction: "in",
          farmAccountId: current.id,
          reference: `FARM-BACK-${suffix} · return`,
        },
      ])
    );

    // The Investor paid too, then the buyer makes up ৳20,000: ৳12,000 more to the Units, ৳600 a Unit. The Farm's own
    // ten would be the Farm paying itself, so only the Investor's ten are sent — ৳6,000, and the screen is told so.
    await settling.ventures.settlement.pay({
      ventureId: venture.id,
      agreementId: theirs,
      amountMoney: 506_000,
      movedOn: "2096-01-15",
      paymentMethod: "bank",
      reference: `INV-BACK-${suffix}`,
    });
    const { client: late } = await at("2096-02-01T06:00:00.000Z");
    await late.farm.setParameters({ adjustmentThresholdMoney: 1000 });
    await late.sales.correct({
      id: sold.id,
      reason: `ক্রেতা বাকি টাকা দিয়েছে ${suffix}`,
      changes: { priceMoney: { from: 100_000, to: 120_000 } },
    });
    const raised = await late.ventures.settlement.adjustments.raise({
      ventureId: venture.id,
      reason: `বিক্রির দাম সংশোধন ${suffix}`,
    });
    const owed = await late.ventures.settlement.approved({
      ventureId: venture.id,
    });
    expect(
      owed?.adjustments.find((one) => one.id === raised.id)?.toPayMoney
    ).toBe(6000);
    expect(owed?.shares.map((one) => [one.agreementId, one.farmsOwn])).toEqual(
      expect.arrayContaining([
        [farms.id, true],
        [theirs, false],
      ])
    );
    const sent = await late.ventures.settlement.adjustments.pay({
      ventureId: venture.id,
      adjustmentId: raised.id,
      movedOn: "2096-02-01",
      paymentMethod: "bank",
      reference: `ADJ-${suffix}`,
      farmAccountId: current.id,
    });
    expect(sent.paidMoney).toBe(6000);
  });
});

describe("the Farm's own Units, told to every Investor before they sign", () => {
  it("are on the Agreement laid out to be signed — how many of how many — and on no Venture where the Farm holds none", async () => {
    const owner = await as("owner");
    const person = await owner.investors.record({
      name: `জানানো ${suffix}`,
      phone: `0181${suffix}9`,
    });
    const terms = (ventureId: string) => ({
      ventureId,
      investorId: person.id,
      units: 3,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
    });
    const withFarm = await aVenture("জানানো");
    await owner.ventures.agreements.farmTakes({
      ventureId: withFarm,
      units: 4,
    });
    const told = await owner.investorStatements.agreementToSign(
      terms(withFarm)
    );
    expect(JSON.stringify(told.document)).toContain(
      "The Farm itself holds 4 of this Venture's 10 Units with its own money"
    );
    expect(JSON.stringify(told.document)).toContain(
      "খামার নিজেও নিজের টাকায় এই ভেঞ্চারের ১০টি ইউনিটের মধ্যে ৪টি নিয়েছে"
    );

    const without = await aVenture("না জানানো");
    const plain = await owner.investorStatements.agreementToSign(
      terms(without)
    );
    expect(JSON.stringify(plain.document)).not.toContain(
      "The Farm itself holds"
    );
  });

  it("are on his progress statement beside his own Units, as his Agreement told him", async () => {
    const owner = await as("owner");
    const ventureId = await aVenture("অগ্রগতি");
    await owner.ventures.agreements.farmTakes({
      ventureId,
      units: 3,
    });
    const agreementId = await signedUp("অগ্রগতির জন", ventureId, 4);

    const { text } = await owner.investorStatements.progress({ agreementId });

    expect(text).toMatch(/খামারের নিজের ইউনিট[^\n]*৩ \/ ১০/u);

    // And on his Venture's page in the portal, which says the same figures as the statement.
    const his = await scratchDb().query.investmentAgreement.findFirst({
      where: { id: agreementId },
      columns: { investorId: true },
    });
    const today = await owner.portalPreview.venture({
      investorId: his?.investorId ?? "",
      agreementId,
    });
    expect(today.farmUnits).toEqual({ farmUnits: 3, ventureUnits: 10 });
  });
});

describe("the Farm's own partner record", () => {
  it("is no person: signed, renamed, retired, asked into the portal or given a paper by nobody, and counted as nobody signed", async () => {
    const owner = await as("owner");
    const ventureId = await aVenture("কেউ নয়");
    const taken = await owner.ventures.agreements.farmTakes({
      ventureId,
      units: 2,
    });
    const [own] = await owner.ventures.agreements.list({ ventureId });
    const farmId = own?.investorId ?? "";
    const other = await aVenture("অন্য");

    await expect(
      owner.ventures.agreements.sign({
        ventureId: other,
        investorId: farmId,
        units: 1,
        investorsPercent: 60,
        arbitrator: `সালিস ${suffix}`,
        stampValueMoney: 300,
        stampedOn: "2095-01-02",
        stampSerial: `S-farm-${suffix}`,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      owner.investors.update({ id: farmId, name: "কেউ", phone: "01711000000" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(owner.investors.retire({ id: farmId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      owner.investors.consentSheet({ id: farmId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      owner.investors.inviteToPortal({ id: farmId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await refusalOf(
        owner.ventures.agreements.keepPaper({
          agreementId: taken.id,
          contentType: "image/jpeg",
          data: "aGVsbG8=",
        })
      )
    ).toBe("the_farms_own_units");

    await signedUp("একজন মানুষ", ventureId, 3);
    const listed = await owner.ventures.list();
    expect(listed.find((one) => one.id === ventureId)?.signedFor).toEqual({
      units: 5,
      people: 1,
    });
  });

  it("is on no Amendment's paper: every Investor signs it, and the Farm's Units move with theirs", async () => {
    const owner = await as("owner");
    const ventureId = await aVenture("সংশোধন");
    await owner.ventures.agreements.farmTakes({
      ventureId,
      units: 2,
    });
    await signedUp("সংশোধনের জন", ventureId, 1);

    const { document } = await owner.investorStatements.amendmentToSign({
      ventureId,
      investorsPercent: 65,
      targetWindowStart: "2095-06-05",
      targetWindowEnd: "2095-06-12",
      signedOn: "2095-01-03",
      reason: "ঈদের তারিখ বদলেছে",
    });
    // The Farm signs once, as the Mudarib; its own partner record signs nothing.
    const signing = document.sections.find(
      (section) => section.kind === "signatures"
    );
    expect(
      signing?.kind === "signatures"
        ? signing.signers.map((one) => one.name)
        : []
    ).toEqual([expect.any(String), `সংশোধনের জন ${suffix}`]);
  });
});

describe("the split the Farm's own Units are on", () => {
  it("is the farm's own, never sent, and every Investor signs on it", async () => {
    const owner = await as("owner");
    const ventureId = await aVenture("ভাগ");
    await owner.ventures.agreements.farmTakes({ ventureId, units: 2 });
    const [own] = await owner.ventures.agreements.list({ ventureId });
    expect(own?.investorsPercent).toBe(60);

    const person = await owner.investors.record({
      name: `অন্য ভাগে ${suffix}`,
      phone: `0191${suffix}7`,
    });
    expect(
      await refusalOf(
        owner.ventures.agreements.sign({
          ventureId,
          investorId: person.id,
          units: 1,
          investorsPercent: 70,
          arbitrator: `সালিস ${suffix}`,
          stampValueMoney: 300,
          stampedOn: "2095-01-02",
          stampSerial: `S-split-${suffix}`,
        })
      )
    ).toBe("split_not_the_farms");
    // Nor laid out on another to be signed: a stamp bought for a paper the farm would refuse is a stamp wasted.
    expect(
      await refusalOf(
        owner.investorStatements.agreementToSign({
          ventureId,
          investorId: person.id,
          units: 1,
          investorsPercent: 70,
          arbitrator: `সালিস ${suffix}`,
        })
      )
    ).toBe("split_not_the_farms");
  });
});

describe("an Amendment on a Venture where only the Farm holds Units", () => {
  it("is refused as one nobody has signed for: there is no Investor to sign it", async () => {
    const owner = await as("owner");
    const ventureId = await aVenture("শুধু খামার");
    await owner.ventures.agreements.farmTakes({ ventureId, units: 3 });

    expect(
      await refusalOf(
        owner.ventures.agreements.amend({
          ventureId,
          investorsPercent: 65,
          targetWindowStart: "2095-06-05",
          targetWindowEnd: "2095-06-12",
          signedOn: "2095-01-03",
          reason: `কেউ সই করেনি ${suffix}`,
          contentType: "image/jpeg",
          data: "aGVsbG8=",
        })
      )
    ).toBe("nobody_has_signed");
    // Nothing moved: the Farm's Units are on the terms they were taken on.
    const [own] = await owner.ventures.agreements.list({ ventureId });
    expect(own?.investorsPercent).toBe(60);
  });
});

describe("the Farm's own Units after a paper was laid out", () => {
  it("are refused once an Investor has been handed a paper to sign: it was printed without them", async () => {
    const owner = await as("owner");
    const ventureId = await aVenture("কাগজ আগে");
    const person = await owner.investors.record({
      name: `কাগজ হাতে ${suffix}`,
      phone: `0161${suffix}3`,
    });
    await owner.investorStatements.agreementToSign({
      ventureId,
      investorId: person.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
    });

    expect(
      await refusalOf(
        owner.ventures.agreements.farmTakes({ ventureId, units: 2 })
      )
    ).toBe("paper_laid_out_already");
  });
});

describe("the Farm's own Units under the Owner's own wording", () => {
  it("are refused while the Agreement in force has no clause telling the Investors of them", async () => {
    const owner = await as("owner");
    await owner.templates.list();
    // The Owner publishes wording of her own from before the clause existed.
    await owner.templates.publish({
      kind: "investment_agreement",
      content: STANDARD_AGREEMENT_PAID_BY_THE_MONTH,
      note: `আমার নিজের ${suffix}`,
    });
    const ventureId = await aVenture("নিজের কথা");
    expect(
      await refusalOf(
        owner.ventures.agreements.farmTakes({ ventureId, units: 2 })
      )
    ).toBe("wording_tells_no_farm_capital");

    // With the standard back in force, every Investor's paper tells them, and the Farm may take its Units.
    await owner.templates.publish({
      kind: "investment_agreement",
      content: STANDARD_TEMPLATES.investment_agreement,
      note: `মানক আবার ${suffix}`,
    });
    await owner.ventures.agreements.farmTakes({ ventureId, units: 2 });
  });
});
