import { paperText } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The month's অগ্রগতি for every Investor of a Venture at once: two who paid in, one who has not yet — each is sent the
// paper — and the Farm's own Units beside them, whose paper nobody is sent.

const suffix = `${Date.now()}`.slice(-6);

const at = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

let ventureId = "";
const names = {
  paid: [`করিম ${suffix}`, `রহিম ${suffix}`],
  unpaid: `সালমা ${suffix}`,
};
const papers: Record<string, string> = {};

beforeAll(async () => {
  const { client: owner } = await at("2099-01-02T04:00:00.000Z");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000099",
    registrationNumber: `DLS/SAV/2099/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2101-03-31",
  });
  const venture = await owner.ventures.open({
    name: `সবার অগ্রগতি ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2099-01-02",
    targetWindowStart: "2099-06-01",
    targetWindowEnd: "2099-06-05",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  ventureId = venture.id;
  await owner.ventures.agreements.farmTakes({ ventureId, units: 1 });
  for (const [index, name] of [...names.paid, names.unpaid].entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor signed at a time
    const person = await owner.investors.record({
      name,
      phone: `0173${suffix}${index}`,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    const agreement = await owner.ventures.agreements.sign({
      ventureId,
      investorId: person.id,
      units: 3,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2099-01-02",
      stampSerial: `PA-${index}-${suffix}`,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above
    await owner.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    papers[name] = agreement.id;
    if (name !== names.unpaid) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await owner.ventures.takeCapital({
        agreementId: agreement.id,
        amountMoney: 150_000,
        movedOn: "2099-01-02",
        paymentMethod: "bank",
        reference: `PA-IN-${index}-${suffix}`,
      });
    }
  }
  await owner.ventures.startBuying({ id: ventureId });
});

describe("every Investor's progress statement at once", () => {
  it("makes a paper for every Investor who signed, one after another, readable in either language", async () => {
    const { client: owner } = await at("2099-02-01T04:00:00.000Z");

    const made = await owner.investorStatements.progressAll({ ventureId });

    const everybody = [...names.paid, names.unpaid];
    expect(made.papers.map((one) => one.investorName)).toEqual(everybody);
    for (const [index, one] of made.papers.entries()) {
      expect(paperText(one.document, "bn")).toContain(everybody[index]);
      expect(paperText(one.document, "en")).toContain(everybody[index]);
    }
  });

  it("leaves the Farm's own Units out, as the month's notice does", async () => {
    const { client: owner } = await at("2099-02-01T04:00:00.000Z");
    const listed = await owner.ventures.agreements.list({ ventureId });
    const farms = listed.find((one) => one.isFarm)?.id;

    const made = await owner.investorStatements.progressAll({ ventureId });

    const named = made.papers.map((one) => one.agreementId);
    expect(farms).toBeDefined();
    expect(named).not.toContain(farms);
    expect(named).toHaveLength(3);
  });

  it("keeps each paper in the trail as its own Export", async () => {
    const { client: owner } = await at("2099-02-02T04:00:00.000Z");

    await owner.investorStatements.progressAll({ ventureId });

    const trail = await owner.audit.list({ entity: "investment_agreement" });
    const exported = trail.filter(
      (one) =>
        one.action === "export" &&
        [...names.paid, names.unpaid].some(
          (name) => papers[name] === one.entityId
        )
    );
    expect(new Set(exported.map((one) => one.entityId)).size).toBe(3);
  });
});
