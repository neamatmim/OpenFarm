import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import {
  anInvitedInvestor,
  invitedWithConsent,
  signedInAs,
} from "../test/portal-client";
import { appRouter } from "./index";

// Who an account in the portal is: one Investor, on the phone the farm has written down for them. A phone corrected
// moves their sign-in with it, a number another Investor's account still answers to is not given away, and a consent
// withdrawn takes the code with it.

const run = `${Date.now()}`.slice(-6);
const AT = "2061-02-01T04:00:00.000Z";
const PASSWORD = "gorur-khamar-2026";
const phoneOf = (n: number) => `018${String(n).padStart(2, "0")}${run}`;

const as = async (role: "owner" | null, at = AT) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.investors.setPortalOpen({ open: true });
});

/** The Owner corrects one Investor's phone, the rest of their record as it was. */
const newPhone = async (id: string, phone: string) => {
  const owner = await as("owner");
  const them = await scratchDb().query.investor.findFirst({ where: { id } });
  await owner.investors.update({
    id,
    name: them?.name ?? "",
    phone,
    address: them?.address ?? "সাভার",
    nid: them?.nid ?? undefined,
    bankAccount: them?.bankAccount ?? undefined,
  });
};

describe("an Investor whose phone the Owner corrected", () => {
  it("signs in on the new number with the new code, and the old number goes to nobody's portal", async () => {
    const first = await anInvitedInvestor(
      { name: `রহিম ${run}`, phone: phoneOf(1) },
      AT
    );
    await newPhone(first.id, phoneOf(2));
    const owner = await as("owner");
    const { code } = await invitedWithConsent(owner, first.id);
    const nobody = await as(null);
    const { loginEmail } = await nobody.portal.join({
      phone: phoneOf(2),
      code,
      password: PASSWORD,
    });
    const moved = await signedInAs(loginEmail, AT);
    const reading = await moved.portal.me();
    expect(reading.investorId).toBe(first.id);

    // Somebody else on the old number — a wife on the phone he gave up — is asked in, and reads her own portal.
    const second = await anInvitedInvestor(
      { name: `রহিমা ${run}`, phone: phoneOf(1) },
      AT
    );
    const hers = await second.client.portal.me();
    expect(hers.investorId).toBe(second.id);
    expect(second.userId).not.toBe(first.userId);
  });

  it("is not asked about on the old number while his account still answers to it", async () => {
    const first = await anInvitedInvestor(
      { name: `করিম ${run}`, phone: phoneOf(3) },
      AT
    );
    // Corrected, but the new code not yet taken up: his account still signs in on the old number.
    await newPhone(first.id, phoneOf(4));
    const owner = await as("owner");
    await invitedWithConsent(owner, first.id);
    const her = await owner.investors.record({
      name: `করিমা ${run}`,
      phone: phoneOf(3),
      address: "সাভার",
    });
    // Refused at the consent, which is never kept for somebody who could not then be given a code.
    await expect(
      owner.investors.recordConsent({ id: her.id })
    ).rejects.toMatchObject({ data: { refusal: "phone_has_portal" } });
  });
});

describe("a consent withdrawn after access was taken away", () => {
  it("takes the code given in the meantime with it", async () => {
    const them = await anInvitedInvestor(
      { name: `সালমা ${run}`, phone: phoneOf(5) },
      AT
    );
    const owner = await as("owner");
    // A lost phone: access taken away, and a new code given so they can come back.
    await owner.investors.takePortalAway({
      id: them.id,
      why: { reason: "lost_phone" },
    });
    const { code } = await owner.investors.inviteToPortal({ id: them.id });
    // And then, by letter, they want none of it.
    await owner.investors.takePortalAway({
      id: them.id,
      why: { reason: "withdrew_consent", on: "2061-02-01", how: "letter" },
    });
    const nobody = await as(null);
    await expect(
      nobody.portal.join({ phone: phoneOf(5), code, password: PASSWORD })
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
  });
});
