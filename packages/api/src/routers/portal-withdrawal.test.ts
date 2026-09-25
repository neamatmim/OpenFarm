import { portalConsent } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// Taking an Investor's portal access away says why: they withdrew their Portal Consent, their phone was lost, or the
// Owner's own decision. A withdrawal records the day and how they asked, and marks the consent withdrawn — and a
// withdrawn consent never counts again, so coming back means signing afresh.

const suffix = `${Date.now()}`.slice(-6);
const MARCH = "2060-03-10T04:00:00.000Z";
const TODAY = "2060-03-10";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(MARCH),
  });
  return client;
};

/** Somebody on file, signed and invited. */
const invited = async (name: string, phone: string) => {
  const owner = await as("owner");
  const them = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  await invitedWithConsent(owner, them.id);
  return them.id;
};

/** One Investor as the Owner's list shows them. */
const listed = async (id: string) => {
  const owner = await as("owner");
  const { people } = await owner.investors.list();
  return people.find((one) => one.id === id);
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/SAV/2060/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2062-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("taking portal access away because they withdrew their consent", () => {
  it("marks the consent withdrawn with the day and how they asked, and says so in their record", async () => {
    const owner = await as("owner");
    const id = await invited("রহিম", `0177${suffix}1`);

    await owner.investors.takePortalAway({
      id,
      why: { reason: "withdrew_consent", on: TODAY, how: "letter" },
    });

    const them = await listed(id);
    expect(them?.portal).toBe("taken_away");
    expect(them?.portalConsent).toBeNull();
    expect(them?.portalTakenAway).toEqual({
      why: "withdrew_consent",
      withdrawnOn: TODAY,
      withdrawnHow: "letter",
    });
  });

  it("never counts the withdrawn consent again: a new code waits on a new one signed", async () => {
    const owner = await as("owner");
    const id = await invited("সালমা", `0177${suffix}2`);
    await owner.investors.takePortalAway({
      id,
      why: { reason: "withdrew_consent", on: TODAY, how: "message" },
    });

    await expect(owner.investors.inviteToPortal({ id })).rejects.toMatchObject({
      data: { refusal: "no_consent" },
    });
    await owner.investors.recordConsent({ id });
    const again = await owner.investors.inviteToPortal({ id });
    expect(again.code).toHaveLength(8);
  });

  it("is on the trail twice in one go: the access taken away, and the consent withdrawn", async () => {
    const owner = await as("owner");
    const id = await invited("করিম", `0177${suffix}3`);

    await owner.investors.takePortalAway({
      id,
      why: { reason: "withdrew_consent", on: TODAY, how: "letter" },
    });

    const access = await owner.audit.list({
      entity: "investor_access",
      limit: 20,
    });
    expect(access.find((one) => one.entityId === id)).toMatchObject({
      after: expect.objectContaining({ revokedWhy: "withdrew_consent" }),
    });
    const consent = await owner.audit.list({
      entity: "portal_consent",
      limit: 20,
    });
    expect(consent.find((one) => one.entityId === id)).toMatchObject({
      action: "update",
      before: expect.objectContaining({ withdrawnOn: null }),
      after: expect.objectContaining({
        withdrawnOn: TODAY,
        withdrawnHow: "letter",
      }),
    });
  });

  it("is recorded for somebody whose access was taken away already, and becomes why", async () => {
    const owner = await as("owner");
    const id = await invited("মোমেনা", `0177${suffix}9`);
    await owner.investors.takePortalAway({ id, why: { reason: "lost_phone" } });

    await owner.investors.takePortalAway({
      id,
      why: { reason: "withdrew_consent", on: TODAY, how: "message" },
    });

    const them = await listed(id);
    expect(them?.portalConsent).toBeNull();
    expect(them?.portalTakenAway).toEqual({
      why: "withdrew_consent",
      withdrawnOn: TODAY,
      withdrawnHow: "message",
    });
  });

  it("is recorded once: a second press finds nothing in force, and the first day stands", async () => {
    const owner = await as("owner");
    const id = await invited("বাদল", `0176${suffix}0`);
    await owner.investors.takePortalAway({
      id,
      why: { reason: "withdrew_consent", on: TODAY, how: "letter" },
    });

    await expect(
      owner.investors.takePortalAway({
        id,
        why: { reason: "withdrew_consent", on: "2060-03-10", how: "message" },
      })
    ).rejects.toMatchObject({ data: { refusal: "no_consent_to_withdraw" } });
    const them = await listed(id);
    expect(them?.portalTakenAway?.withdrawnHow).toBe("letter");
  });

  it("is refused for a day still to come, or one before they signed", async () => {
    const owner = await as("owner");
    const id = await invited("জামাল", `0177${suffix}4`);

    await expect(
      owner.investors.takePortalAway({
        id,
        why: { reason: "withdrew_consent", on: "2060-03-11", how: "letter" },
      })
    ).rejects.toMatchObject({ data: { refusal: "withdrawn_in_the_future" } });
    await expect(
      owner.investors.takePortalAway({
        id,
        why: { reason: "withdrew_consent", on: "2060-03-09", how: "letter" },
      })
    ).rejects.toMatchObject({ data: { refusal: "withdrawn_before_signed" } });
    // Refused, nothing moved: their access and their consent stand.
    const them = await listed(id);
    expect(them?.portal).toBe("invited");
    expect(them?.portalConsent).not.toBeNull();
  });

  it("is refused for somebody with no consent in force, and takes nothing away", async () => {
    const owner = await as("owner");
    const id = await invited("কামাল", `0177${suffix}5`);
    // An access made before consent existed: it has none on file.
    await scratchDb()
      .delete(portalConsent)
      .where(eq(portalConsent.investorId, id));

    await expect(
      owner.investors.takePortalAway({
        id,
        why: { reason: "withdrew_consent", on: TODAY, how: "letter" },
      })
    ).rejects.toMatchObject({ data: { refusal: "no_consent_to_withdraw" } });
    const them = await listed(id);
    expect(them?.portal).toBe("invited");
  });
});

describe("taking portal access away for another reason", () => {
  it("leaves the consent in force: a lost phone needs a new code, not a new signature", async () => {
    const owner = await as("owner");
    const id = await invited("নাসির", `0177${suffix}6`);

    await owner.investors.takePortalAway({ id, why: { reason: "lost_phone" } });

    const them = await listed(id);
    expect(them?.portalTakenAway).toEqual({
      why: "lost_phone",
      withdrawnOn: null,
      withdrawnHow: null,
    });
    expect(them?.portalConsent).not.toBeNull();
    const again = await owner.investors.inviteToPortal({ id });
    expect(again.code).toHaveLength(8);
  });

  it("says the Owner's own decision, and leaves the consent in force", async () => {
    const owner = await as("owner");
    const id = await invited("হাসান", `0177${suffix}7`);

    await owner.investors.takePortalAway({ id, why: { reason: "owner" } });

    const them = await listed(id);
    expect(them?.portalTakenAway?.why).toBe("owner");
    expect(them?.portalConsent).not.toBeNull();
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager");
    const id = await invited("ফারুক", `0177${suffix}8`);

    await expect(
      manager.investors.takePortalAway({ id, why: { reason: "owner" } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
