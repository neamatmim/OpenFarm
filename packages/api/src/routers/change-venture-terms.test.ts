import { eq } from "@OpenFarm/db/operators";
import { auditEvent } from "@OpenFarm/db/schema/audit";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

// A Venture's terms may be put right until somebody is bound by them (ADR 0035): nobody signed, and no Agreement out
// in the portal, whose paper was laid out from those terms. After that they are what somebody signed.

const suffix = `${Date.now()}`.slice(-6);
const AT = "2075-01-05T04:00:00.000Z";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(AT),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof as>>;

const TERMS = {
  name: `শর্ত ${suffix}`,
  targetCapitalMoney: 1_000_000,
  floorMoney: 0,
  decideBy: "2075-01-20",
  targetWindowStart: "2075-06-01",
  targetWindowEnd: "2075-06-10",
  unitPriceMoney: 50_000,
  units: 20,
  cattleBudgetMoney: 800_000,
};

const CHANGED = {
  name: `নতুন শর্ত ${suffix}`,
  targetCapitalMoney: 2_000_000,
  floorMoney: 1_000_000,
  decideBy: "2075-02-15",
  targetWindowStart: "2075-07-01",
  targetWindowEnd: "2075-07-10",
  unitPriceMoney: 100_000,
  units: 20,
  cattleBudgetMoney: 1_500_000,
};

const invited = invitingInvestors({ prefix: "019", run: suffix }, AT);

const listed = async (owner: Owner, id: string) => {
  const all = await owner.ventures.list();
  return all.find((one) => one.id === id);
};

let phones = 0;

/** Somebody signed for two Units of it, on stamped paper. */
const signOn = async (owner: Owner, ventureId: string) => {
  phones += 1;
  const him = await owner.investors.record({
    name: `বিনিয়োগকারী ${phones} ${suffix}`,
    phone: `0175${suffix}${phones}`,
  });
  return await owner.ventures.agreements.sign({
    ventureId,
    investorId: him.id,
    units: 2,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2075-01-03",
    stampSerial: `CT ${phones} ${suffix}`,
  });
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000075",
    registrationNumber: `DLS/SAV/2075/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2077-03-31",
  });
  await owner.farm.setDataKeepers({
    dataHost: `হোস্ট ${suffix}`,
    backupStore: `ব্যাকআপ ${suffix}`,
    backupCountry: "জার্মানি",
  });
  await owner.investors.setPortalOpen({ open: true });
  await owner.investors.setAgreementsInApp({ shown: true });
});

describe("changing a Venture's terms while nobody is bound", () => {
  it("changes every term it opened on, and keeps what it said before in the trail", async () => {
    const owner = await as("owner");
    const { id } = await owner.ventures.open(TERMS);

    await owner.ventures.changeTerms({ id, terms: CHANGED });

    expect(await listed(owner, id)).toMatchObject({
      name: CHANGED.name,
      targetCapitalMoney: 2_000_000,
      floorMoney: 1_000_000,
      decideBy: "2075-02-15",
      targetWindow: { start: "2075-07-01", end: "2075-07-10" },
      unitPriceMoney: 100_000,
      units: 20,
      cattleBudgetMoney: 1_500_000,
      state: "open",
    });
    const trail = await scratchDb()
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.entityId, id));
    expect(JSON.stringify(trail)).toContain(TERMS.name);
  });

  it("works the Cattle Part out again paid by the month, and forgets it paid before buying", async () => {
    const owner = await as("owner");
    const { id } = await owner.ventures.open(TERMS);

    await owner.ventures.changeTerms({
      id,
      terms: { ...TERMS, capitalPaid: "by_the_month" },
    });
    expect(await listed(owner, id)).toMatchObject({
      capitalPaid: "by_the_month",
      monthly: { cattlePartMoney: 40_000 },
    });

    await owner.ventures.changeTerms({
      id,
      terms: { ...TERMS, capitalPaid: "before_buying" },
    });
    const after = await listed(owner, id);
    expect(after?.capitalPaid).toBe("before_buying");
    expect(after?.monthly ?? null).toBeNull();
  });

  it("refuses what opening it would refuse", async () => {
    const owner = await as("owner");
    const { id } = await owner.ventures.open(TERMS);

    await expect(
      owner.ventures.changeTerms({
        id,
        terms: { ...TERMS, floorMoney: 1_000_001 },
      })
    ).rejects.toMatchObject({
      data: { refusal: "venture_floor_over_target" },
    });
  });

  it("is the Owner's alone", async () => {
    const owner = await as("owner");
    const manager = await as("manager");
    const { id } = await owner.ventures.open(TERMS);

    await expect(
      manager.ventures.changeTerms({ id, terms: CHANGED })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("once somebody is bound", () => {
  it("refuses after a signature, and the terms stay what was signed", async () => {
    const owner = await as("owner");
    const { id } = await owner.ventures.open(TERMS);
    await signOn(owner, id);

    await expect(
      owner.ventures.changeTerms({ id, terms: CHANGED })
    ).rejects.toMatchObject({ data: { refusal: "venture_has_signatures" } });

    expect(await listed(owner, id)).toMatchObject({
      name: TERMS.name,
      unitPriceMoney: 50_000,
    });
  });

  it("refuses while an Agreement is out, and allows it once that is withdrawn", async () => {
    const owner = await as("owner");
    const them = await invited("প্রস্তাব");
    const { id } = await owner.ventures.open(TERMS);
    const offer = await owner.ventures.agreements.offers.make({
      ventureId: id,
      investorId: them.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
    });

    await expect(
      owner.ventures.changeTerms({ id, terms: CHANGED })
    ).rejects.toMatchObject({ data: { refusal: "venture_offer_waiting" } });

    await owner.ventures.agreements.offers.withdraw({ offerId: offer.id });
    await owner.ventures.changeTerms({ id, terms: CHANGED });

    expect(await listed(owner, id)).toMatchObject({ name: CHANGED.name });
  });

  it("refuses once it is no longer Open", async () => {
    const owner = await as("owner");
    const { id } = await owner.ventures.open(TERMS);
    await owner.ventures.startBuying({ id });

    await expect(
      owner.ventures.changeTerms({ id, terms: CHANGED })
    ).rejects.toMatchObject({ data: { refusal: "venture_wrong_state" } });
  });
});
