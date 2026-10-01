import type { TemplateContent } from "@OpenFarm/domain";
import { STANDARD_TEMPLATES } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { theWhole } from "../test/nominations";
import { appRouter } from "./index";

// An Investment Agreement already signed, printed again whenever it is needed: as it was signed, in the wording it was
// signed in, naming the Nominees it named — and marked as a copy, so it is never signed as a second original. And the
// photo of the stamped paper itself, to look at again.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2066-01-10T04:00:00.000Z";

const as = async (role: "owner" | "manager", at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

const HIM = `আব্দুর রহিম ${suffix}`;
const ARBITRATOR = `মাওলানা সালিস ${suffix}`;
const SERIAL = `ST-${suffix}`;
const WIFE = { ...theWhole(`স্ত্রী ${suffix}`), bornOn: "1980-01-01" };
const SON = { ...theWhole(`ছেলে ${suffix}`, "ছেলে"), bornOn: "2000-01-01" };

/** The standard Investment Agreement with the second of its terms said differently. */
const withSecondClause = (bn: string): TemplateContent => ({
  ...STANDARD_TEMPLATES.investment_agreement,
  sections: STANDARD_TEMPLATES.investment_agreement.sections.map((section) =>
    section.kind === "clauses" && section.heading.en === "Terms"
      ? {
          ...section,
          clauses: section.clauses.map((clause, index) =>
            index === 1 ? { bn, en: "" } : clause
          ),
        }
      : section
  ),
});

let agreementId = "";
let investorId = "";
let signedIn = 0;

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000093",
    registrationNumber: `DLS/SAV/2066/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2068-03-31",
  });
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2066-01-20",
    targetWindowStart: "2066-03-17",
    targetWindowEnd: "2066-03-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  const him = await owner.investors.record({
    name: HIM,
    phone: `0187${suffix}`,
  });
  investorId = him.id;
  const signed = await owner.ventures.sign({
    ventureId: venture.id,
    investorId,
    units: 3,
    investorsPercent: 60,
    arbitrator: ARBITRATOR,
    stampValueBdt: 300,
    stampedOn: "2066-01-10",
    stampSerial: SERIAL,
    nominees: [{ ...WIFE, sharePercent: 100 }],
  });
  agreementId = signed.id;
  const listed = await owner.templates.list();
  signedIn =
    listed.find((one) => one.kind === "investment_agreement")?.current.number ??
    0;
});

describe("a copy of a signed Agreement", () => {
  it("is laid out as it was signed and marked, as a copy of its stamped paper, not the original", async () => {
    const owner = await as("owner");

    const { document } = await owner.investorStatements.agreementCopy({
      agreementId,
    });

    const said = JSON.stringify(document);
    expect(said).toContain(HIM);
    expect(said).toContain(ARBITRATOR);
    expect(said).toContain("বিনিয়োগকারী ৬০% এবং খামার ৪০%");
    // Three Units at fifty thousand.
    expect(said).toContain("১,৫০,০০০ টাকা");
    expect(document.copyOf).toContain("অনুলিপি");
    expect(document.copyOf).toContain("COPY");
    expect(document.copyOf).toContain(SERIAL);
    // The stamp it was signed on, written into the blanks the paper to sign left empty.
    const stamp = document.sections.find((section) => section.kind === "stamp");
    expect(stamp?.kind === "stamp" ? stamp.filled : null).toEqual([
      SERIAL,
      "৩০০ টাকা",
      "১০ জানুয়ারি, ২০৬৬",
    ]);
  });

  it("stays in the wording it was signed in after the farm publishes new wording", async () => {
    const owner = await as("owner");
    const NEW_CLAUSE = `নতুন শব্দে মুনাফা ভাগ (${suffix})`;
    await owner.templates.publish({
      kind: "investment_agreement",
      content: withSecondClause(NEW_CLAUSE),
      note: "new wording after the signing",
    });

    const { document, wording } = await owner.investorStatements.agreementCopy({
      agreementId,
    });

    expect(wording.number).toBe(signedIn);
    expect(JSON.stringify(document)).not.toContain(NEW_CLAUSE);
    expect(document.produced).toContain(`Version ${signedIn}`);
  });

  it("names the Nominees the Agreement named, not those of a later Nomination", async () => {
    const owner = await as("owner");
    // Two days later, a মনোনয়নপত্র of his own naming somebody else.
    const later = await as("owner", "2066-01-12T04:00:00.000Z");
    await later.investors.recordNomination({
      id: investorId,
      nominees: [{ ...SON, sharePercent: 100 }],
      signedOn: "2066-01-12",
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });

    const { document } = await owner.investorStatements.agreementCopy({
      agreementId,
    });

    const said = JSON.stringify(document);
    expect(said).toContain(WIFE.name);
    expect(said).not.toContain(SON.name);
  });

  it("records the Export against the Agreement", async () => {
    const owner = await as("owner");
    await owner.investorStatements.agreementCopy({ agreementId });

    const trail = await owner.audit.list({
      entity: "investment_agreement",
      entityId: agreementId,
    });

    const sent = trail.find((event) => event.action === "export");
    expect(sent?.after).toMatchObject({ paper: "agreement_copy", investorId });
    expect(sent?.after).toHaveProperty("registrationNumber");
  });

  it("is the Owner's alone, and refused for an Agreement this farm does not hold", async () => {
    const manager = await as("manager");
    const owner = await as("owner");

    await expect(
      manager.investorStatements.agreementCopy({ agreementId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.investorStatements.agreementCopy({ agreementId: "no-such" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("the photo of a signed Agreement's stamped paper", () => {
  it("is nothing before it is kept, and the kept photo after", async () => {
    const owner = await as("owner");

    await expect(
      owner.ventures.agreementPaper({ agreementId })
    ).resolves.toBeNull();
    await owner.ventures.keepAgreementPaper({
      agreementId,
      contentType: "image/jpeg",
      data: "c3RhbXBlZA==",
    });

    await expect(
      owner.ventures.agreementPaper({ agreementId })
    ).resolves.toMatchObject({
      contentType: "image/jpeg",
      data: "c3RhbXBlZA==",
    });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager");

    await expect(
      manager.ventures.agreementPaper({ agreementId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
