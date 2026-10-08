import type { PaperDocument } from "@OpenFarm/domain";
import {
  FIRST_PRINTED_AGREEMENT,
  NOMINATION_BEFORE_NOMINEE_NUMBERS,
  PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
  STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS,
} from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { caughtUpFrom } from "../test/standard-wording";
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
    nid: "1980 0101 4417",
    sharePercent: 80,
    receiver: null,
  },
  {
    name: `মেয়ে ${suffix}`,
    relation: "মেয়ে",
    phone: null,
    bornOn: "2055-01-01",
    birthRegistration: "20552691507114382",
    sharePercent: 20,
    receiver: {
      name: `স্ত্রী ${suffix}`,
      relation: "মা",
      phone: null,
      nid: "1980 0101 4417",
    },
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
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2065-01-20",
    targetWindowStart: "2065-03-17",
    targetWindowEnd: "2065-03-19",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  const him = await client.investors.record({
    name: `করিম ${suffix}`,
    phone: `0191${suffix}`,
  });
  investorId = him.id;
});

describe("a farm on the standard wording before Nominees gave their numbers", () => {
  it("is caught up on each paper that names what a Nominee gives, with a note saying the lawyer has not read it", async () => {
    for (const [kind, content, said] of [
      [
        "investment_agreement",
        STANDARD_AGREEMENT_BEFORE_NOMINEE_NUMBERS,
        "নাবালক হলে জন্ম নিবন্ধন নম্বর",
      ],
      [
        "nomination",
        NOMINATION_BEFORE_NOMINEE_NUMBERS,
        "নাবালক হলে জন্ম নিবন্ধন নম্বর",
      ],
      [
        "privacy_notice",
        PRIVACY_NOTICE_BEFORE_NOMINEE_NUMBERS,
        "গ্রহণকারীর নাম, সম্পর্ক, ফোন ও এনআইডি নম্বর",
      ],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const { before, caughtUp } = await caughtUpFrom(
        // oxlint-disable-next-line no-await-in-loop
        await owner(),
        kind,
        content
      );
      expect(caughtUp?.currentVersionId).not.toBe(before);
      expect(JSON.stringify(caughtUp?.currentVersion?.content)).toContain(said);
      expect(caughtUp?.currentVersion?.note).toContain(
        "not yet read by the lawyer"
      );
    }
  });
});

describe("the standard Agreement for several Nominees", () => {
  it("is what a farm given its wording now prints: the rules in the terms, a Receiver's line for the minor alone", async () => {
    const document = await toSign();

    const [, him] = partiesOf(document);
    expect(him?.lines.map((line) => line.bn)).toEqual([
      expect.stringContaining(
        "প্রত্যেক নমিনি জানেন, খামার তাঁদের নাম, সম্পর্ক, জন্মতারিখ, ফোন আর এনআইডি নম্বর — নাবালক হলে জন্ম নিবন্ধন নম্বর — রাখছে"
      ),
      expect.stringContaining(`নমিনি মেয়ে ${suffix}-এর বয়স আঠারো বছরের কম`),
    ]);
    expect(him?.lines[1]?.bn).toContain("আমার এনআইডি নম্বর রাখায় সম্মতি");
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
      him?.nominees.map((one) => [one.name, one.share, one.minor, one.idNumber])
    ).toEqual([
      [`স্ত্রী ${suffix}`, "৮০%", false, "1980 0101 4417"],
      [`মেয়ে ${suffix}`, "২০%", true, "20552691507114382"],
    ]);
    // Its own words: no lines under the Investor, and none of the rules it was never worded with.
    expect(him?.lines).toEqual([]);
    expect(everyClause(document)).not.toContain("নমিনি থাকলে তাঁদের মাধ্যমে");
  });
});
