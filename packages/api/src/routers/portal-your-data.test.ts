import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// «আপনার তথ্য», the privacy notice, as a page of the portal: open to anybody while the portal is, signed in or not,
// in the wording the farm prints it in now and with the farm's own facts in it — and never with a blank where one of
// those facts has not been written down.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2057-01-01T04:00:00.000Z";
const clock = () => new FakeClock(JANUARY);

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: clock(),
  });
  return client;
};

const asNobody = async () => {
  const { client } = await createTestClient(appRouter, {
    as: null,
    clock: clock(),
  });
  return client;
};

/** A fact of the paper named in square brackets, as `[খামারের নাম]`: what a preview shows, and a reader never sees. */
const NAMED_FIELD = /\[[^\]"]+\]/u;

const KEEPERS = {
  dataHost: `হোস্ট ${suffix}`,
  backupStore: `ব্যাকআপ ${suffix}`,
  backupCountry: "জার্মানি",
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000098",
    registrationNumber: `DLS/SAV/2057/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2059-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("«আপনার তথ্য» in the portal", () => {
  // First in the file: the farm has been given no wording yet, and a stranger's read must not give it any.
  it("is read in the standard wording by a farm not given its own, and writes nothing", async () => {
    const owner = await asOwner();
    await owner.farm.setDataKeepers(KEEPERS);
    const nobody = await asNobody();

    const { notice } = await nobody.portal.yourData();

    expect(notice?.title).toBe("আপনার তথ্য খামার কীভাবে রাখে");
    expect(
      await owner.audit.list({ entity: "paper_template", limit: 5 })
    ).toEqual([]);
  });

  it("is read by anybody, signed in or not, with the farm's own facts in it and no blank", async () => {
    const owner = await asOwner();
    await owner.farm.setDataKeepers(KEEPERS);
    const nobody = await asNobody();

    const { notice } = await nobody.portal.yourData();

    expect(notice?.title).toBe("আপনার তথ্য খামার কীভাবে রাখে");
    const said = JSON.stringify(notice);
    expect(said).toContain(KEEPERS.dataHost);
    expect(said).toContain(`সাভার, ঢাকা ${suffix}`);
    expect(said).not.toContain("____");
    // A field named in square brackets, as a preview for the Owner shows one: never here.
    expect(said).not.toMatch(NAMED_FIELD);
  });

  it("is not shown while a fact of the farm's is still unwritten — never a blank in its place", async () => {
    const owner = await asOwner();
    await owner.farm.setDataKeepers({ ...KEEPERS, backupCountry: null });
    const nobody = await asNobody();

    try {
      const answer = await nobody.portal.yourData();

      expect(answer.notice).toBeNull();
      // Whom to ask instead, by name, whatever is missing.
      expect(answer.farm.name.length).toBeGreaterThan(0);
    } finally {
      await owner.farm.setDataKeepers(KEEPERS);
    }
  });

  it("says what the Version in force says: a new one published is the one read", async () => {
    const owner = await asOwner();
    await owner.farm.setDataKeepers(KEEPERS);
    const templates = await owner.templates.list();
    const notice = templates.find((one) => one.kind === "privacy_notice");
    if (!notice) {
      throw new Error("expected the notice's wording");
    }
    const { content } = notice.current;
    await owner.templates.publish({
      kind: "privacy_notice",
      content: {
        ...content,
        preamble: { bn: `নতুন কথা ${suffix}`, en: "" },
      },
    });
    const nobody = await asNobody();

    const { notice: read } = await nobody.portal.yourData();

    expect(read?.preamble).toBe(`নতুন কথা ${suffix}`);
  });

  it("is closed with the portal, and read by the Owner in the Preview all the same", async () => {
    const owner = await asOwner();
    await owner.investors.setPortalOpen({ open: false });
    const nobody = await asNobody();

    try {
      await expect(nobody.portal.yourData()).rejects.toMatchObject({
        data: { refusal: "portal_closed" },
      });
      const { notice } = await owner.portalPreview.yourData();
      expect(notice?.title).toBe("আপনার তথ্য খামার কীভাবে রাখে");
    } finally {
      await owner.investors.setPortalOpen({ open: true });
    }
  });
});
