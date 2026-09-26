import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { anInvitedInvestor, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// A Venture the Owner has newly shown in the portal is said to be new to each invited Investor until they have looked
// at the Ventures offered to them — inside the portal only, never by message. Looking is theirs to do: the Owner's
// Preview reads the same answer and marks nothing seen.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2053-01-01T04:00:00.000Z";
const LATER = "2053-01-05T04:00:00.000Z";
const LATER_STILL = "2053-01-08T04:00:00.000Z";

const asOwner = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};

let ventureId = "";
let investorId = "";
let loginEmail = "";

beforeAll(async () => {
  const owner = await asOwner();
  await owner.investors.setPortalOpen({ open: true });
  const venture = await owner.ventures.open({
    name: `নতুন ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2053-01-20",
    targetWindowStart: "2053-06-01",
    targetWindowEnd: "2053-06-10",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
  const them = await anInvitedInvestor(
    { name: `করিম ${suffix}`, phone: `0161${suffix}0` },
    JANUARY
  );
  ({ id: investorId, loginEmail } = them);
  await owner.ventures.showInPortal({ id: ventureId, words: "" });
});

const offeredTo = async (at: string) => {
  const him = await signedInAs(loginEmail, at);
  const offered = await him.portal.openVentures();
  return offered.find((one) => one.id === ventureId);
};

describe("a Venture newly shown in the portal", () => {
  it("is new to an Investor who has not looked, and the Owner's Preview says so without marking it seen", async () => {
    const owner = await asOwner(LATER);
    const previewed = await owner.portalPreview.openVentures({ investorId });
    expect(previewed.find((one) => one.id === ventureId)?.isNew).toBeTruthy();
    // Reading it in the Preview left nothing on their side.
    const theirs = await offeredTo(LATER);
    expect(theirs?.isNew).toBe(true);
  });

  it("is no longer new once they have looked at what they are offered", async () => {
    const him = await signedInAs(loginEmail, LATER);
    await him.portal.sawOffers();
    const theirs = await offeredTo(LATER);
    expect(theirs?.isNew).toBe(false);
  });

  it("is new again when the Owner takes it out and shows it again", async () => {
    const owner = await asOwner(LATER_STILL);
    await owner.ventures.takeOutOfPortal({ id: ventureId });
    await owner.ventures.showInPortal({ id: ventureId, words: "" });
    const theirs = await offeredTo(LATER_STILL);
    expect(theirs?.isNew).toBe(true);
  });

  it("is marked seen by the Investor alone", async () => {
    const owner = await asOwner(LATER);
    await expect(owner.portal.sawOffers()).rejects.toMatchObject({
      data: { refusal: "not_an_investor" },
    });
  });
});
