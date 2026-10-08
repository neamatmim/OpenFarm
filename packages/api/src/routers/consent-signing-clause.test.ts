import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import { PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE } from "@OpenFarm/domain";
import {
  FakeClock,
  asTheFarmHeldItBefore,
  scratchDb,
} from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { anInvitedInvestor } from "../test/portal-client";
import { appRouter } from "./index";

// The Portal Consent's signing clause (ADR 0022): a consent signed on wording that carries it lets the Investor agree
// to papers in the portal; one signed before it does not, until they sign the new one in its place at their next visit
// — which replaces it without touching their access.

const suffix = `${Date.now()}`.slice(-6);
const AT = "2079-01-05T04:00:00.000Z";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  return client;
};

/** Their consent in force, as the Owner's list of Investors carries it. */
const consentOf = async (id: string) => {
  const owner = await asOwner();
  const { people } = await owner.investors.list();
  return people.find((one) => one.id === id)?.portalConsent ?? null;
};

/** Puts their consent in force back on the wording before the signing clause, as one signed before it holds it. */
const signedBeforeTheClause = async (investorId: string) => {
  const db = scratchDb();
  const consent = await db.query.portalConsent.findFirst({
    where: { investorId, withdrawnOn: { isNull: true } },
  });
  if (!consent) {
    throw new Error("expected their consent");
  }
  await asTheFarmHeldItBefore((tx) =>
    tx
      .update(paperTemplateVersion)
      .set({ content: PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE })
      .where(eq(paperTemplateVersion.id, consent.versionId))
  );
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000098",
    registrationNumber: `DLS/SAV/2079/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2081-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("the Portal Consent's signing clause", () => {
  it("lets an Investor who signed today's wording agree in the app, and says so to them", async () => {
    const them = await anInvitedInvestor(
      { name: `রহিম ${suffix}`, phone: `0179${suffix}1` },
      AT
    );

    expect(await consentOf(them.id)).toMatchObject({ signsInApp: true });
    const me = await them.client.portal.me();
    expect(me.record.signsInApp).toBe(true);
  });

  it("does not let one who signed before it, until the new one replaces theirs — their access standing", async () => {
    const owner = await asOwner();
    const them = await anInvitedInvestor(
      { name: `সালমা ${suffix}`, phone: `0179${suffix}2` },
      AT
    );
    await signedBeforeTheClause(them.id);
    expect(await consentOf(them.id)).toMatchObject({ signsInApp: false });
    const before = await them.client.portal.me();
    expect(before.record.signsInApp).toBe(false);

    // The farm's wording in force is the one they signed, so it is caught up to today's before they sign it.
    await owner.templates.list();
    const replaced = await owner.investors.recordConsent({ id: them.id });

    expect(replaced.signsInApp).toBe(true);
    expect(await consentOf(them.id)).toMatchObject({ signsInApp: true });
    const kept = await scratchDb().query.portalConsent.findMany({
      where: { investorId: them.id },
      orderBy: { recordedAt: "asc" },
    });
    expect(kept.map((one) => one.withdrawnHow)).toEqual(["replaced", null]);
    // Still in: replacing a consent takes nothing away.
    const after = await them.client.portal.me();
    expect(after.record.signsInApp).toBe(true);
    const access = await scratchDb().query.investorAccess.findFirst({
      where: { investorId: them.id },
    });
    expect(access?.revokedAt).toBeNull();
  });

  it("is not signed again over a consent that already carries it", async () => {
    const owner = await asOwner();
    const them = await anInvitedInvestor(
      { name: `করিম ${suffix}`, phone: `0179${suffix}3` },
      AT
    );

    await expect(
      owner.investors.recordConsent({ id: them.id })
    ).rejects.toMatchObject({ data: { refusal: "consent_in_force" } });
  });

  it("never lets the Owner end a consent as replaced by hand", async () => {
    const owner = await asOwner();
    const them = await anInvitedInvestor(
      { name: `জামাল ${suffix}`, phone: `0179${suffix}4` },
      AT
    );

    await expect(
      owner.investors.takePortalAway({
        id: them.id,
        why: {
          reason: "withdrew_consent",
          on: "2079-01-05",
          // @ts-expect-error -- not a way a consent is withdrawn by the Owner's hand
          how: "replaced",
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await scratchDb().query.portalConsent.findFirst({
        where: { investorId: them.id },
        columns: { withdrawnOn: true },
      })
    ).toMatchObject({ withdrawnOn: null });
  });
});
