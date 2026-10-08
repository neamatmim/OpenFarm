import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import {
  PORTAL_CONSENT_BEFORE_ORGANISATIONS,
  STANDARD_AGREEMENT_WITH_FARM_CAPITAL,
} from "@OpenFarm/domain";
import type { PaperDocument, TemplateKind } from "@OpenFarm/domain";
import {
  FakeClock,
  asTheFarmHeldItBefore,
  scratchDb,
  theFarm,
} from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// An Organisation's papers (ADR 0020): its own details and its Signatory where a person's NID and Nominees would be, the
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

const ORGANISATION = {
  kind: "organisation" as const,
  name: `যমুনা ডেইরি লিমিটেড ${suffix}`,
  phone: `0178${suffix}`,
  address: "বগুড়া",
  tradeLicence: `TRAD/BCC/${suffix}`,
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
const ORGANISATIONS_DATA = "তার স্বাক্ষরকারীর নাম, ফোন ও এনআইডি নম্বর";
const CONSENT_NOMINEES = "আমার নমিনি ও গ্রহণকারীর তথ্য রাখবে";
const CONSENT_AS_SIGNATORY = "প্রতিষ্ঠানের স্বাক্ষরকারী হিসেবে";

let monthly = "";
let organisationId = "";
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
  const organisation = await owner.investors.record(ORGANISATION);
  organisationId = organisation.id;
  const person = await owner.investors.record({
    name: `আব্দুল ${suffix}`,
    phone: `0177${suffix}`,
    nid: "1990000000001",
  });
  personId = person.id;
});

describe("an Organisation's Investment Agreement", () => {
  it("names the Organisation and its Signatory, and no Nominee", async () => {
    const owner = await asOwner();
    const document = await toSign(owner, organisationId);
    const [, them] = partiesOf(document);
    const said = Object.fromEntries(
      (them?.rows ?? []).map((row) => [row.label.en, row.value])
    );
    expect(said).toMatchObject({
      Name: ORGANISATION.name,
      "Trade licence": ORGANISATION.tradeLicence,
      "RJSC registration": ORGANISATION.rjscNumber,
      TIN: ORGANISATION.tin,
      Signatory: ORGANISATION.signatoryName,
      Role: ORGANISATION.signatoryRole,
      Phone: ORGANISATION.phone,
      "Signatory's NID": ORGANISATION.signatoryNid,
    });
    expect(said).not.toHaveProperty("NID");
    expect(them?.nominees).toEqual([]);
    expect(them?.lines).toEqual([]);
  });

  it("is signed by the Signatory, for and on behalf of the Organisation", async () => {
    const owner = await asOwner();
    const signers = signersOf(await toSign(owner, organisationId));
    expect(signers).toContainEqual({
      role: {
        bn: expect.stringContaining(`${ORGANISATION.name}-এর পক্ষে`),
        en: expect.stringContaining(
          `for and on behalf of ${ORGANISATION.name}`
        ),
      },
      name: `${ORGANISATION.signatoryName}, ${ORGANISATION.signatoryRole}`,
    });
  });

  it("says its share is its own, and nothing of a person's death or Nominees", async () => {
    const owner = await asOwner();
    const said = JSON.stringify(await toSign(owner, organisationId));
    expect(said).toContain(ITS_OWN);
    expect(said).toContain(ORGANISATIONS_DATA);
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
    expect(said).not.toContain(ORGANISATIONS_DATA);
  });
});

describe("an Organisation's Portal Consent", () => {
  it("is given by its Signatory for it, and holds no Nominee", async () => {
    const owner = await asOwner();
    const { document } = await owner.investors.consentSheet({
      id: organisationId,
    });
    expect(document.preamble.bn).toContain(
      `${ORGANISATION.signatoryName}, ${ORGANISATION.name}-এর পক্ষে`
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

/** Puts the farm back on an earlier standard wording of one kind, published by nobody, as a farm given it then holds
 *  it; then opens the wording page, which catches it up. The wording in force afterwards. */
const caughtUpFrom = async (
  kind: TemplateKind,
  content: typeof STANDARD_AGREEMENT_WITH_FARM_CAPITAL
) => {
  const owner = await asOwner();
  await owner.templates.list();
  const db = scratchDb();
  const template = await db.query.paperTemplate.findFirst({
    where: { farmId: theFarm().id, kind },
  });
  if (!template?.currentVersionId) {
    throw new Error("expected the farm's wording");
  }
  const { currentVersionId } = template;
  await asTheFarmHeldItBefore((tx) =>
    tx
      .update(paperTemplateVersion)
      .set({ content })
      .where(eq(paperTemplateVersion.id, currentVersionId))
  );
  await owner.templates.list();
  const caughtUp = await db.query.paperTemplate.findFirst({
    where: { id: template.id },
    with: { currentVersion: true },
  });
  return { before: currentVersionId, caughtUp };
};

describe("a farm on the standard wording before Organisations", () => {
  it("is caught up to the Agreement that carries an Organisation's lines", async () => {
    const { before, caughtUp } = await caughtUpFrom(
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
      "portal_consent",
      PORTAL_CONSENT_BEFORE_ORGANISATIONS
    );
    expect(caughtUp?.currentVersionId).not.toBe(before);
    expect(JSON.stringify(caughtUp?.currentVersion?.content)).toContain(
      CONSENT_AS_SIGNATORY
    );
  });
});
