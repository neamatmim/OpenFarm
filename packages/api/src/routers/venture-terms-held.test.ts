import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { openVenturesFor } from "../venture-showing";
import { appRouter } from "./index";

// Once anybody has signed for a Venture, its terms are its own: a later paper prints its wind-up days, every later
// Investor is held to its split, and the portal offers it on that split — whatever the farm's figures say now.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2071-01-10T04:00:00.000Z";

const ownerAt = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(JANUARY),
  });
  return client;
};

let ventureId = "";
let second = "";
let third = "";

const signFor = async (investorId: string, investorsPercent: number) => {
  const owner = await ownerAt();
  return owner.ventures.agreements.sign({
    ventureId,
    investorId,
    units: 2,
    investorsPercent,
    arbitrator: `সালিস ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2071-01-10",
    stampSerial: `ST-${suffix}-${investorsPercent}-${investorId.slice(-4)}`,
    nominees: [],
  });
};

beforeAll(async () => {
  const owner = await ownerAt();
  await owner.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000094",
    registrationNumber: `DLS/SAV/2071/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2073-03-31",
  });
  await owner.farm.setParameters({
    windUpDays: 30,
    ventureInvestorsPercent: 60,
  });
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2071-01-20",
    targetWindowStart: "2071-03-17",
    targetWindowEnd: "2071-03-19",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  const people = [];
  for (const [index, name] of ["প্রথম", "দ্বিতীয়", "তৃতীয়"].entries()) {
    // oxlint-disable-next-line no-await-in-loop -- one Investor after another
    const one = await owner.investors.record({
      name: `${name} ${suffix}`,
      phone: `0181${suffix}${index}`,
    });
    people.push(one.id);
  }
  const [first, two, three] = people;
  second = two ?? "";
  third = three ?? "";
  await signFor(first ?? "", 60);
  // The farm's figures change after the first signing.
  await owner.farm.setParameters({
    windUpDays: 45,
    ventureInvestorsPercent: 50,
  });
});

describe("a Venture somebody has signed for", () => {
  it("prints its own wind-up days on a later Investor's paper, not the farm's new figure", async () => {
    const owner = await ownerAt();
    const { document } = await owner.investorStatements.agreementToSign({
      ventureId,
      investorId: second,
      units: 2,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
    });
    const said = JSON.stringify(document);
    expect(said).toContain("৩০ দিন");
    expect(said).not.toContain("৪৫ দিন");
  });

  it("holds a later Investor to the split it was first signed on", async () => {
    await expect(signFor(second, 50)).rejects.toMatchObject({
      data: { refusal: "split_not_the_ventures", investorsPercent: 60 },
    });
    await signFor(second, 60);
  });

  it("is offered in the portal on its own split", async () => {
    const owner = await ownerAt();
    await owner.ventures.showInPortal({ id: ventureId, words: "" });
    const farm = await scratchDb().query.farm.findFirst({
      where: { id: theFarm().id },
      columns: { id: true, ventureInvestorsPercent: true },
    });
    const offered = await openVenturesFor(
      scratchDb(),
      {
        id: farm?.id ?? "",
        ventureInvestorsPercent: farm?.ventureInvestorsPercent ?? 0,
      },
      third,
      new Date(JANUARY)
    );
    expect(offered.find((one) => one.id === ventureId)?.investorsPercent).toBe(
      60
    );
  });
});
