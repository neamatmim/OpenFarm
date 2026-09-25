import { eq } from "@OpenFarm/db/operators";
import {
  TEMPLATE_KINDS as COLUMN_KINDS,
  paperTemplate,
} from "@OpenFarm/db/schema/paper-template";
import { investmentAgreement } from "@OpenFarm/db/schema/venture";
import type { TemplateContent } from "@OpenFarm/domain";
import {
  FIRST_PRINTED_AGREEMENT,
  STANDARD_TEMPLATES,
  TEMPLATE_KINDS,
} from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The wording of the papers an Investor signs, kept as the farm's own data: given as OpenFarm's standard wording,
// changed by the Owner one Version at a time, and approved by a lawyer on the Version itself. What a man signed stays
// the wording he signed in, whatever the farm prints afterwards.

const suffix = `wording-${Date.now()}`;
const JANUARY = "2052-01-01T04:00:00.000Z";

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(JANUARY) });

let ventureId = "";
const investorIds: string[] = [];

/** Signs one Investor for the Venture on stamp paper, keeps the paper, and takes his capital. */
const signAndPay = async (investorId: string, serial: string) => {
  const { client: owner } = await as("owner");
  const signed = await owner.ventures.sign({
    ventureId,
    investorId,
    units: 2,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2052-01-02",
    stampSerial: serial,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: signed.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: signed.id,
    amountBdt: 100_000,
    movedOn: "2052-01-03",
    paymentMethod: "bank",
    reference: `TRF-${serial}`,
  });
  return signed.id;
};

beforeAll(async () => {
  const { client: owner } = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2052/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2054-03-31",
  });
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2052-01-20",
    targetWindowStart: "2052-03-17",
    targetWindowEnd: "2052-03-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
  for (const [index, name] of ["রহিম", "সালমা"].entries()) {
    // Sequential: one Investor at a time, each on his own phone.
    // oxlint-disable-next-line no-await-in-loop
    const him = await owner.investors.record({
      name: `${name} ${suffix}`,
      phone: `0197700004${index}`,
      address: `সাভার ${index}`,
      nid: `123456789${index}`,
      bankAccount: `01234567${index}`,
    });
    investorIds.push(him.id);
  }
});

/** The farm's wording for one kind of paper, as the list gives it. */
const wordingOf = async (kind: (typeof TEMPLATE_KINDS)[number]) => {
  const { client: owner } = await as("owner");
  const listed = await owner.templates.list();
  const found = listed.find((one) => one.kind === kind);
  if (!found) {
    throw new Error(`the farm has no wording for ${kind}`);
  }
  return found;
};

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

describe("the farm's wording", () => {
  it("starts as the standard wording, Version 1 of every kind, approved by nobody", async () => {
    const { client: owner } = await as("owner");
    const listed = await owner.templates.list();

    expect(listed.map((one) => one.kind)).toEqual([...TEMPLATE_KINDS]);
    for (const one of listed) {
      expect(one.current.number).toBe(1);
      expect(one.current.content).toEqual(STANDARD_TEMPLATES[one.kind]);
      expect(one.current.reviewedOn).toBeNull();
    }
  });

  it("is the Owner's alone", async () => {
    const { client: manager } = await as("manager");

    await expect(manager.templates.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("records an Agreement signed before the farm had wording against the words it was printed in, and prints the standard from then", async () => {
    const agreementId = await signAndPay(investorIds[0] ?? "", `S1-${suffix}`);
    // As an Agreement signed before its wording could be edited stands: no Version, and the farm given none.
    await scratchDb()
      .update(investmentAgreement)
      .set({ templateVersionId: null })
      .where(eq(investmentAgreement.id, agreementId));
    await scratchDb()
      .delete(paperTemplate)
      .where(eq(paperTemplate.farmId, theFarm().id));

    const given = await wordingOf("investment_agreement");
    const pinned = await scratchDb().query.investmentAgreement.findFirst({
      where: { id: agreementId },
      columns: { templateVersionId: true },
    });
    const [standard, firstPrinted] = given.versions;

    expect(given.versions.map((one) => one.number)).toEqual([2, 1]);
    expect(pinned?.templateVersionId).toBe(firstPrinted?.versionId);
    expect(firstPrinted?.content).toEqual(FIRST_PRINTED_AGREEMENT);
    expect(given.current.versionId).toBe(standard?.versionId);
    expect(given.current.content).toEqual(
      STANDARD_TEMPLATES.investment_agreement
    );
  });
});

describe("changing the wording", () => {
  it("publishes the next Version, which papers are printed in from then, while a signed Agreement keeps its own", async () => {
    const { client: owner } = await as("owner");
    const [signedBefore] = await owner.ventures.agreements({ ventureId });
    if (!signedBefore) {
      throw new Error("expected the Agreement signed above");
    }
    const NEW_CLAUSE = `মুনাফা ভাগ: বিনিয়োগকারী {investorsPercent}% (${suffix})`;
    const before = await wordingOf("investment_agreement");

    const published = await owner.templates.publish({
      kind: "investment_agreement",
      content: withSecondClause(NEW_CLAUSE),
      note: "the lawyer's wording for the split",
    });
    const { document, wording } =
      await owner.investorStatements.agreementToSign({
        ventureId,
        investorId: investorIds[1] ?? "",
        units: 2,
        investorsPercent: 60,
        arbitrator: `সালিস ${suffix}`,
      });
    const { text } = await owner.investorStatements.joining({
      agreementId: signedBefore.id,
    });

    expect(published.number).toBe(before.current.number + 1);
    expect(wording.number).toBe(published.number);
    expect(JSON.stringify(document)).toContain(
      `মুনাফা ভাগ: বিনিয়োগকারী ৬০% (${suffix})`
    );
    // His letter repeats what he signed, not what the farm prints now.
    expect(text).toContain("মুনাফা ভাগ হবে বিনিয়োগকারী ৬০% এবং খামার ৪০%");
    expect(text).not.toContain(`(${suffix})`);
  });

  it("keeps the lines under the nominee as they were written", async () => {
    const { client: owner } = await as("owner");
    const [parties, ...rest] = STANDARD_TEMPLATES.investment_agreement.sections;
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties first");
    }
    const lines = [{ bn: `নমিনি ${suffix}`, en: `Nominee ${suffix}` }];

    await owner.templates.publish({
      kind: "investment_agreement",
      content: {
        ...STANDARD_TEMPLATES.investment_agreement,
        sections: [{ ...parties, nomineeLines: lines }, ...rest],
      },
    });
    const { current } = await wordingOf("investment_agreement");

    expect(current.content.sections[0]).toMatchObject({ nomineeLines: lines });
  });

  it("is refused while the wording asks for a fact the paper does not have, and says where", async () => {
    const { client: owner } = await as("owner");

    await expect(
      owner.templates.publish({
        kind: "investment_agreement",
        content: withSecondClause("প্রতি কেজি {pricePerKg} টাকা"),
      })
    ).rejects.toMatchObject({
      data: {
        refusal: "template_problems",
        problems: [{ code: "unknown_field", at: 3, about: "pricePerKg" }],
      },
    });
  });
});

describe("a preview", () => {
  it("lays out wording not yet published, with the farm's own facts and each of the paper's named where it goes", async () => {
    const { client: owner } = await as("owner");
    const writing = withSecondClause(`নতুন শর্ত {investorsPercent}% ${suffix}`);

    const { document } = await owner.templates.preview({
      kind: "investment_agreement",
      content: writing,
    });

    const said = JSON.stringify(document);
    expect(said).toContain(`নতুন শর্ত [বিনিয়োগকারীর ভাগ %]% ${suffix}`);
    expect(said).toContain("[বিনিয়োগকারীর নাম]");
    expect(said).toContain(`DLS/SAV/2052/${suffix}`);
  });
});

describe("a lawyer's approval", () => {
  it("is written on one Version once, never on a day to come, and not carried to the next", async () => {
    const { client: owner } = await as("owner");
    const { current } = await wordingOf("master_agreement");

    await expect(
      owner.templates.recordReview({
        versionId: current.versionId,
        reviewedBy: "অ্যাডভোকেট রহমান",
        reviewedOn: "2052-02-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "reviewed_in_the_future" } });
    await owner.templates.recordReview({
      versionId: current.versionId,
      reviewedBy: "অ্যাডভোকেট রহমান",
      reviewedOn: "2051-12-30",
    });
    await expect(
      owner.templates.recordReview({
        versionId: current.versionId,
        reviewedBy: "অন্য কেউ",
        reviewedOn: "2051-12-31",
      })
    ).rejects.toMatchObject({ data: { refusal: "already_reviewed" } });

    const approved = await wordingOf("master_agreement");
    expect(approved.current.reviewedBy).toBe("অ্যাডভোকেট রহমান");

    await owner.templates.publish({
      kind: "master_agreement",
      content: STANDARD_TEMPLATES.master_agreement,
    });
    const next = await wordingOf("master_agreement");
    expect(next.current.number).toBe(2);
    expect(next.current.reviewedOn).toBeNull();
  });
});

describe("the Amendment", () => {
  it("is one paper naming every Investor on the Venture, and is recorded in the wording it was printed in", async () => {
    const agreementId = await signAndPay(investorIds[1] ?? "", `S2-${suffix}`);
    const signedIn = await scratchDb().query.investmentAgreement.findFirst({
      where: { id: agreementId },
      columns: { templateVersionId: true },
    });
    // Signed after the wording changed, and recorded against the wording it was signed in.
    const inForce = await wordingOf("investment_agreement");
    expect(signedIn?.templateVersionId).toBe(inForce.current.versionId);
    const { client: owner } = await as("owner");
    const amending = {
      ventureId,
      investorsPercent: 55,
      targetWindowStart: "2052-03-20",
      targetWindowEnd: "2052-03-24",
      signedOn: "2052-01-01",
      reason: `ঈদ পিছিয়েছে ${suffix}`,
    };

    const { document } =
      await owner.investorStatements.amendmentToSign(amending);
    const amended = await owner.ventures.amend({
      ...amending,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });

    const said = JSON.stringify(document);
    expect(said).toContain(`রহিম ${suffix}`);
    expect(said).toContain(`সালমা ${suffix}`);
    expect(said).toContain("বিনিয়োগকারী ৫৫% এবং খামার ৪৫%");
    const { current } = await wordingOf("agreement_amendment");
    const rows = await scratchDb().query.agreementAmendment.findMany({
      where: { amendedId: amended.id },
      columns: { templateVersionId: true },
    });
    expect(rows.map((one) => one.templateVersionId)).toEqual([
      current.versionId,
      current.versionId,
    ]);
  });
});

describe("the kinds of paper", () => {
  it("are the same list in the database as in the domain", () => {
    expect([...TEMPLATE_KINDS]).toEqual([...COLUMN_KINDS]);
  });
});

describe("the facts the privacy notice names", () => {
  it("are the Owner's alone to set, and each change is in the trail", async () => {
    const { client: owner } = await as("owner");
    const { client: manager } = await as("manager");
    const keepers = {
      dataHost: `হোস্ট ${suffix}`,
      backupStore: `ব্যাকআপ ${suffix}`,
      backupCountry: "জার্মানি",
    };

    await expect(manager.farm.setDataKeepers(keepers)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await owner.farm.setDataKeepers(keepers);

    expect(await owner.farm.dataKeepers()).toEqual(keepers);
    // Found by what it says, not by being the latest: the farm's other changes share this test's instant.
    const trail = await owner.audit.list({ entity: "farm", limit: 20 });
    expect(trail).toContainEqual(
      expect.objectContaining({
        action: "update",
        after: expect.objectContaining({ dataHost: keepers.dataHost }),
      })
    );
  });

  it("are named as missing when a notice is previewed before they are set, and not once they are", async () => {
    const { client: owner } = await as("owner");
    const notice = STANDARD_TEMPLATES.privacy_notice;
    await owner.farm.setDataKeepers({
      dataHost: null,
      backupStore: null,
      backupCountry: null,
    });

    const before = await owner.templates.preview({
      kind: "privacy_notice",
      content: notice,
    });
    expect(before.missing).toEqual([
      "dataHost",
      "backupStore",
      "backupCountry",
    ]);

    await owner.farm.setDataKeepers({
      dataHost: `হোস্ট ${suffix}`,
      backupStore: `ব্যাকআপ ${suffix}`,
      backupCountry: "জার্মানি",
    });
    const after = await owner.templates.preview({
      kind: "privacy_notice",
      content: notice,
    });
    expect(after.missing).toEqual([]);
    expect(JSON.stringify(after.document)).toContain(`হোস্ট ${suffix}`);
    // A notice closes on no promise about money: it is not a paper about money.
    expect(after.document.closing).toEqual([]);
  });

  it("never counts the Investor's own facts as missing on a consent previewed for nobody in particular", async () => {
    const { client: owner } = await as("owner");

    const { missing } = await owner.templates.preview({
      kind: "portal_consent",
      content: STANDARD_TEMPLATES.portal_consent,
    });

    expect(missing).toEqual([]);
  });
});
