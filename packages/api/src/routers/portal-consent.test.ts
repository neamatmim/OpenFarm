import { inspect } from "node:util";

import { portalConsent } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// The Portal Consent (the glossary's entry): signed on paper in front of the Owner before any code is given, and
// recorded with the day, the wording signed and who recorded it. No code exists for an Investor who has not signed one.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2058-01-01T04:00:00.000Z";
const clock = () => new FakeClock(JANUARY);

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: clock(),
  });
  return client;
};

/** Somebody on file, never invited. */
const recorded = async (name: string, phone: string) => {
  const owner = await as("owner");
  const them = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  return them.id;
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000099",
    registrationNumber: `DLS/SAV/2058/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2060-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("a Portal Consent", () => {
  it("comes before any code: no code is given to somebody who has not signed one", async () => {
    const owner = await as("owner");
    const id = await recorded("রহিম", `0178${suffix}1`);

    await expect(owner.investors.inviteToPortal({ id })).rejects.toMatchObject({
      data: { refusal: "no_consent" },
    });
  });

  it("is recorded with the day and the wording signed, and its trail names the Version and never a code", async () => {
    const owner = await as("owner");
    const id = await recorded("সালমা", `0178${suffix}2`);

    const consent = await owner.investors.recordConsent({ id });
    await owner.investors.inviteToPortal({ id });

    expect(consent).toMatchObject({ version: 1, signedOn: "2058-01-01" });
    const trail = await owner.audit.list({
      entity: "portal_consent",
      limit: 20,
    });
    const made = trail.find((one) => one.entityId === id);
    expect(made).toMatchObject({
      action: "create",
      actorId: thePerson("owner").id,
      // Nothing was in force before it.
      before: null,
      after: expect.objectContaining({
        version: 1,
        versionId: consent.versionId,
        signedOn: "2058-01-01",
      }),
    });
    // Read as the console would show it, before and after alike: no code in it anywhere.
    expect(inspect(made, { depth: null })).not.toMatch(/code/iu);
    const listed = await owner.investors.list();
    expect(
      listed.people.find((one) => one.id === id)?.portalConsent
    ).toMatchObject({ version: 1 });
  });

  it("in force is not recorded again", async () => {
    const owner = await as("owner");
    const id = await recorded("করিম", `0178${suffix}3`);
    await owner.investors.recordConsent({ id });

    await expect(owner.investors.recordConsent({ id })).rejects.toMatchObject({
      data: { refusal: "consent_in_force" },
    });
  });

  it("is the Owner's alone to record and to print", async () => {
    const manager = await as("manager");
    const id = await recorded("জামাল", `0178${suffix}4`);

    await expect(manager.investors.recordConsent({ id })).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    await expect(manager.investors.consentSheet({ id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("is asked of an Investor whose access came before consent did, before their next code", async () => {
    const owner = await as("owner");
    const id = await recorded("কামাল", `0178${suffix}6`);
    await invitedWithConsent(owner, id);
    // An access made before consent existed: it has none on file.
    await scratchDb()
      .delete(portalConsent)
      .where(eq(portalConsent.investorId, id));

    await expect(owner.investors.inviteToPortal({ id })).rejects.toMatchObject({
      data: { refusal: "no_consent" },
    });
  });

  it("is never kept for somebody who could not then be given a code", async () => {
    const owner = await as("owner");
    const id = await recorded("শফিক", "01819123456");
    await invitedWithConsent(owner, id);
    // A second Investor written down on the same phone cannot have the portal, so signs no consent for it.
    const twin = await owner.investors.record({
      name: `শফিকের ভাই ${suffix}`,
      phone: "01819123456",
      address: "সাভার",
      nid: "9876543210",
      bankAccount: "0987654321",
    });

    await expect(
      owner.investors.recordConsent({ id: twin.id })
    ).rejects.toMatchObject({ data: { refusal: "phone_has_portal" } });
    const listed = await owner.investors.list();
    expect(
      listed.people.find((one) => one.id === twin.id)?.portalConsent
    ).toBeNull();
  });

  it("is printed for the Investor by name, signed by them first, with its Version in the foot", async () => {
    const owner = await as("owner");
    const id = await recorded("হাসান", `0178${suffix}5`);

    const { document } = await owner.investors.consentSheet({ id });

    expect(document.preamble.bn).toContain(`হাসান ${suffix}`);
    const signatures = document.sections.find(
      (section) => section.kind === "signatures"
    );
    expect(
      signatures?.kind === "signatures" ? signatures.signers[0]?.name : null
    ).toBe(`হাসান ${suffix}`);
    expect(document.produced).toContain("সংস্করণ ১");
  });
});
