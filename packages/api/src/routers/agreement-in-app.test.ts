import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { stillAsKept } from "../kept-paper";
import { createTestClient } from "../test/client";
import { invitingInvestors, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// An Investment Agreement agreed within the app instead of on stamped paper: the Owner offers it, the Investor agrees to
// the paper in the portal, the Owner approves, and only then is it an Agreement — stamp kind in the app, no stamp taka —
// that takes capital with no photograph of a paper. Behind the farm's switch, which is off until the Owner turns it on.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2093-01-01T04:00:00.000Z";
const LATER = "2093-01-05T04:00:00.000Z";

const as = async (role: "owner" | "manager", at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "018", run: suffix }, JANUARY);

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  throw new Error("expected a refusal");
};

/** A Venture of ten Units at fifty thousand each, still open. */
const aVenture = async (name: string) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalBdt: 500_000,
    floorBdt: 0,
    decideBy: "2093-01-20",
    targetWindowStart: "2093-06-01",
    targetWindowEnd: "2093-06-10",
    unitPriceBdt: 50_000,
    units: 10,
    cattleBudgetBdt: 400_000,
  });
  return venture.id;
};

const terms = (ventureId: string, investorId: string, units = 3) => ({
  ventureId,
  investorId,
  units,
  investorsPercent: 60,
  arbitrator: `মাওলানা সালিস ${suffix}`,
});

/** Offered by the Owner, read in the portal and agreed by the Investor: the offer, as the Investor read it. */
const offeredAndAgreed = async (
  ventureId: string,
  them: Awaited<ReturnType<typeof invited>>,
  units = 3
) => {
  const owner = await as("owner");
  const { id } = await owner.ventures.offerInApp(
    terms(ventureId, them.id, units)
  );
  const theirs = await them.client.portal.agreementOffers();
  const offer = theirs.find((one) => one.id === id);
  await them.client.portal.agreeToOffer({
    offerId: id,
    paperHash: offer?.paperHash ?? "",
  });
  return { id, offer };
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2093/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2095-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
});

describe("the switch", () => {
  it("is off: nothing is offered in the app until the Owner turns it on", async () => {
    const ventureId = await aVenture("বন্ধ");
    const them = await invited("বন্ধ সুইচ");
    const owner = await as("owner");
    const listed = await owner.investors.list();
    expect(listed.agreementsInApp).toBe(false);
    expect(
      await refusalOf(owner.ventures.offerInApp(terms(ventureId, them.id)))
    ).toBe("agreements_in_app_off");
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager");
    await expect(
      manager.investors.setAgreementsInApp({ shown: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("an Agreement agreed in the app", () => {
  beforeAll(async () => {
    const owner = await as("owner");
    await owner.investors.setAgreementsInApp({ shown: true });
  });

  it("is offered, agreed in the portal, approved — and only then an Agreement, which takes capital with no paper photo", async () => {
    const ventureId = await aVenture("সম্মত");
    const them = await invited("সম্মত বিনিয়োগকারী");
    const { id, offer } = await offeredAndAgreed(ventureId, them);
    // What they read is the paper kept, to the letter.
    expect(offer && stillAsKept(offer)).toBe(true);
    expect(JSON.stringify(offer?.paper)).toContain(`সালিস ${suffix}`);

    const owner = await as("owner");
    // Agreed, not yet approved: not an Agreement, and nothing counts it.
    expect(await owner.ventures.agreements({ ventureId })).toEqual([]);

    const approver = await as("owner", LATER);
    const { agreementId, payInCode } = await approver.ventures.approveOffer({
      offerId: id,
    });
    const [agreement] = await owner.ventures.agreements({ ventureId });
    expect(agreement).toMatchObject({
      id: agreementId,
      payInCode,
      units: 3,
      investorsPercent: 60,
      stamp: {
        kind: "in_app",
        valueBdt: 0,
        on: "2093-01-05",
        serial: offer?.paperHash.slice(0, 12).toUpperCase(),
      },
    });

    await owner.ventures.takeCapital({
      agreementId,
      amountBdt: 150_000,
      movedOn: "2093-01-05",
      paymentMethod: "bank",
      reference: `TRF অ্যাপে ${suffix}`,
    });
    const offers = await owner.ventures.agreementOffers({ ventureId });
    expect(offers).toEqual([
      expect.objectContaining({ id, standing: "approved", agreementId }),
    ]);
  });

  it("holds no Units until it is approved, and approval asks again for the Units left", async () => {
    const ventureId = await aVenture("একক");
    const them = await invited("একক বিনিয়োগকারী");
    const { id } = await offeredAndAgreed(ventureId, them, 8);
    // Signed on stamped paper meanwhile, for four of the ten: the offer held none of them.
    const other = await invited("কাগজের বিনিয়োগকারী");
    const owner = await as("owner");
    await owner.ventures.sign({
      ...terms(ventureId, other.id, 4),
      stampValueBdt: 300,
      stampedOn: "2093-01-02",
      stampSerial: `AA ${suffix}`,
    });
    expect(await refusalOf(owner.ventures.approveOffer({ offerId: id }))).toBe(
      "venture_units_gone"
    );
  });

  it("is not approved before the Investor has agreed", async () => {
    const ventureId = await aVenture("অসম্মত");
    const them = await invited("অপেক্ষার বিনিয়োগকারী");
    const owner = await as("owner");
    const { id } = await owner.ventures.offerInApp(terms(ventureId, them.id));
    expect(await refusalOf(owner.ventures.approveOffer({ offerId: id }))).toBe(
      "offer_not_agreed"
    );
  });

  it("is agreed only by the Investor it is offered to", async () => {
    const ventureId = await aVenture("অন্যের");
    const offeredTo = await invited("যাঁকে দেওয়া");
    const stranger = await invited("অন্য বিনিয়োগকারী");
    const owner = await as("owner");
    const { id, paperHash } = await owner.ventures.offerInApp(
      terms(ventureId, offeredTo.id)
    );
    expect(await stranger.client.portal.agreementOffers()).toEqual([]);
    await expect(
      stranger.client.portal.agreeToOffer({ offerId: id, paperHash })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is not agreed to a paper other than the one kept", async () => {
    const ventureId = await aVenture("বদলানো");
    const them = await invited("বদলানো কাগজ");
    const owner = await as("owner");
    const { id } = await owner.ventures.offerInApp(terms(ventureId, them.id));
    expect(
      await refusalOf(
        them.client.portal.agreeToOffer({
          offerId: id,
          paperHash: "0".repeat(64),
        })
      )
    ).toBe("paper_changed_since");
    const [offer] = await owner.ventures.agreementOffers({ ventureId });
    expect(offer?.standing).toBe("offered");
  });

  it("cannot be agreed or approved once withdrawn", async () => {
    const ventureId = await aVenture("ফিরিয়ে নেওয়া");
    const them = await invited("ফিরিয়ে নেওয়া প্রস্তাব");
    const owner = await as("owner");
    const { id, paperHash } = await owner.ventures.offerInApp(
      terms(ventureId, them.id)
    );
    await owner.ventures.withdrawOffer({ offerId: id });
    expect(await them.client.portal.agreementOffers()).toEqual([]);
    expect(
      await refusalOf(
        them.client.portal.agreeToOffer({ offerId: id, paperHash })
      )
    ).toBe("offer_withdrawn");
    expect(await refusalOf(owner.ventures.approveOffer({ offerId: id }))).toBe(
      "offer_withdrawn"
    );
  });

  it("is not withdrawn once approved", async () => {
    const ventureId = await aVenture("অনুমোদিত");
    const them = await invited("অনুমোদিত প্রস্তাব");
    const { id } = await offeredAndAgreed(ventureId, them);
    const owner = await as("owner");
    await owner.ventures.approveOffer({ offerId: id });
    expect(await refusalOf(owner.ventures.withdrawOffer({ offerId: id }))).toBe(
      "offer_already_approved"
    );
  });

  it("is offered only to an Investor who can agree in the portal", async () => {
    const ventureId = await aVenture("পোর্টাল ছাড়া");
    const owner = await as("owner");
    const byPhone = await owner.investors.record({
      name: `ফোনের বিনিয়োগকারী ${suffix}`,
      phone: `01799${suffix}`,
    });
    expect(
      await refusalOf(owner.ventures.offerInApp(terms(ventureId, byPhone.id)))
    ).toBe("investor_not_in_portal");
  });

  it("is one offer at a time for one Investor on one Venture", async () => {
    const ventureId = await aVenture("দুবার");
    const them = await invited("দুবার প্রস্তাব");
    const owner = await as("owner");
    await owner.ventures.offerInApp(terms(ventureId, them.id));
    expect(
      await refusalOf(owner.ventures.offerInApp(terms(ventureId, them.id)))
    ).toBe("offer_already_made");
  });

  it("is still approved once agreed after the switch is turned off, but nothing new is agreed", async () => {
    const ventureId = await aVenture("সুইচ বন্ধের পর");
    const agreedFirst = await invited("আগে সম্মত");
    const notYet = await invited("এখনো না");
    const { id } = await offeredAndAgreed(ventureId, agreedFirst);
    const owner = await as("owner");
    const pending = await owner.ventures.offerInApp(
      terms(ventureId, notYet.id)
    );
    await owner.investors.setAgreementsInApp({ shown: false });
    // Signed in again: every request reads the farm as it is then.
    const portal = await signedInAs(notYet.loginEmail, JANUARY);
    try {
      expect(
        await refusalOf(
          portal.portal.agreeToOffer({
            offerId: pending.id,
            paperHash: pending.paperHash,
          })
        )
      ).toBe("agreements_in_app_off");
      const { agreementId } = await owner.ventures.approveOffer({
        offerId: id,
      });
      const written = await scratchDb().query.investmentAgreement.findFirst({
        where: { id: agreementId, farmId: theFarm().id },
        columns: { stampKind: true },
      });
      expect(written?.stampKind).toBe("in_app");
    } finally {
      await owner.investors.setAgreementsInApp({ shown: true });
    }
  });

  it("is said to have its paper on file exactly where capital is taken against it — on the Venture and the Investor's page alike", async () => {
    const ventureId = await aVenture("কাগজ");
    const inApp = await invited("কাগজ অ্যাপে");
    const { id } = await offeredAndAgreed(ventureId, inApp, 2);
    const owner = await as("owner");
    await owner.ventures.approveOffer({ offerId: id });
    const signOnStamp = async (name: string, photographed: boolean) => {
      const them = await invited(name);
      const signed = await owner.ventures.sign({
        ...terms(ventureId, them.id, 2),
        stampValueBdt: 300,
        stampedOn: "2093-01-02",
        stampSerial: `AC ${them.id.slice(-8)}`,
      });
      if (photographed) {
        await owner.ventures.keepAgreementPaper({
          agreementId: signed.id,
          contentType: "image/jpeg",
          data: "aGVsbG8=",
        });
      }
    };
    await signOnStamp("কাগজ ছবিসহ", true);
    await signOnStamp("কাগজ ছবি ছাড়া", false);

    const listed = await owner.ventures.agreements({ ventureId });
    const said = await Promise.all(
      listed.map(async (one) => {
        const onTheirPage = await owner.investors.agreements({
          id: one.investorId,
        });
        const taken = await owner.ventures
          .takeCapital({
            agreementId: one.id,
            amountBdt: 50_000,
            movedOn: "2093-01-05",
            paymentMethod: "bank",
            reference: `TRF ${one.id.slice(-8)}`,
          })
          .then(
            () => true,
            () => false
          );
        return {
          stamp: one.stamp.kind,
          onTheVenture: one.paperOnFile,
          onTheirPage: onTheirPage.agreements.find(
            (theirs) => theirs.id === one.id
          )?.paperOnFile,
          taken,
        };
      })
    );
    expect(said).toEqual([
      { stamp: "in_app", onTheVenture: true, onTheirPage: true, taken: true },
      { stamp: "paper", onTheVenture: true, onTheirPage: true, taken: true },
      { stamp: "paper", onTheVenture: false, onTheirPage: false, taken: false },
    ]);
  });

  it("is no way round stamped paper: signing on stamp paper cannot say it was agreed in the app", async () => {
    const ventureId = await aVenture("স্ট্যাম্প");
    const them = await invited("স্ট্যাম্পের বিনিয়োগকারী");
    const owner = await as("owner");
    await expect(
      owner.ventures.sign({
        ...terms(ventureId, them.id),
        stampKind: "in_app" as never,
        stampValueBdt: 300,
        stampedOn: "2093-01-02",
        stampSerial: `AB ${suffix}`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
