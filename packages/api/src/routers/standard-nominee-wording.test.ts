import type { PaperDocument } from "@OpenFarm/domain";
import { FIRST_PRINTED_AGREEMENT } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The standard wording for several Nominees: a farm given its wording now starts from it, and a farm on an earlier
// Version keeps printing its own words — with the Nominee table under the Investor all the same, because who the
// parties are is the farm's, not the wording's.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2065-01-10T04:00:00.000Z";

const owner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(JANUARY),
  });
  return client;
};

let ventureId = "";
let investorId = "";

const NOMINEES = [
  {
    name: `স্ত্রী ${suffix}`,
    relation: "স্ত্রী",
    phone: null,
    bornOn: "1980-01-01",
    sharePercent: 80,
    receiver: null,
  },
  {
    name: `মেয়ে ${suffix}`,
    relation: "মেয়ে",
    phone: null,
    bornOn: "2055-01-01",
    sharePercent: 20,
    receiver: { name: `স্ত্রী ${suffix}`, relation: "মা", phone: null },
  },
];

/** The Agreement to sign, for the Investor and the Nominees above. */
const toSign = async (): Promise<PaperDocument> => {
  const client = await owner();
  const { document } = await client.investorStatements.agreementToSign({
    ventureId,
    investorId,
    units: 1,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    nominees: NOMINEES,
  });
  return document;
};

const partiesOf = (document: PaperDocument) => {
  const parties = document.sections.find((one) => one.kind === "parties");
  if (parties?.kind !== "parties") {
    throw new Error("expected the parties");
  }
  return parties.parties;
};

const everyClause = (document: PaperDocument) =>
  document.sections
    .flatMap((one) => (one.kind === "clauses" ? one.clauses : []))
    .map((clause) => clause.bn)
    .join("\n");

beforeAll(async () => {
  const client = await owner();
  await client.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000093",
    registrationNumber: `DLS/SAV/2065/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2067-03-31",
  });
  const venture = await client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2065-01-20",
    targetWindowStart: "2065-03-17",
    targetWindowEnd: "2065-03-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
  const him = await client.investors.record({
    name: `করিম ${suffix}`,
    phone: `0191${suffix}`,
  });
  investorId = him.id;
});

describe("the standard Agreement for several Nominees", () => {
  it("is what a farm given its wording now prints: the rules in the terms, a Receiver's line for the minor alone", async () => {
    const document = await toSign();

    const [, him] = partiesOf(document);
    expect(him?.lines.map((line) => line.bn)).toEqual([
      expect.stringContaining("প্রত্যেক নমিনি জানেন"),
      expect.stringContaining(`নমিনি মেয়ে ${suffix}-এর বয়স আঠারো বছরের কম`),
    ]);
    const clauses = everyClause(document);
    expect(clauses).toContain("নমিনি থাকলে তাঁদের মাধ্যমে");
    expect(clauses).toContain("সেই অংশের দায় থেকে খামার মুক্ত");
    expect(clauses).toContain("নমিনি ও গ্রহণকারীর তথ্য");
  });

  it("leaves a farm on an earlier Version printing its own words, with the Nominee table under the Investor", async () => {
    const client = await owner();
    await client.templates.publish({
      kind: "investment_agreement",
      content: FIRST_PRINTED_AGREEMENT,
      note: "The words first printed, kept",
    });

    const document = await toSign();

    const [, him] = partiesOf(document);
    expect(
      him?.nominees.map((one) => [one.name, one.share, one.minor])
    ).toEqual([
      [`স্ত্রী ${suffix}`, "৮০%", false],
      [`মেয়ে ${suffix}`, "২০%", true],
    ]);
    // Its own words: no lines under the Investor, and none of the rules it was never worded with.
    expect(him?.lines).toEqual([]);
    expect(everyClause(document)).not.toContain("নমিনি থাকলে তাঁদের মাধ্যমে");
  });
});
