import { session as sessionTable } from "@OpenFarm/db/schema/auth";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import { buildContext } from "../context";
import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// A Venture's Projection (ADR 0010): what its Settlement might come to at the Owner's low and high sale prices. The
// Owner's figures, the Owner's to set and read; shown to Investors only once the Owner turns it on, and to the Owner
// in the Portal Preview either way.
//
// Every figure is worked by hand. Both Ventures here are still gathering capital, so they are projected from the
// plan: six animals at ৳500 a kilo for 250 kg, ৳1,25,000 each and ৳7,50,000 between them, inside an ৳8,00,000 cattle
// budget. Bought on the decide-by day, 20 January 2052, each puts on 0.8 kg a day until its window opens.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2052-01-01T04:00:00.000Z";
const PASSWORD = "gorur-khamar-2026";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(JANUARY),
  });
  return client;
};

type Client = Awaited<ReturnType<typeof asOwner>>;

/** A client signed in as the account an invitation opened. */
const signedInAs = async (loginEmail: string): Promise<Client> => {
  const db = scratchDb();
  const person = await db.query.user.findFirst({
    where: { email: loginEmail },
  });
  if (!person) {
    throw new Error("expected the Investor's account");
  }
  const clock = new FakeClock(JANUARY);
  const start = clock.now();
  const id = `projection-session-${person.id}`;
  await db
    .insert(sessionTable)
    .values({
      id,
      token: `projection-token-${person.id}`,
      userId: person.id,
      expiresAt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      createdAt: start,
      updatedAt: start,
    })
    .onConflictDoNothing();
  const session = await db.query.session.findFirst({ where: { id } });
  if (!session) {
    throw new Error("expected the session");
  }
  const context = await buildContext({
    session: { user: person, session },
    device: null,
    deviceStatus: "none",
    callerAddress: null,
    clock,
    db,
    farmId: theFarm().id,
  });
  return createRouterClient(appRouter, { context });
};

const TERMS = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2052-01-20",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

/** Six animals of 240 to 260 kg — 250 kg at the middle — at ৳500 a kilo, putting on 0.8 kg a day. */
const PLAN_LINE = {
  animals: 6,
  fromKg: 240,
  toKg: 260,
  buyBdtPerKg: 500,
  dailyGainKg: 0.8,
};
/** That line, sold at ৳600 to ৳700: the Venture Plan both Ventures are projected from. */
const PLAN = {
  lines: [PLAN_LINE],
  saleLowBdtPerKg: 600,
  saleHighBdtPerKg: 700,
};

/** The Venture Rahim is in, whose window opens 17 March: 57 days of gain, 295.6 kg each, 1,773.6 kg. */
let hisVenture = "";
/** A Venture shown in the portal whose window opens 1 June: 133 days of gain, 356.4 kg each, 2,138.4 kg. */
let offered = "";
let agreementId = "";
let rahimId = "";
let rahimsLogin = "";

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2052/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2054-03-31",
  });
  const his = await owner.ventures.open({
    name: `মার্চের ভেঞ্চার ${suffix}`,
    ...TERMS,
    targetWindowStart: "2052-03-17",
    targetWindowEnd: "2052-03-19",
  });
  hisVenture = his.id;
  const shown = await owner.ventures.open({
    name: `জুনের ভেঞ্চার ${suffix}`,
    ...TERMS,
    targetWindowStart: "2052-06-01",
    targetWindowEnd: "2052-06-10",
  });
  offered = shown.id;
  await owner.ventures.showInPortal({ id: offered, words: "ঈদ ২০৫২" });

  const him = await owner.investors.record({
    name: `রহিম ${suffix}`,
    phone: `0174${suffix}`,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${suffix.slice(-5)}`,
  });
  rahimId = him.id;
  const signed = await owner.ventures.sign({
    ventureId: hisVenture,
    investorId: him.id,
    units: 3,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2052-01-02",
    stampSerial: `S-P-${suffix}`,
  });
  agreementId = signed.id;
  await owner.ventures.keepAgreementPaper({
    agreementId,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId,
    amountBdt: 150_000,
    movedOn: "2052-01-03",
    paymentMethod: "bank",
    reference: `TRF-P-${suffix}`,
  });
  await owner.investors.setPortalOpen({ open: true });
  const { code } = await invitedWithConsent(owner, him.id);
  const { client: nobody } = await createTestClient(appRouter, {
    as: null,
    clock: new FakeClock(JANUARY),
  });
  const { loginEmail } = await nobody.portal.join({
    phone: `0174${suffix}`,
    code,
    password: PASSWORD,
  });
  rahimsLogin = loginEmail;
});

/** Rahim, signed in afresh: a request reads the farm's switches as they stand when it is made. */
const rahimNow = () => signedInAs(rahimsLogin);

describe("what a Venture is projected from", () => {
  it("is nothing until it has a plan", async () => {
    const owner = await asOwner();
    const read = await owner.ventures.projection({ ventureId: hisVenture });
    expect(read).toEqual({ basis: null, projection: null });
  });
});

describe("a Venture still gathering capital", () => {
  it("is projected from the plan: six animals grown to the window, charged what they cost and the whole running budget, every Unit taken", async () => {
    const owner = await asOwner();
    await owner.ventures.setPlan({ ventureId: hisVenture, ...PLAN });
    const { projection } = await owner.ventures.projection({
      ventureId: hisVenture,
    });

    expect(projection?.kgAtSale).toBeCloseTo(1773.6, 6);
    expect(projection).toMatchObject({
      realisedBdt: 0,
      // Six at ৳1,25,000 is ৳7,50,000 of cattle, and the ৳2,00,000 running budget taken as spent.
      chargedBdt: 950_000,
      investorsPercent: 60,
      units: 20,
      // 1,773.6 kg at ৳600 is ৳10,64,160, a profit of ৳1,14,160: sixty per cent is ৳68,496, ৳3,424 a Unit.
      low: { proceedsBdt: 1_064_160, profitBdt: 114_160, perUnitBdt: 3424 },
      // At ৳700 it is ৳12,41,520, a profit of ৳2,91,520: ৳1,74,912 to the Investors, ৳8,745 a Unit.
      high: { proceedsBdt: 1_241_520, profitBdt: 291_520, perUnitBdt: 8745 },
    });
  });
});

describe("a plan that spends past its cattle budget", () => {
  it("is charged what its animals cost, not only the budget", async () => {
    const owner = await asOwner();
    const over = await owner.ventures.open({
      name: `বাজেটের বাইরে ${suffix}`,
      ...TERMS,
      targetWindowStart: "2052-03-17",
      targetWindowEnd: "2052-03-19",
    });
    // Seven at ৳1,25,000 is ৳8,75,000: ৳75,000 past the ৳8,00,000 cattle budget.
    await owner.ventures.setPlan({
      ventureId: over.id,
      ...PLAN,
      lines: [{ ...PLAN_LINE, animals: 7 }],
    });
    const { projection } = await owner.ventures.projection({
      ventureId: over.id,
    });
    // Seven grown to 295.6 kg is 2,069.2 kg; charged ৳8,75,000 of cattle and the ৳2,00,000 running budget.
    expect(projection?.kgAtSale).toBeCloseTo(2069.2, 6);
    expect(projection?.chargedBdt).toBe(1_075_000);
  });
});

describe("a plan that expects some animals to die", () => {
  it("sells fewer at the low end, keeps the high end every animal living, and says so in the plan it measures", async () => {
    const owner = await asOwner();
    const run = await owner.ventures.open({
      name: `মৃত্যু ধরা ${suffix}`,
      ...TERMS,
      targetWindowStart: "2052-03-17",
      targetWindowEnd: "2052-03-19",
    });
    await owner.ventures.setPlan({
      ventureId: run.id,
      ...PLAN,
      deathsPercent: 10,
    });
    const plan = await owner.ventures.plan({ ventureId: run.id });
    expect(plan.latest?.deathsPercent).toBe(10);

    const { projection } = await owner.ventures.projection({
      ventureId: run.id,
    });
    // One in ten of the 1,773.6 kg does not live to be sold: 1,596.24 kg at ৳600 is ৳9,57,744, against the same
    // ৳9,50,000 charged — a profit of ৳7,744. At ৳700 every animal lives: ৳2,91,520, as without deaths.
    expect(projection?.low.kgAtSale).toBeCloseTo(1596.24, 6);
    expect(projection?.low.profitBdt).toBe(7744);
    expect(projection?.high).toMatchObject({ profitBdt: 291_520 });

    // Measured once buying begins, the plan says the same low end.
    await owner.ventures.startBuying({ id: run.id });
    const measured = await owner.ventures.planAgainstActual({
      ventureId: run.id,
    });
    expect(measured?.money.planned).toEqual({
      lowBdt: 7744,
      highBdt: 291_520,
    });
    // And what it is projected to make now is the projection's own profit at both ends. Buying has begun but nothing is
    // bought, so the plan's animals are all still to buy: charged ৳9,50,000 as before.
    const now = await owner.ventures.projection({ ventureId: run.id });
    expect(measured?.money.projected).toEqual({
      lowBdt: now.projection?.low.profitBdt,
      highBdt: now.projection?.high.profitBdt,
    });
    expect(now.projection?.chargedBdt).toBe(950_000);
  });
});

describe("a plan's refusals", () => {
  it("wants a reason once buying has begun, and spaces are not one", async () => {
    const owner = await asOwner();
    const run = await owner.ventures.open({
      name: `কারণ ${suffix}`,
      ...TERMS,
      targetWindowStart: "2052-03-17",
      targetWindowEnd: "2052-03-19",
    });
    await owner.ventures.startBuying({ id: run.id });
    // Nothing measured before there is a plan to measure against.
    expect(
      await owner.ventures.planAgainstActual({ ventureId: run.id })
    ).toBeNull();
    await expect(
      owner.ventures.setPlan({ ventureId: run.id, ...PLAN, reason: "   " })
    ).rejects.toMatchObject({
      data: { refusal: "plan_revision_needs_reason" },
    });
    const plan = await owner.ventures.plan({ ventureId: run.id });
    expect(plan.versions).toEqual([]);
  });

  it("has nothing left to plan once the Venture is called off", async () => {
    const owner = await asOwner();
    const run = await owner.ventures.open({
      name: `বাতিল ${suffix}`,
      ...TERMS,
      targetWindowStart: "2052-03-17",
      targetWindowEnd: "2052-03-19",
    });
    await owner.ventures.setPlan({ ventureId: run.id, ...PLAN });
    await owner.ventures.cancel({ id: run.id, reason: `মূলধন ওঠেনি ${suffix}` });
    await expect(
      owner.ventures.setPlan({
        ventureId: run.id,
        ...PLAN,
        reason: "বাতিলের পরে",
      })
    ).rejects.toMatchObject({ data: { refusal: "plan_after_the_end" } });
    const plan = await owner.ventures.plan({ ventureId: run.id });
    expect(plan.versions.map((one) => one.version)).toEqual([1]);
    // Nor is anything projected for it.
    const read = await owner.ventures.projection({ ventureId: run.id });
    expect(read.projection).toBeNull();
  });
});

describe("a Venture still buying", () => {
  it("stands on the animals it has bought and takes what each band has still to buy from the plan", async () => {
    const owner = await asOwner();
    const buying = await owner.ventures.open({
      name: `কেনার ভেঞ্চার ${suffix}`,
      ...TERMS,
      targetWindowStart: "2052-03-17",
      targetWindowEnd: "2052-03-19",
    });
    // Three of 240 to 260 kg at ৳500 putting on 0.8 kg a day, and two of 300 to 340 kg at ৳480 putting on 0.6.
    await owner.ventures.setPlan({
      ventureId: buying.id,
      ...PLAN,
      lines: [
        {
          animals: 3,
          fromKg: 240,
          toKg: 260,
          buyBdtPerKg: 500,
          dailyGainKg: 0.8,
        },
        {
          animals: 2,
          fromKg: 300,
          toKg: 340,
          buyBdtPerKg: 480,
          dailyGainKg: 0.6,
        },
      ],
    });
    await owner.ventures.startBuying({ id: buying.id });
    const shed = await owner.herd.createShed({ name: `কেনা ${suffix}` });
    const pen = await owner.herd.createPen({
      shedId: shed.id,
      name: `কেনা ${suffix}`,
    });
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(JANUARY),
    });
    // One of 250 kg, inside the first band, and one of 400 kg that no band planned.
    for (const weightKg of [250, 400]) {
      // oxlint-disable-next-line no-await-in-loop -- one beast off the lorry at a time
      await manager.intake.record({
        penId: pen.id,
        sex: "male",
        seller: { name: `ব্যাপারী ${suffix}` },
        purchasePriceBdt: weightKg * 500,
        weightKg,
        estimatedAgeMonths: 20,
        ventureId: buying.id,
        arrivedAt: new Date(JANUARY),
        targetWindowStart: "2052-03-17",
        targetWindowEnd: "2052-03-19",
      });
    }

    const { basis, projection } = await owner.ventures.projection({
      ventureId: buying.id,
    });
    // Standing: neither weighed since he came, so the 250 kg bull grows at his band's 0.8 kg a day for the 76 days
    // from 1 January to the window, 310.8 kg; the 400 kg bull has no band and no gain, 400 kg. Still to buy, on
    // 20 January and fed the 57 days to the window: two more of the first band at 250 + 45.6 = 295.6 kg, and both of
    // the second at 320 + 34.2 = 354.2 kg. 310.8 + 400 + 591.2 + 708.4 = 2,010.4 kg.
    expect(projection?.kgAtSale).toBeCloseTo(2010.4, 6);
    // And charged what those four still to buy cost: two at ৳1,25,000 and two at 320 kg for ৳480, ৳1,53,600 — ৳5,57,200
    // on top of what it has been charged and the ৳2,00,000 running budget it has not yet spent.
    const settlement = await owner.ventures.settlement({
      ventureId: buying.id,
    });
    expect(projection?.chargedBdt).toBe(
      settlement.chargedBdt + 200_000 + 557_200
    );
    // The plan's buying as one average, as an offer says it: ৳6,82,200 for 1,390 kg is ৳490.79 a kilo; 278 kg a head;
    // 3.6 kg a day over five head is 0.72.
    expect(basis).toMatchObject({
      planVersion: 1,
      buyBdtPerKg: 490.79,
      buyWeightKg: 278,
      dailyGainKg: 0.72,
    });
  });
});

describe("an Investor's own Venture in the portal", () => {
  it("carries no projection while the Owner has not turned them on", async () => {
    const him = await rahimNow();
    const today = await him.portal.venture({ agreementId });
    expect(today.projection).toBeNull();
  });

  it("is shown to the Owner in the Preview either way, so it can be read before anybody else does", async () => {
    const owner = await asOwner();
    const today = await owner.portalPreview.venture({
      investorId: rahimId,
      agreementId,
    });
    expect(today.projection).not.toBeNull();
  });

  it("says what it comes to for their own three Units once it is on, at both ends", async () => {
    const owner = await asOwner();
    await owner.investors.setProjectionsShown({ shown: true });
    const him = await rahimNow();
    const today = await him.portal.venture({ agreementId });
    await owner.investors.setProjectionsShown({ shown: false });

    expect(today.projection).toMatchObject({
      saleLowBdtPerKg: 600,
      saleHighBdtPerKg: 700,
      kgAtSale: 1774,
      // Three Units at ৳3,424 and ৳8,745 a Unit, on top of the ৳1,50,000 they put in.
      low: { shareBdt: 10_272, payoutBdt: 160_272 },
      high: { shareBdt: 26_235, payoutBdt: 176_235 },
    });
    // Their own figures; the Venture's whole split is not theirs to read.
    const said = JSON.stringify(today.projection);
    expect(said).not.toContain("farmBdt");
    expect(said).not.toContain("investorsBdt");
  });
});

describe("a Venture offered in the portal", () => {
  it("carries its projection a Unit once it is on, and none while it is off", async () => {
    const owner = await asOwner();
    await owner.ventures.setPlan({ ventureId: offered, ...PLAN });

    const before = await rahimNow();
    const off = await before.portal.openVentures();
    expect(off.find((one) => one.id === offered)?.projection).toBeNull();

    await owner.investors.setProjectionsShown({ shown: true });
    const after = await rahimNow();
    const on = await after.portal.openVentures();
    await owner.investors.setProjectionsShown({ shown: false });

    expect(on.find((one) => one.id === offered)?.projection).toMatchObject({
      saleLowBdtPerKg: 600,
      saleHighBdtPerKg: 700,
      buyBdtPerKg: 500,
      buyWeightKg: 250,
      dailyGainKg: 0.8,
      kgAtSale: 2138,
      // 2,138.4 kg at ৳600 makes ৳3,33,040, ৳9,991 a Unit; at ৳700, ৳5,46,880 and ৳16,406 a Unit.
      low: { profitBdt: 333_040, perUnitBdt: 9991 },
      high: { profitBdt: 546_880, perUnitBdt: 16_406 },
    });
  });
});

describe("the switch", () => {
  it("is the Owner's, and the Owner's list says where it stands", async () => {
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(JANUARY),
    });
    await expect(
      manager.investors.setProjectionsShown({ shown: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const owner = await asOwner();
    const listed = await owner.investors.list();
    expect(listed.projectionsShown).toBe(false);
  });
});
