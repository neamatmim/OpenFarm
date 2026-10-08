import {
  PORTAL_CONSENT_BEFORE_ORGANIZATIONS,
  STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
} from "@OpenFarm/domain";
import type { PaperDocument } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { caughtUpFrom } from "../test/standard-wording";
import { appRouter } from "./index";

// An Organization's papers (ADR 0020): its own details and its Signatory where a person's NID and Nominees would be, the
// Signatory signing for and on its behalf, its own clause where a person's death and Nominee clauses are — and a
// person's papers exactly as they were. A farm still on exactly the standard wording it was given is caught up to it.

const suffix = `${Date.now()}`.slice(-7);
const AT = "2077-01-05T04:00:00.000Z";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof asOwner>>;

const ORGANIZATION = {
  kind: "organization" as const,
  name: `যমুনা ডেইরি লিমিটেড ${suffix}`,
  phone: `0178${suffix}`,
  address: "বগুড়া",
  tradeLicense: `TRAD/BCC/${suffix}`,
  rjscNumber: `C-${suffix}`,
  tin: `77${suffix}`,
  authority: "পরিচালনা পর্ষদের সিদ্ধান্ত",
  authorityOn: "2076-12-20",
  signatoryName: `মো. কামরুল হাসান ${suffix}`,
  signatoryNid: "1980123456789",
  signatoryRole: "ব্যবস্থাপনা পরিচালক",
};

/** Lines of the standard wording each paper is looked through for. */
const ITS_OWN = "বিনিয়োগকারী একটি প্রতিষ্ঠান, যার পক্ষে তার স্বাক্ষরকারী সই করছেন";
const HEIRS = "বিনিয়োগকারীর মৃত্যু হলে তাঁর মূলধন ও প্রাপ্য";
const SUMS_AFTER_DEATH = "মাসের টাকা বাকি থাকা অবস্থায় বিনিয়োগকারীর মৃত্যু হলে";
const NO_NOMINEE = "বিনিয়োগকারী কোনো নমিনি মনোনীত করেননি";
const PERSONS_DATA = "আর তাঁর নমিনি ও গ্রহণকারীর তথ্য";
const ORGANIZATIONS_DATA = "তার স্বাক্ষরকারীর নাম, ফোন ও এনআইডি নম্বর";
const CONSENT_NOMINEES = "আমার নমিনি ও গ্রহণকারীর তথ্য রাখবে";
const CONSENT_AS_SIGNATORY = "প্রতিষ্ঠানের স্বাক্ষরকারী হিসেবে";

let monthly = "";
let organizationId = "";
let personId = "";

const toSign = async (owner: Owner, investorId: string) => {
  const { document } = await owner.investorStatements.agreementToSign({
    ventureId: monthly,
    investorId,
    units: 2,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
  });
  return document;
};

const partiesOf = (document: PaperDocument) => {
  const parties = document.sections.find((one) => one.kind === "parties");
  if (parties?.kind !== "parties") {
    throw new Error("expected a parties part");
  }
  return parties.parties;
};

const signersOf = (document: PaperDocument) => {
  const signatures = document.sections.find((one) => one.kind === "signatures");
  if (signatures?.kind !== "signatures") {
    throw new Error("expected a signatures part");
  }
  return signatures.signers;
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `বগুড়া ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/BOG/2077/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, বগুড়া",
    registrationExpiresOn: "2079-03-31",
  });
  const run = await owner.ventures.open({
    name: `মাসে মাসে ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2077-01-20",
    targetWindowStart: "2077-06-01",
    targetWindowEnd: "2077-06-10",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
    capitalPaid: "by_the_month",
  });
  monthly = run.id;
  const organization = await owner.investors.record(ORGANIZATION);
  organizationId = organization.id;
  const person = await owner.investors.record({
    name: `আব্দুল ${suffix}`,
    phone: `0177${suffix}`,
    nid: "1990000000001",
  });
  personId = person.id;
});

describe("an Organization's Investment Agreement", () => {
  it("names the Organization and its Signatory, and no Nominee", async () => {
    const owner = await asOwner();
    const document = await toSign(owner, organizationId);
    const [, them] = partiesOf(document);
    const said = Object.fromEntries(
      (them?.rows ?? []).map((row) => [row.label.en, row.value])
    );
    expect(said).toMatchObject({
      Name: ORGANIZATION.name,
      "Trade license": ORGANIZATION.tradeLicense,
      "RJSC registration": ORGANIZATION.rjscNumber,
      TIN: ORGANIZATION.tin,
      Signatory: ORGANIZATION.signatoryName,
      Role: ORGANIZATION.signatoryRole,
      Phone: ORGANIZATION.phone,
      "Signatory's NID": ORGANIZATION.signatoryNid,
    });
    expect(said).not.toHaveProperty("NID");
    expect(them?.nominees).toEqual([]);
    expect(them?.lines).toEqual([]);
  });

  it("is signed by the Signatory, for and on behalf of the Organization", async () => {
    const owner = await asOwner();
    const signers = signersOf(await toSign(owner, organizationId));
    expect(signers).toContainEqual({
      role: {
        bn: expect.stringContaining(`${ORGANIZATION.name}-এর পক্ষে`),
        en: expect.stringContaining(
          `for and on behalf of ${ORGANIZATION.name}`
        ),
      },
      name: `${ORGANIZATION.signatoryName}, ${ORGANIZATION.signatoryRole}`,
    });
  });

  it("says its share is its own, and nothing of a person's death or Nominees", async () => {
    const owner = await asOwner();
    const said = JSON.stringify(await toSign(owner, organizationId));
    expect(said).toContain(ITS_OWN);
    expect(said).toContain(ORGANIZATIONS_DATA);
    expect(said).not.toContain(HEIRS);
    expect(said).not.toContain(SUMS_AFTER_DEATH);
    expect(said).not.toContain(NO_NOMINEE);
    expect(said).not.toContain(PERSONS_DATA);
  });

  it("leaves a person's Agreement as it was", async () => {
    const owner = await asOwner();
    const said = JSON.stringify(await toSign(owner, personId));
    expect(said).toContain(HEIRS);
    expect(said).toContain(SUMS_AFTER_DEATH);
    expect(said).toContain(NO_NOMINEE);
    expect(said).toContain(PERSONS_DATA);
    expect(said).not.toContain(ITS_OWN);
    expect(said).not.toContain(ORGANIZATIONS_DATA);
  });
});

describe("an Organization's Portal Consent", () => {
  it("is given by its Signatory for it, and holds no Nominee", async () => {
    const owner = await asOwner();
    const { document } = await owner.investors.consentSheet({
      id: organizationId,
    });
    expect(document.preamble.bn).toContain(
      `${ORGANIZATION.signatoryName}, ${ORGANIZATION.name}-এর পক্ষে`
    );
    const said = JSON.stringify(document);
    expect(said).toContain(CONSENT_AS_SIGNATORY);
    expect(said).not.toContain(CONSENT_NOMINEES);
  });

  it("leaves a person's as it was", async () => {
    const owner = await asOwner();
    const { document } = await owner.investors.consentSheet({ id: personId });
    expect(document.preamble.bn).toContain(`আমি, আব্দুল ${suffix} (মোবাইল`);
    const said = JSON.stringify(document);
    expect(said).toContain(CONSENT_NOMINEES);
    expect(said).not.toContain(CONSENT_AS_SIGNATORY);
  });
});

describe("a farm on the standard wording before Organizations", () => {
  it("is caught up to the Agreement that carries an Organization's lines", async () => {
    const { before, caughtUp } = await caughtUpFrom(
      await asOwner(),
      "investment_agreement",
      STANDARD_AGREEMENT_WITH_FARM_CAPITAL
    );
    expect(caughtUp?.currentVersionId).not.toBe(before);
    expect(JSON.stringify(caughtUp?.currentVersion?.content)).toContain(
      ITS_OWN
    );
    expect(caughtUp?.currentVersion?.note).toContain("2026-10-08");
  });

  it("is caught up to the Portal Consent a Signatory gives", async () => {
    const { before, caughtUp } = await caughtUpFrom(
      await asOwner(),
      "portal_consent",
      PORTAL_CONSENT_BEFORE_ORGANIZATIONS
    );
    expect(caughtUp?.currentVersionId).not.toBe(before);
    expect(JSON.stringify(caughtUp?.currentVersion?.content)).toContain(
      CONSENT_AS_SIGNATORY
    );
  });
});
