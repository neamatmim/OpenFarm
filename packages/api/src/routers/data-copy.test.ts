import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

// «খামারে আপনার তথ্য»: one unmasked paper of everything the farm holds on one Investor, the privacy notice's points
// first, made by the Owner from the Investor's page to answer a written request for a copy. An Export, the Owner's
// alone, and never offered in the portal or the Preview.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2061-01-01T04:00:00.000Z";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "019", run: suffix }, JANUARY);

const KEEPERS = {
  dataHost: `হোস্ট ${suffix}`,
  backupStore: `ব্যাকআপ ${suffix}`,
  backupCountry: "জার্মানি",
};
const NID = `19853012${suffix}`;
const BANK = `সোনালী ব্যাংক, সাভার শাখা, হিসাব ০১২৩${suffix}`;

/**
 * An Investor with a history: in the portal, a Request made and changed and answered yes, an Agreement signed with its
 * capital in, papers made for them, and their record put right once. Their id, and the Venture's name.
 */
const withAHistory = async () => {
  const owner = await as("owner");
  const them = await invited("রাশেদ");
  const { people } = await owner.investors.list();
  const phone = people.find((one) => one.id === them.id)?.phone ?? "";
  await owner.investors.update({
    id: them.id,
    name: `রাশেদ ${suffix}`,
    phone,
    address: `আশুলিয়া ${suffix}`,
    nid: NID,
    bankAccount: BANK,
    nominee: { name: `রাশেদের ছেলে ${suffix}`, relation: "ছেলে" },
  });
  const venture = await owner.ventures.open({
    name: `তথ্যের ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 500_000,
    floorBdt: 50_000,
    decideBy: "2061-01-20",
    targetWindowStart: "2061-06-01",
    targetWindowEnd: "2061-06-10",
    unitPriceBdt: 50_000,
    units: 10,
    cattleBudgetBdt: 400_000,
  });
  await owner.ventures.showInPortal({ id: venture.id, words: "" });
  const { id: requestId } = await them.client.portal.requestToJoin({
    ventureId: venture.id,
    units: 2,
    note: "",
  });
  await them.client.portal.requestToJoin({
    ventureId: venture.id,
    units: 3,
    note: "তিনটি",
  });
  await owner.ventures.answerRequest({
    requestId,
    answer: { kind: "come_and_sign", units: 3 },
  });
  const agreement = await owner.ventures.sign({
    ventureId: venture.id,
    investorId: them.id,
    units: 3,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2061-01-02",
    stampSerial: `S-${suffix}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 150_000,
    movedOn: "2061-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.investors.consentSheet({ id: them.id });
  return { id: them.id, ventureName: `তথ্যের ভেঞ্চার ${suffix}` };
};

/** The one Investor with a history these tests read, made once: building it is most of the file's time. */
let history: Awaited<ReturnType<typeof withAHistory>>;

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000095",
    registrationNumber: `DLS/SAV/2061/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2063-03-31",
  });
  await owner.farm.setDataKeepers(KEEPERS);
  await owner.investors.setPortalOpen({ open: true });
  history = await withAHistory();
});

describe("«খামারে আপনার তথ্য»", () => {
  it("holds the notice's points first, then everything the farm holds on them, unmasked", async () => {
    const owner = await as("owner");
    const { id, ventureName } = history;

    const { document } = await owner.investors.copyOfTheirData({ id });

    const { notice } = await owner.portalPreview.yourData();
    const headings = document.sections.map((one) => one.heading.bn);
    // The notice's points, in its own order, before anything of theirs.
    expect(headings.slice(0, notice?.parts.length)).toEqual(
      notice?.parts.map((part) => part.heading)
    );
    // Each part of theirs, read on its own.
    const part = (heading: string) =>
      JSON.stringify(
        document.sections.find((one) => one.heading.bn === heading)
      );
    // The record, unmasked: the whole NID and bank account, never the last digits alone.
    const record = part("আপনার রেকর্ড");
    expect(record).toContain(NID);
    expect(record).toContain(BANK);
    expect(record).toContain(`রাশেদের ছেলে ${suffix}`);
    // Their Agreement, and the money it moved.
    expect(part("আপনার চুক্তি")).toContain(`S-${suffix}`);
    expect(part("আপনার টাকার লেনদেন")).toContain(`TRF-${suffix}`);
    expect(part("আপনার টাকার লেনদেন")).toContain(ventureName);
    // The papers made for them.
    expect(part("আপনার জন্য তৈরি কাগজ")).toContain("পোর্টাল সম্মতিপত্র");
    // Their Request, and each change they made to it.
    const requests = part("ভেঞ্চারে যোগ দেওয়ার অনুরোধ");
    expect(requests).toContain("তিনটি");
    expect(requests).toContain("বদলানো হয়েছে");
    // Their portal access, and the consent they signed.
    const portal = part("পোর্টাল");
    expect(portal).toContain("প্রথম সাইন ইন");
    expect(portal).toContain("বহাল");
    // The change to their record, what it was and what it became.
    const changes = part("আপনার রেকর্ডে প্রতিটি বদল");
    expect(changes).toContain(`আশুলিয়া ${suffix}`);
    expect(changes).toContain(`রাশেদের ছেলে ${suffix}`);
  });

  it("is an Export on the Investor, by the Owner", async () => {
    const owner = await as("owner");
    const { id } = history;

    await owner.investors.copyOfTheirData({ id });

    const trail = await owner.audit.list({ entity: "investor", limit: 50 });
    const made = trail.find(
      (one) =>
        one.entityId === id &&
        one.action === "export" &&
        (one.after as { paper?: string } | null)?.paper === "data_copy"
    );
    expect(made).toMatchObject({
      actorId: thePerson("owner").id,
      after: expect.objectContaining({ investorId: id }),
    });
  });

  it("is the Owner's alone", async () => {
    const owner = await as("owner");
    const manager = await as("manager");
    const them = await owner.investors.record({
      name: `কামরুল ${suffix}`,
      phone: `0195${suffix}1`,
    });

    await expect(
      manager.investors.copyOfTheirData({ id: them.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is never offered in the portal or its Preview", () => {
    expect(Object.keys(appRouter.portal)).not.toContain("copyOfTheirData");
    expect(Object.keys(appRouter.portalPreview)).not.toContain(
      "copyOfTheirData"
    );
  });
});
