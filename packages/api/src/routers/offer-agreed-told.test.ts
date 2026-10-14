import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import {
  aSigningCode,
  invitingInvestors,
  signedInAs,
} from "../test/portal-client";
import { appRouter } from "./index";

// An Investor who agrees in the portal waits on the Owner's approval: she is told at once, once, and the notice goes once
// she has approved it.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2094-01-01T04:00:00.000Z";
const LATER = "2094-01-05T04:00:00.000Z";

const as = async (at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(at),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "019", run: suffix }, JANUARY);

let ventureId = "";
let offerId = "";

/** What the Owner's list says about this Venture's agreed offers. */
const told = async (at = JANUARY) => {
  const owner = await as(at);
  const mine = await owner.alerts.mine({ about: ventureId });
  return mine.filter((one) => one.kind === "offer_agreed");
};

beforeAll(async () => {
  const owner = await as();
  await owner.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000098",
    registrationNumber: `DLS/OA/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর",
    registrationExpiresOn: "2096-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
  await owner.investors.setAgreementsInApp({ shown: true });
  const venture = await owner.ventures.open({
    name: `সম্মতি ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2094-01-20",
    targetWindowStart: "2094-06-01",
    targetWindowEnd: "2094-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  ventureId = venture.id;
});

describe("an Investor agreeing in the app", () => {
  it("tells the Owner at once that it waits for her approval, and once", async () => {
    const them = await invited("সম্মত");
    const owner = await as();
    const made = await owner.ventures.agreements.offers.make({
      ventureId,
      investorId: them.id,
      units: 3,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
    });
    offerId = made.id;
    expect(await told()).toEqual([]);

    const theirs = await them.client.portal.agreementOffers();
    const paperHash = theirs.find((one) => one.id === offerId)?.paperHash ?? "";
    await them.client.portal.agreeToOffer({
      offerId,
      paperHash,
      code: await aSigningCode(them, "agreement_offer", offerId),
    });

    const notices = await told();
    expect(notices).toHaveLength(1);
    expect(notices[0]?.params).toMatchObject({
      offerId,
      ventureId,
      venture: `সম্মতি ${suffix}`,
      investor: `সম্মত ${suffix}`,
    });

    // Agreeing again changes nothing and tells nothing.
    await them.client.portal.agreeToOffer({
      offerId,
      paperHash,
      code: "000000",
    });
    expect(await told()).toHaveLength(1);
  });

  it("is settled once she has approved it", async () => {
    const approver = await as(LATER);
    await approver.ventures.agreements.offers.approve({ offerId });
    await approver.alerts.sweep();

    expect(await told(LATER)).toEqual([]);
  });
});

describe("agreeing again, and an offer that can no longer be approved", () => {
  /** A Venture of its own, still open, and one Investor offered a paper in it who agrees to it. */
  const agreedOn = async (name: string) => {
    const owner = await as();
    const venture = await owner.ventures.open({
      name: `${name} ${suffix}`,
      targetCapitalMoney: 500_000,
      floorMoney: 0,
      decideBy: "2094-01-20",
      targetWindowStart: "2094-06-01",
      targetWindowEnd: "2094-06-10",
      unitPriceMoney: 50_000,
      units: 10,
      cattleBudgetMoney: 400_000,
    });
    const them = await invited(name);
    const made = await owner.ventures.agreements.offers.make({
      ventureId: venture.id,
      investorId: them.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
    });
    /** Agrees from their own sign-in at the moment given: a second code waits a minute after the first. */
    const agree = async (at = JANUARY) => {
      const client =
        at === JANUARY ? them.client : await signedInAs(them.loginEmail, at);
      const theirs = await client.portal.agreementOffers();
      await client.portal.agreeToOffer({
        offerId: made.id,
        paperHash: theirs.find((one) => one.id === made.id)?.paperHash ?? "",
        code: await aSigningCode(
          { client, phone: them.phone },
          "agreement_offer",
          made.id
        ),
      });
    };
    await agree();
    return { runId: venture.id, offerId: made.id, them, agree };
  };

  /** The agreed-offer notices the Owner's list holds about a Venture, after a sweep. */
  const standing = async (runId: string) => {
    const owner = await as();
    await owner.alerts.sweep();
    const mine = await owner.alerts.mine({ about: runId });
    return mine.filter((one) => one.kind === "offer_agreed");
  };

  it("tells her again when an Investor who took back their agreement agrees once more", async () => {
    const { runId, offerId: id, them, agree } = await agreedOn("আবার");
    expect(await standing(runId)).toHaveLength(1);

    await them.client.portal.withdrawAgreement({
      kind: "agreement_offer",
      offerId: id,
    });
    expect(await standing(runId)).toEqual([]);

    await agree("2094-01-01T05:00:00.000Z");
    expect(await standing(runId)).toHaveLength(1);
  });

  it("is settled once the Venture has left Open, when nothing agreed can be approved", async () => {
    const { runId } = await agreedOn("বাতিল");
    expect(await standing(runId)).toHaveLength(1);

    const owner = await as();
    await owner.ventures.cancel({ id: runId, reason: "পশু পাওয়া গেল না" });

    expect(await standing(runId)).toEqual([]);
  });
});
