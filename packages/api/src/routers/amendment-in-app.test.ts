import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { stillAsKept } from "../kept-paper";
import { createTestClient } from "../test/client";
import { invitingInvestors, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// An Amendment agreed within the app instead of on a signed paper: the Owner offers it, every Investor on the Venture
// agrees to the paper in the portal, the Owner approves, and only then is the Venture amended — signed on the day it was
// approved, with no photograph. Behind the farm's switch, which is off until the Owner turns it on.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2094-01-01T04:00:00.000Z";
const LATER = "2094-01-07T04:00:00.000Z";

const as = async (role: "owner" | "manager", at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "019", run: suffix }, JANUARY);

type Them = Awaited<ReturnType<typeof invited>>;

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  throw new Error("expected a refusal");
};

/** One Investor signed on stamp for a Venture: their Agreement. */
const signs = async (ventureId: string, them: { id: string }, at = JANUARY) => {
  const owner = await as("owner", at);
  const { id } = await owner.ventures.agreements.sign({
    ventureId,
    investorId: them.id,
    units: 2,
    investorsPercent: 60,
    arbitrator: `মাওলানা সালিস ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2094-01-01",
    stampSerial: `AA ${them.id.slice(-8)}`,
  });
  return id;
};

/** A Venture still open with two Investors in the portal signed on it: the Venture, them, and their Agreements. */
const aVentureOfTwo = async (name: string) => {
  const owner = await as("owner");
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
  const first = await invited(`${name} প্রথম`);
  const second = await invited(`${name} দ্বিতীয়`);
  const agreements = [
    await signs(venture.id, first),
    await signs(venture.id, second),
  ];
  return { ventureId: venture.id, first, second, agreements };
};

const terms = (ventureId: string) => ({
  ventureId,
  investorsPercent: 65,
  targetWindowStart: "2094-06-05",
  targetWindowEnd: "2094-06-15",
  reason: `ঈদ পিছিয়েছে ${suffix}`,
});

/** One Investor reads the Amendment offered on their portal and agrees to it. */
const agrees = async (them: Them, offerId: string) => {
  const offered = await them.client.portal.amendmentOffers();
  const offer = offered.find((one) => one.id === offerId);
  await them.client.portal.agreeToAmendment({
    offerId,
    paperHash: offer?.paperHash ?? "",
  });
  return offer;
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/SAV/2094/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2096-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
  // Two Investors on every Venture here, more than the farm's own twenty in all.
  await owner.farm.setParameters({ investorCap: 50 });
});

describe("the switch", () => {
  it("is off: no Amendment is offered in the app until the Owner turns it on", async () => {
    const { ventureId } = await aVentureOfTwo("বন্ধ");
    const owner = await as("owner");
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.propose(terms(ventureId))
      )
    ).toBe("agreements_in_app_off");
  });
});

describe("an Amendment agreed in the app", () => {
  beforeAll(async () => {
    const owner = await as("owner");
    await owner.investors.setAgreementsInApp({ shown: true });
  });

  it("is offered, agreed by every Investor, approved — and only then moves their terms, signed the day approved", async () => {
    const { ventureId, first, second, agreements } =
      await aVentureOfTwo("সম্মত");
    const owner = await as("owner");
    const { id } = await owner.ventures.agreements.amendments.propose(
      terms(ventureId)
    );
    const read = await agrees(first, id);
    // What they read is the paper kept, naming them both.
    expect(read && stillAsKept(read)).toBe(true);
    expect(JSON.stringify(read?.paper)).toContain("প্রথম");
    expect(JSON.stringify(read?.paper)).toContain("দ্বিতীয়");
    await agrees(second, id);
    // Agreed by both, not yet approved: nothing has moved.
    const before = await owner.ventures.agreements.termsOn({
      agreementId: agreements[0] ?? "",
      on: "2094-01-10",
    });
    expect(before.investorsPercent).toBe(60);

    const approver = await as("owner", LATER);
    const { agreements: amended } =
      await approver.ventures.agreements.amendments.approve({
        offerId: id,
      });
    expect(amended).toBe(2);
    const after = await Promise.all(
      agreements.map((agreementId) =>
        owner.ventures.agreements.termsOn({ agreementId, on: "2094-01-10" })
      )
    );
    expect(after).toEqual([
      expect.objectContaining({
        investorsPercent: 65,
        targetWindowStart: "2094-06-05",
        targetWindowEnd: "2094-06-15",
        amendedOn: "2094-01-07",
      }),
      expect.objectContaining({ investorsPercent: 65 }),
    ]);
    // In force from the day approved, not before.
    const theDayBefore = await owner.ventures.agreements.termsOn({
      agreementId: agreements[0] ?? "",
      on: "2094-01-06",
    });
    expect(theDayBefore.investorsPercent).toBe(60);
    const [offer] = await owner.ventures.agreements.amendments.list({
      ventureId,
    });
    expect(offer).toMatchObject({ id, standing: "approved", agreed: 2, of: 2 });
  });

  it("is not approved until every Investor on the Venture has agreed", async () => {
    const { ventureId, first } = await aVentureOfTwo("একজন");
    const owner = await as("owner");
    const { id } = await owner.ventures.agreements.amendments.propose(
      terms(ventureId)
    );
    await agrees(first, id);
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.approve({ offerId: id })
      )
    ).toBe("amendment_not_agreed");
    const [offer] = await owner.ventures.agreements.amendments.list({
      ventureId,
    });
    expect(offer).toMatchObject({ standing: "offered", agreed: 1, of: 2 });
  });

  it("is not approved past somebody who signed for the Venture after it was offered, who cannot agree to it", async () => {
    const { ventureId, first, second } = await aVentureOfTwo("পরে যোগ");
    const owner = await as("owner");
    const { id, paperHash } =
      await owner.ventures.agreements.amendments.propose(terms(ventureId));
    await agrees(first, id);
    await agrees(second, id);
    const late = await invited("পরে যোগ তৃতীয়");
    await signs(ventureId, late, LATER);
    expect(await late.client.portal.amendmentOffers()).toEqual([]);
    await expect(
      late.client.portal.agreeToAmendment({ offerId: id, paperHash })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.approve({ offerId: id })
      )
    ).toBe("amendment_not_agreed");
  });

  it("is agreed only by an Investor on the Venture", async () => {
    const { ventureId } = await aVentureOfTwo("অন্যের");
    const stranger = await invited("অন্যের বাইরের");
    const owner = await as("owner");
    const { id, paperHash } =
      await owner.ventures.agreements.amendments.propose(terms(ventureId));
    expect(await stranger.client.portal.amendmentOffers()).toEqual([]);
    await expect(
      stranger.client.portal.agreeToAmendment({ offerId: id, paperHash })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is not agreed to a paper other than the one kept", async () => {
    const { ventureId, first } = await aVentureOfTwo("বদলানো");
    const owner = await as("owner");
    const { id } = await owner.ventures.agreements.amendments.propose(
      terms(ventureId)
    );
    expect(
      await refusalOf(
        first.client.portal.agreeToAmendment({
          offerId: id,
          paperHash: "0".repeat(64),
        })
      )
    ).toBe("paper_changed_since");
  });

  it("cannot be agreed or approved once withdrawn, and another may then be offered", async () => {
    const { ventureId, first } = await aVentureOfTwo("ফিরিয়ে");
    const owner = await as("owner");
    const { id, paperHash } =
      await owner.ventures.agreements.amendments.propose(terms(ventureId));
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.propose(terms(ventureId))
      )
    ).toBe("amendment_already_proposed");
    await owner.ventures.agreements.amendments.withdraw({ offerId: id });
    expect(await first.client.portal.amendmentOffers()).toEqual([]);
    expect(
      await refusalOf(
        first.client.portal.agreeToAmendment({ offerId: id, paperHash })
      )
    ).toBe("offer_withdrawn");
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.approve({ offerId: id })
      )
    ).toBe("offer_withdrawn");
    await owner.ventures.agreements.amendments.propose(terms(ventureId));
  });

  it("is offered only where every Investor on the Venture can agree in the portal", async () => {
    const { ventureId } = await aVentureOfTwo("ফোনে");
    const owner = await as("owner");
    const byPhone = await owner.investors.record({
      name: `ফোনের বিনিয়োগকারী ${suffix}`,
      phone: `01798${suffix}`,
    });
    await signs(ventureId, byPhone);
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.propose(terms(ventureId))
      )
    ).toBe("investor_not_in_portal");
  });

  it("is refused a Target Window out of order", async () => {
    const { ventureId } = await aVentureOfTwo("উল্টো");
    const owner = await as("owner");
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.propose({
          ...terms(ventureId),
          targetWindowStart: "2094-06-20",
          targetWindowEnd: "2094-06-10",
        })
      )
    ).toBe("window_out_of_order");
  });

  it("is still approved once agreed after the switch is turned off, but nothing new is agreed", async () => {
    const agreedFirst = await aVentureOfTwo("আগে সম্মত");
    const notYet = await aVentureOfTwo("এখনো না");
    const owner = await as("owner");
    const done = await owner.ventures.agreements.amendments.propose(
      terms(agreedFirst.ventureId)
    );
    await agrees(agreedFirst.first, done.id);
    await agrees(agreedFirst.second, done.id);
    const pending = await owner.ventures.agreements.amendments.propose(
      terms(notYet.ventureId)
    );
    await owner.investors.setAgreementsInApp({ shown: false });
    // Signed in again: every request reads the farm as it is then.
    const portal = await signedInAs(notYet.first.loginEmail, JANUARY);
    try {
      expect(
        await refusalOf(
          portal.portal.agreeToAmendment({
            offerId: pending.id,
            paperHash: pending.paperHash,
          })
        )
      ).toBe("agreements_in_app_off");
      const { agreements } = await owner.ventures.agreements.amendments.approve(
        {
          offerId: done.id,
        }
      );
      expect(agreements).toBe(2);
    } finally {
      await owner.investors.setAgreementsInApp({ shown: true });
    }
  });
});
