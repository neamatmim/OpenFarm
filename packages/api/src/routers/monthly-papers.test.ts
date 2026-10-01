import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import { STANDARD_AGREEMENT_BEFORE_MONTHLY } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The clauses the lawyer and the Shariah scholar approved on 2026-10-02 for capital paid by the month, on the papers of
// such a Venture and on no other: the Agreement to sign and its copy, the joining letter and the progress statement. And
// a farm still on exactly the standard wording it was given, caught up to the standard that carries them.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2077-01-05T04:00:00.000Z";

const asOwner = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};
type Owner = Awaited<ReturnType<typeof asOwner>>;

const TERMS = {
  targetCapitalBdt: 1_000_000,
  floorBdt: 0,
  decideBy: "2077-01-20",
  targetWindowStart: "2077-06-01",
  targetWindowEnd: "2077-06-10",
  unitPriceBdt: 50_000,
  units: 20,
  cattleBudgetBdt: 800_000,
};

const M1 = "বিনিয়োগকারী তাঁর মূলধন দুই ভাগে দেবেন";
const M5 = "খামার কোনো জরিমানা, চার্জ বা অতিরিক্ত টাকা নেবে না";
const M8 = "মাসের টাকা বাকি থাকা অবস্থায় বিনিয়োগকারীর মৃত্যু হলে";

let monthly = "";
let upFront = "";
let investorId = "";
let agreementId = "";

const toSign = async (owner: Owner, ventureId: string) =>
  await owner.investorStatements.agreementToSign({
    ventureId,
    investorId,
    units: 4,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
  });

beforeAll(async () => {
  const setUp = await asOwner();
  await setUp.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000095",
    registrationNumber: `DLS/SAV/2077/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2079-03-31",
  });
  const owner = await asOwner();
  const byTheMonth = await owner.ventures.open({
    name: `মাসে মাসে ${suffix}`,
    ...TERMS,
    capitalPaid: "by_the_month",
  });
  monthly = byTheMonth.id;
  const beforeBuying = await owner.ventures.open({
    name: `একবারে ${suffix}`,
    ...TERMS,
  });
  upFront = beforeBuying.id;
  const him = await owner.investors.record({
    name: `আব্দুল ${suffix}`,
    phone: `0179${suffix}`,
  });
  investorId = him.id;
});

describe("the Agreement to sign", () => {
  it("on a Venture paid by the month, carries its Cattle Part, its schedule and the approved clauses", async () => {
    const owner = await asOwner();

    const { document } = await toSign(owner, monthly);

    const said = JSON.stringify(document);
    expect(said).toContain("৪০,০০০ টাকা, কেনা শুরুর আগে");
    expect(said).toContain(
      "২,৫০০ টাকা, ১০ ফেব্রুয়ারি, ২০৭৭ থেকে ১০ মে, ২০৭৭ পর্যন্ত প্রতি মাসের ১০ তারিখে (৪ মাস)"
    );
    expect(said).toContain(M1);
    expect(said).toContain(M5);
    expect(said).toContain(M8);
  });

  it("on a Venture paid before buying, says none of it", async () => {
    const owner = await asOwner();

    const { document } = await toSign(owner, upFront);

    const said = JSON.stringify(document);
    expect(said).not.toContain("গরু কেনার অংশ");
    expect(said).not.toContain(M1);
    expect(said).not.toContain(M8);
  });
});

describe("a signed Agreement paid by the month", () => {
  beforeAll(async () => {
    const owner = await asOwner();
    const signed = await owner.ventures.sign({
      ventureId: monthly,
      investorId,
      units: 4,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
      stampValueBdt: 300,
      stampedOn: "2077-01-04",
      stampSerial: `MP ${suffix}`,
    });
    agreementId = signed.id;
    await owner.ventures.keepAgreementPaper({
      agreementId,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.ventures.takeCapital({
      agreementId,
      amountBdt: 160_000,
      movedOn: "2077-01-05",
      paymentMethod: "bank",
      reference: `TRF-${suffix}`,
    });
  });

  it("prints its copy with the clauses it was signed with", async () => {
    const owner = await asOwner();

    const { document } = await owner.investorStatements.agreementCopy({
      agreementId,
    });

    expect(JSON.stringify(document)).toContain(M1);
  });

  it("lists his Units' Monthly Sums on the joining letter, and what the letter acknowledges", async () => {
    const owner = await asOwner();

    const { text } = await owner.investorStatements.joining({ agreementId });

    expect(text).toContain("মাসের টাকার তালিকা / Monthly Sums");
    // Four Units' 2,500.
    expect(text).toContain("১০ ফেব্রুয়ারি, ২০৭৭ · ১০,০০০ টাকা");
    expect(text).toContain("এই পত্র গরু কেনার অংশ প্রাপ্তির স্বীকৃতি");
    expect(text).toContain(M1);
  });

  it("says on the progress statement how many months are paid and the next", async () => {
    const owner = await asOwner();
    await owner.ventures.startBuying({ id: monthly });

    const { text } = await owner.investorStatements.progress({ agreementId });

    expect(text).toContain(
      "মাসের টাকা / Monthly Sums: ৪ মাসের ০টি দেওয়া · পরেরটি ১০ ফেব্রুয়ারি, ২০৭৭, ১০,০০০ টাকা"
    );
  });
});

describe("a farm on the standard wording it was given", () => {
  it("is caught up to the standard that carries the clauses, and a wording the Owner published herself is not", async () => {
    const owner = await asOwner();
    await owner.templates.list();
    const db = scratchDb();
    const template = await db.query.paperTemplate.findFirst({
      where: { farmId: theFarm().id, kind: "investment_agreement" },
    });
    if (!template?.currentVersionId) {
      throw new Error("expected the farm's Agreement wording");
    }
    // As a farm given its wording before 2026-10-02 holds it: the standard of then, published by nobody.
    await db
      .update(paperTemplateVersion)
      .set({ content: STANDARD_AGREEMENT_BEFORE_MONTHLY })
      .where(eq(paperTemplateVersion.id, template.currentVersionId));

    await owner.templates.list();

    const caughtUp = await db.query.paperTemplate.findFirst({
      where: { id: template.id },
      with: { currentVersion: true },
    });
    expect(caughtUp?.currentVersionId).not.toBe(template.currentVersionId);
    expect(JSON.stringify(caughtUp?.currentVersion?.content)).toContain(M1);
    expect(caughtUp?.currentVersion?.note).toContain("2026-10-02");

    // The Owner publishes the old words herself: hers, and kept.
    const mine = await owner.templates.publish({
      kind: "investment_agreement",
      content: STANDARD_AGREEMENT_BEFORE_MONTHLY,
      note: "my own choice",
    });
    await owner.templates.list();
    const kept = await db.query.paperTemplate.findFirst({
      where: { id: template.id },
      columns: { currentVersionId: true },
    });
    expect(kept?.currentVersionId).toBe(mine.versionId);
  });
});
