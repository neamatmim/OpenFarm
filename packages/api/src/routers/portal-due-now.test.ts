import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { theirAgreements } from "../their-agreements";
import { appRouter } from "./index";

// What an Investor's portfolio says is due on a Venture paid by the month: the Monthly Sums fallen due and not paid,
// those missed, and the next — never the whole Unit price still to come, which their home once read as "still to pay".

const suffix = `${Date.now()}`.slice(-6);
const AT = "2088-01-10T04:00:00.000Z";
const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  return client;
};
const invited = invitingInvestors({ prefix: "019", run: suffix }, AT);
const aVenture = async (
  name: string,
  capitalPaid: "by_the_month" | "before_buying"
) => {
  const owner = await asOwner();
  const { id } = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 580_000,
    floorMoney: 0,
    decideBy: "2088-01-25",
    targetWindowStart: "2088-11-01",
    targetWindowEnd: "2088-11-10",
    unitPriceMoney: 58_000,
    units: 10,
    cattleBudgetMoney: 400_000,
    capitalPaid,
  });
  await owner.ventures.setBankAccount({
    id,
    bank: "Test bank",
    accountName: "Venture account",
    accountNumber: `DUE-${id}`,
  });
  return id;
};
const signed = async (ventureId: string, name: string) => {
  const them = await invited(`${name} ${suffix}`);
  const owner = await asOwner();
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: them.id,
    units: 1,
    investorsPercent: 60,
    arbitrator: "Test arbitrator",
    stampValueMoney: 300,
    stampedOn: "2088-01-02",
    stampSerial: `DUE-${them.id}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return { ...them, agreementId: agreement.id };
};
const theirsOn = async (investorId: string, today: string) => {
  const { agreements } = await theirAgreements(
    scratchDb(),
    theFarm().id,
    investorId,
    today
  );
  const [one] = agreements;
  if (!one) {
    throw new Error("no agreement read");
  }
  return one;
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: "Test farm",
    phone: "+8801711000096",
    registrationNumber: `DUE-${suffix}`,
    registrationOffice: "Test office",
    registrationExpiresOn: "2090-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("what is due now on a Venture paid by the month", () => {
  it("says nothing is due once the Cattle Part is in, and names the next Monthly Sum, not the rest of the price", async () => {
    const ventureId = await aVenture("Due now paid up", "by_the_month");
    const them = await signed(ventureId, "Paid up investor");
    const owner = await asOwner();
    await owner.ventures.takeCapital({
      agreementId: them.agreementId,
      amountMoney: 40_000,
      reference: "DUE-CATTLE",
      movedOn: "2088-01-03",
      paymentMethod: "bank",
    });
    const one = await theirsOn(them.id, "2088-01-10");
    // The complaint: 18,000 of the price is still to come, and none of it is due.
    expect(one.promisedMoney - one.capitalHeldMoney).toBe(18_000);
    expect(one.monthly).toMatchObject({
      dueMoney: 0,
      missedMoney: 0,
      next: { dueOn: "2088-02-10" },
    });
  });

  it("says a Monthly Sum not paid is due, and missed seven days after its 10th", async () => {
    const ventureId = await aVenture("Due now behind", "by_the_month");
    const them = await signed(ventureId, "Behind investor");
    const owner = await asOwner();
    await owner.ventures.takeCapital({
      agreementId: them.agreementId,
      amountMoney: 40_000,
      reference: "DUE-CATTLE-2",
      movedOn: "2088-01-03",
      paymentMethod: "bank",
    });
    const due = await theirsOn(them.id, "2088-02-12");
    expect(due.monthly?.dueMoney).toBeGreaterThan(0);
    expect(due.monthly?.missedMoney).toBe(0);
    const missed = await theirsOn(them.id, "2088-02-20");
    expect(missed.monthly?.missedMoney).toBe(due.monthly?.dueMoney);
  });

  it("says nothing of Monthly Sums on a Venture paid before buying", async () => {
    const ventureId = await aVenture("Due now one sum", "before_buying");
    const them = await signed(ventureId, "One sum investor");
    const one = await theirsOn(them.id, "2088-01-10");
    expect(one.monthly).toBeNull();
  });
});
