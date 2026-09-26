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
// plan: ৳500 a kilo for 250 kg animals is ৳1,25,000 each, and an ৳8,00,000 cattle budget buys six of them. Bought
// on the decide-by day, 20 January 2052, each puts on 0.8 kg a day until its window opens.

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

/** Six animals of 240 to 260 kg — 250 kg at the middle — at ৳500 a kilo, putting on 0.8 kg a day, sold at ৳600 to
 *  ৳700: the Venture Plan both Ventures are projected from. */
const PLAN = {
  lines: [
    { animals: 6, fromKg: 240, toKg: 260, buyBdtPerKg: 500, dailyGainKg: 0.8 },
  ],
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
  it("is projected from the plan: six animals grown to the window, the whole capital charged, every Unit taken", async () => {
    const owner = await asOwner();
    await owner.ventures.setPlan({ ventureId: hisVenture, ...PLAN });
    const { projection } = await owner.ventures.projection({
      ventureId: hisVenture,
    });

    expect(projection?.kgAtSale).toBeCloseTo(1773.6, 6);
    expect(projection).toMatchObject({
      realisedBdt: 0,
      chargedBdt: 1_000_000,
      investorsPercent: 60,
      units: 20,
      // 1,773.6 kg at ৳600 is ৳10,64,160, a profit of ৳64,160: sixty per cent is ৳38,496, ৳1,924 a Unit.
      low: { proceedsBdt: 1_064_160, profitBdt: 64_160, perUnitBdt: 1924 },
      // At ৳700 it is ৳12,41,520, a profit of ৳2,41,520: ৳1,44,912 to the Investors, ৳7,245 a Unit.
      high: { proceedsBdt: 1_241_520, profitBdt: 241_520, perUnitBdt: 7245 },
    });
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
      // Three Units at ৳1,924 and ৳7,245 a Unit, on top of the ৳1,50,000 they put in.
      low: { shareBdt: 5772, payoutBdt: 155_772 },
      high: { shareBdt: 21_735, payoutBdt: 171_735 },
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
      // 2,138.4 kg at ৳600 makes ৳2,83,040, ৳8,491 a Unit; at ৳700, ৳4,96,880 and ৳14,906 a Unit.
      low: { profitBdt: 283_040, perUnitBdt: 8491 },
      high: { profitBdt: 496_880, perUnitBdt: 14_906 },
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
