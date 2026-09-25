import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { anInvitedInvestor, invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// The Portal Preview: the Owner reading one Investor's portal as they would read it today, from the Owner's own
// sign-in — the same answers, page by page, for anybody on file, and nothing left on the Investor's side.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2052-01-01T04:00:00.000Z";
/** Later the same day: past the hour a real "last in" is kept to, so a Preview that marked them seen would show. */
const LATER = "2052-01-01T07:00:00.000Z";
let rahimId = "";
let salmaId = "";
const clock = () => new FakeClock(JANUARY);

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: clock(),
  });
  return client;
};

let ventureId = "";
const agreementOf: Record<string, string> = {};
let rahim: Awaited<ReturnType<typeof anInvitedInvestor>>["client"];

/** Signed for the Venture on stamp paper and paid in by bank. */
const signAndPay = async (
  name: string,
  investorId: string,
  phone: string,
  units: number
) => {
  const owner = await asOwner();
  const signed = await owner.ventures.sign({
    ventureId,
    investorId,
    units,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueBdt: 300,
    stampedOn: "2052-01-02",
    stampSerial: `S-${phone}`,
  });
  await owner.ventures.keepAgreementPaper({
    agreementId: signed.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: signed.id,
    amountBdt: units * 50_000,
    movedOn: "2052-01-03",
    paymentMethod: "bank",
    reference: `TRF-${phone}`,
  });
  agreementOf[name] = signed.id;
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/SAV/2052/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2054-03-31",
  });
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2052-01-20",
    targetWindowStart: "2052-03-17",
    targetWindowEnd: "2052-03-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
  await owner.investors.setPortalOpen({ open: true });
  // রহিম took his invitation up and reads his own portal; সালমা was never invited.
  const him = await anInvitedInvestor(
    { name: `রহিম ${suffix}`, phone: `0172${suffix}` },
    JANUARY
  );
  rahimId = him.id;
  rahim = him.client;
  await signAndPay("রহিম", rahimId, `0172${suffix}`, 3);
  const her = await owner.investors.record({
    name: `সালমা ${suffix}`,
    phone: `0173${suffix}`,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${suffix.slice(-5)}`,
  });
  salmaId = her.id;
  await signAndPay("সালমা", salmaId, `0173${suffix}`, 5);
});

/** Where they are signed in, with which one is "here" left out: the Owner is on none of them. */
const places = (list: readonly { here: boolean }[]) =>
  list.map(({ here: _here, ...rest }) => rest);

describe("the Portal Preview", () => {
  it("answers each page exactly as the Investor's own portal does", async () => {
    const owner = await asOwner();
    const agreementId = agreementOf["রহিম"] ?? "";
    const investorId = rahimId;

    expect(await owner.portalPreview.me({ investorId })).toEqual(
      await rahim.portal.me()
    );
    expect(await owner.portalPreview.portfolio({ investorId })).toEqual(
      await rahim.portal.portfolio()
    );
    expect(await owner.portalPreview.openVentures({ investorId })).toEqual(
      await rahim.portal.openVentures()
    );
    expect(await owner.portalPreview.myRequests({ investorId })).toEqual(
      await rahim.portal.myRequests()
    );
    expect(
      await owner.portalPreview.venture({ investorId, agreementId })
    ).toEqual(await rahim.portal.venture({ agreementId }));
    const theirPlaces = await owner.portalPreview.signedInOn({ investorId });
    expect(places(theirPlaces)).toEqual(
      places(await rahim.portal.signedInOn())
    );
    expect(theirPlaces.some((one) => one.here)).toBe(false);
  });

  it("works for somebody never invited, with the portal shut", async () => {
    const owner = await asOwner();
    await owner.investors.setPortalOpen({ open: false });
    try {
      const me = await owner.portalPreview.me({ investorId: salmaId });
      expect(me).toMatchObject({ investorId: salmaId });
      expect(me.record.nid).not.toBe("1234567890");
      const { agreements } = await owner.portalPreview.portfolio({
        investorId: salmaId,
      });
      expect(agreements.map((one) => one.id)).toEqual([agreementOf["সালমা"]]);
      expect(
        await owner.portalPreview.signedInOn({ investorId: salmaId })
      ).toEqual([]);
    } finally {
      await owner.investors.setPortalOpen({ open: true });
    }
  });

  it("reads anybody on file, whatever their standing: invited, code ran out, taken away, retired", async () => {
    const owner = await asOwner();
    const recorded = async (name: string, phone: string) => {
      const them = await owner.investors.record({
        name: `${name} ${suffix}`,
        phone,
        address: "সাভার",
        nid: "1234567890",
        bankAccount: `05678${phone.slice(-5)}`,
      });
      return them.id;
    };
    const invited = await recorded("করিম", `0174${suffix}`);
    await invitedWithConsent(owner, invited);
    const ranOut = await recorded("জামাল", `0175${suffix}`);
    await invitedWithConsent(owner, ranOut);
    const takenAway = await anInvitedInvestor(
      { name: `কামাল ${suffix}`, phone: `0176${suffix}` },
      JANUARY
    );
    await owner.investors.takePortalAway({ id: takenAway.id });
    const retired = await recorded("হাসান", `0177${suffix}`);
    await owner.investors.retire({ id: retired });
    // A week and more on, the second code has run out.
    const { client: later } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock("2052-01-10T04:00:00.000Z"),
    });

    for (const investorId of [invited, ranOut, takenAway.id, retired]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(
        later.portalPreview.me({ investorId })
      ).resolves.toMatchObject({ investorId });
    }
    // A retired Investor is offered nothing, as their own portal would offer them nothing.
    expect(
      await later.portalPreview.openVentures({ investorId: retired })
    ).toEqual([]);
  });

  it("never shows one Investor's Venture through another's preview", async () => {
    const owner = await asOwner();

    await expect(
      owner.portalPreview.venture({
        investorId: rahimId,
        agreementId: agreementOf["সালমা"] ?? "",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is the Owner's alone: an Investor is refused it, even for their own id, and so is a Manager", async () => {
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: clock(),
    });

    await expect(
      rahim.portalPreview.me({ investorId: rahimId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.portalPreview.me({ investorId: rahimId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("leaves nothing on the Investor's side, and a paper made there is the Owner's own Export", async () => {
    const agreementId = agreementOf["রহিম"] ?? "";
    // রহিম read his own portal at JANUARY; the Owner reads it hours later.
    await rahim.portal.me();
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(LATER),
    });
    const before = await owner.investors.portalActivity({ id: rahimId });

    await owner.portalPreview.me({ investorId: rahimId });
    await owner.portalPreview.portfolio({ investorId: rahimId });
    await owner.portalPreview.venture({ investorId: rahimId, agreementId });
    const paper = await owner.portalPreview.paper({
      investorId: rahimId,
      agreementId,
      kind: "joining",
    });

    expect(paper.text.length).toBeGreaterThan(0);
    expect(await owner.investors.portalActivity({ id: rahimId })).toEqual(
      before
    );
    const [made] = await owner.audit.list({
      entity: "investment_agreement",
      entityId: agreementId,
      limit: 1,
    });
    expect(made).toMatchObject({
      action: "export",
      after: expect.objectContaining({
        paper: "joining_letter",
        inPreviewOf: rahimId,
      }),
    });
    expect(made?.actorId).toBe(thePerson("owner").id);
  });
});
