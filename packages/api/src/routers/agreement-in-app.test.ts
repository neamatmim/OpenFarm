import { eq } from "@OpenFarm/db/operators";
import { agreementOffer } from "@OpenFarm/db/schema/venture";
import { inLanguage } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { stillAsKept } from "../kept-paper";
import { createTestClient } from "../test/client";
import { theWhole } from "../test/nominations";
import {
  aSigningCode,
  invitingInvestors,
  signedInAs,
} from "../test/portal-client";
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

/** A code for an agreement refused before any code is looked at. */
const NO_CODE = "000000";

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
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2093-01-20",
    targetWindowStart: "2093-06-01",
    targetWindowEnd: "2093-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
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
  const { id } = await owner.ventures.agreements.offers.make(
    terms(ventureId, them.id, units)
  );
  const theirs = await them.client.portal.agreementOffers();
  const offer = theirs.find((one) => one.id === id);
  await them.client.portal.agreeToOffer({
    offerId: id,
    paperHash: offer?.paperHash ?? "",
    code: await aSigningCode(them, "agreement_offer", id),
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
      await refusalOf(
        owner.ventures.agreements.offers.make(terms(ventureId, them.id))
      )
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
    expect(await owner.ventures.agreements.list({ ventureId })).toEqual([]);

    const approver = await as("owner", LATER);
    const { agreementId, payInCode } =
      await approver.ventures.agreements.offers.approve({
        offerId: id,
      });
    const [agreement] = await owner.ventures.agreements.list({ ventureId });
    expect(agreement).toMatchObject({
      id: agreementId,
      payInCode,
      units: 3,
      investorsPercent: 60,
      stamp: {
        kind: "in_app",
        valueMoney: 0,
        on: "2093-01-05",
        serial: offer?.paperHash.slice(0, 12).toUpperCase(),
      },
    });

    await owner.ventures.takeCapital({
      agreementId,
      amountMoney: 150_000,
      movedOn: "2093-01-05",
      paymentMethod: "bank",
      reference: `TRF অ্যাপে ${suffix}`,
    });
    const offers = await owner.ventures.agreements.offers.list({ ventureId });
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
    await owner.ventures.agreements.sign({
      ...terms(ventureId, other.id, 4),
      stampValueMoney: 300,
      stampedOn: "2093-01-02",
      stampSerial: `AA ${suffix}`,
    });
    expect(
      await refusalOf(owner.ventures.agreements.offers.approve({ offerId: id }))
    ).toBe("venture_units_gone");
    // The farm says what is left, as it counts it when it refuses.
    const listed = await owner.ventures.list();
    expect(listed.find((one) => one.id === ventureId)?.unitsLeft).toBe(6);
  });

  it("is not approved before the Investor has agreed", async () => {
    const ventureId = await aVenture("অসম্মত");
    const them = await invited("অপেক্ষার বিনিয়োগকারী");
    const owner = await as("owner");
    const { id } = await owner.ventures.agreements.offers.make(
      terms(ventureId, them.id)
    );
    expect(
      await refusalOf(owner.ventures.agreements.offers.approve({ offerId: id }))
    ).toBe("offer_not_agreed");
  });

  it("is agreed only by the Investor it is offered to", async () => {
    const ventureId = await aVenture("অন্যের");
    const offeredTo = await invited("যাঁকে দেওয়া");
    const stranger = await invited("অন্য বিনিয়োগকারী");
    const owner = await as("owner");
    const { id, paperHash } = await owner.ventures.agreements.offers.make(
      terms(ventureId, offeredTo.id)
    );
    expect(await stranger.client.portal.agreementOffers()).toEqual([]);
    await expect(
      stranger.client.portal.agreeToOffer({
        offerId: id,
        paperHash,
        code: NO_CODE,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is not agreed to a paper other than the one kept", async () => {
    const ventureId = await aVenture("বদলানো");
    const them = await invited("বদলানো কাগজ");
    const owner = await as("owner");
    const { id } = await owner.ventures.agreements.offers.make(
      terms(ventureId, them.id)
    );
    expect(
      await refusalOf(
        them.client.portal.agreeToOffer({
          offerId: id,
          paperHash: "0".repeat(64),
          code: NO_CODE,
        })
      )
    ).toBe("paper_changed_since");
    const [offer] = await owner.ventures.agreements.offers.list({ ventureId });
    expect(offer?.standing).toBe("offered");
  });

  it("cannot be agreed or approved once withdrawn", async () => {
    const ventureId = await aVenture("ফিরিয়ে নেওয়া");
    const them = await invited("ফিরিয়ে নেওয়া প্রস্তাব");
    const owner = await as("owner");
    const { id, paperHash } = await owner.ventures.agreements.offers.make(
      terms(ventureId, them.id)
    );
    await owner.ventures.agreements.offers.withdraw({ offerId: id });
    expect(await them.client.portal.agreementOffers()).toEqual([]);
    expect(
      await refusalOf(
        them.client.portal.agreeToOffer({
          offerId: id,
          paperHash,
          code: NO_CODE,
        })
      )
    ).toBe("offer_withdrawn");
    expect(
      await refusalOf(owner.ventures.agreements.offers.approve({ offerId: id }))
    ).toBe("offer_withdrawn");
  });

  it("is not withdrawn once approved", async () => {
    const ventureId = await aVenture("অনুমোদিত");
    const them = await invited("অনুমোদিত প্রস্তাব");
    const { id } = await offeredAndAgreed(ventureId, them);
    const owner = await as("owner");
    await owner.ventures.agreements.offers.approve({ offerId: id });
    expect(
      await refusalOf(
        owner.ventures.agreements.offers.withdraw({ offerId: id })
      )
    ).toBe("offer_already_approved");
  });

  it("is offered only to an Investor who can agree in the portal", async () => {
    const ventureId = await aVenture("পোর্টাল ছাড়া");
    const owner = await as("owner");
    const byPhone = await owner.investors.record({
      name: `ফোনের বিনিয়োগকারী ${suffix}`,
      phone: `01799${suffix}`,
    });
    expect(
      await refusalOf(
        owner.ventures.agreements.offers.make(terms(ventureId, byPhone.id))
      )
    ).toBe("investor_not_in_portal");
  });

  it("is one offer at a time for one Investor on one Venture", async () => {
    const ventureId = await aVenture("দুবার");
    const them = await invited("দুবার প্রস্তাব");
    const owner = await as("owner");
    await owner.ventures.agreements.offers.make(terms(ventureId, them.id));
    expect(
      await refusalOf(
        owner.ventures.agreements.offers.make(terms(ventureId, them.id))
      )
    ).toBe("offer_already_made");
  });

  it("is still approved once agreed after the switch is turned off, but nothing new is agreed", async () => {
    const ventureId = await aVenture("সুইচ বন্ধের পর");
    const agreedFirst = await invited("আগে সম্মত");
    const notYet = await invited("এখনো না");
    const { id } = await offeredAndAgreed(ventureId, agreedFirst);
    const owner = await as("owner");
    const pending = await owner.ventures.agreements.offers.make(
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
            code: NO_CODE,
          })
        )
      ).toBe("agreements_in_app_off");
      const { agreementId } = await owner.ventures.agreements.offers.approve({
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
    await owner.ventures.agreements.offers.approve({ offerId: id });
    const signOnStamp = async (name: string, photographed: boolean) => {
      const them = await invited(name);
      const signed = await owner.ventures.agreements.sign({
        ...terms(ventureId, them.id, 2),
        stampValueMoney: 300,
        stampedOn: "2093-01-02",
        stampSerial: `AC ${them.id.slice(-8)}`,
      });
      if (photographed) {
        await owner.ventures.agreements.keepPaper({
          agreementId: signed.id,
          contentType: "image/jpeg",
          data: "aGVsbG8=",
        });
      }
    };
    await signOnStamp("কাগজ ছবিসহ", true);
    await signOnStamp("কাগজ ছবি ছাড়া", false);

    const listed = await owner.ventures.agreements.list({ ventureId });
    const said = await Promise.all(
      listed.map(async (one) => {
        const onTheirPage = await owner.investors.agreements({
          id: one.investorId,
        });
        const taken = await owner.ventures
          .takeCapital({
            agreementId: one.id,
            amountMoney: 50_000,
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

  it("is copied again as the paper agreed, marked a copy, saying it carries no stamp", async () => {
    const ventureId = await aVenture("অনুলিপি");
    const them = await invited("অনুলিপি বিনিয়োগকারী");
    const { id, offer } = await offeredAndAgreed(ventureId, them);
    const approver = await as("owner", LATER);
    const { agreementId } = await approver.ventures.agreements.offers.approve({
      offerId: id,
    });
    // Asked for a month on: the copy is still the paper as it was laid out when it was offered.
    const owner = await as("owner", "2093-02-05T04:00:00.000Z");
    const { document } = await owner.investorStatements.agreementCopy({
      agreementId,
    });
    const copyOf = inLanguage(document.copyOf ?? "", "en");
    expect(copyOf).toContain("Agreed in the app");
    expect(copyOf).toContain(offer?.paperHash.slice(0, 12).toUpperCase());
    expect(copyOf).not.toMatch(/Stamp serial|Stamped/u);
    const stamp = document.sections.find((one) => one.kind === "stamp");
    const number = offer?.paperHash.slice(0, 12).toUpperCase();
    expect(stamp?.kind === "stamp" && stamp.filled).toEqual([
      { bn: number, en: number },
      { bn: "নেই — অ্যাপে সম্মত", en: "None — agreed in the app" },
      { bn: "৫ জানুয়ারি, ২০৯৩", en: "5 January 2093" },
    ]);
    // Every word the Investor agreed to, as they read it.
    const kept = offer?.paper;
    expect(document.sections.filter((one) => one.kind !== "stamp")).toEqual(
      kept?.sections.filter((one) => one.kind !== "stamp")
    );
    expect(document.produced).toEqual(kept?.produced);
  });

  it("is never copied from a kept paper changed since it was agreed", async () => {
    const ventureId = await aVenture("বদলে ফেলা");
    const them = await invited("বদলে ফেলা কাগজ");
    const { id } = await offeredAndAgreed(ventureId, them);
    const owner = await as("owner");
    const { agreementId } = await owner.ventures.agreements.offers.approve({
      offerId: id,
    });
    const kept = await scratchDb().query.agreementOffer.findFirst({
      where: { id, farmId: theFarm().id },
      columns: { paper: true },
    });
    await scratchDb()
      .update(agreementOffer)
      .set({ paper: { ...(kept?.paper as object), produced: "অন্য দিন" } })
      .where(eq(agreementOffer.id, id));
    await expect(
      owner.investorStatements.agreementCopy({ agreementId })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("is no way round stamped paper: signing on stamp paper cannot say it was agreed in the app", async () => {
    const ventureId = await aVenture("স্ট্যাম্প");
    const them = await invited("স্ট্যাম্পের বিনিয়োগকারী");
    const owner = await as("owner");
    await expect(
      owner.ventures.agreements.sign({
        ...terms(ventureId, them.id),
        stampKind: "in_app" as never,
        stampValueMoney: 300,
        stampedOn: "2093-01-02",
        stampSerial: `AB ${suffix}`,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("an Agreement offered in the app, and the Farm's own Units", () => {
  beforeAll(async () => {
    const owner = await as("owner");
    await owner.investors.setAgreementsInApp({ shown: true });
  });

  it("keeps the Farm from taking Units while it stands, as a signed one does: its paper was laid out without them", async () => {
    const ventureId = await aVenture("অফার আগে");
    const them = await invited("অফার পাওয়া");
    const owner = await as("owner");
    const { id } = await owner.ventures.agreements.offers.make(
      terms(ventureId, them.id)
    );
    expect(
      await refusalOf(
        owner.ventures.agreements.farmTakes({ ventureId, units: 2 })
      )
    ).toBe("an_offer_is_standing");

    // Taken back, nobody holds a paper laid out without them.
    await owner.ventures.agreements.offers.withdraw({ offerId: id });
    await owner.ventures.agreements.farmTakes({ ventureId, units: 2 });
    // Offered again, it is on the Farm's own split or not at all: one agreed on another could never be approved.
    expect(
      await refusalOf(
        owner.ventures.agreements.offers.make({
          ...terms(ventureId, them.id),
          investorsPercent: 70,
        })
      )
    ).toBe("split_not_the_farms");
  });
});

/** A farm day as an English paper writes it. */
const said = (day: string) =>
  formatDate(new Date(`${day}T00:00:00Z`), "en", "date");

describe("an Agreement offered in the app, as things move on after it was offered", () => {
  beforeAll(async () => {
    const owner = await as("owner");
    await owner.investors.setAgreementsInApp({ shown: true });
  });

  it("names the Nominees agreed to on the day agreed, so a মনোনয়নপত্র signed after it is still the list in force", async () => {
    const ventureId = await aVenture("মনোনয়ন পরে");
    const them = await invited("মনোনয়ন পরে");
    const owner = await as("owner");
    const { id } = await owner.ventures.agreements.offers.make({
      ...terms(ventureId, them.id),
      nominees: [
        {
          ...theWhole(`স্ত্রী ${suffix}`),
          bornOn: "1990-01-01",
          nid: "1990 0101 2287",
        },
      ],
    });
    const offers = await them.client.portal.agreementOffers();
    const offered = offers.find((one) => one.id === id);
    await them.client.portal.agreeToOffer({
      offerId: id,
      paperHash: offered?.paperHash ?? "",
      code: await aSigningCode(them, "agreement_offer", id),
    });
    // On the 3rd he signs a new paper in front of the Owner, naming his son.
    const third = await as("owner", "2093-01-03T04:00:00.000Z");
    await third.investors.recordNomination({
      id: them.id,
      nominees: [
        {
          ...theWhole(`ছেলে ${suffix}`, "ছেলে"),
          bornOn: "1995-01-01",
          nid: "1995 0101 6634",
        },
      ],
      signedOn: "2093-01-03",
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    // And on the 5th the Owner approves the offer he agreed to on the 1st.
    const approver = await as("owner", LATER);
    await approver.ventures.agreements.offers.approve({ offerId: id });
    const [inForce] = await approver.investors.nominations({ id: them.id });
    expect(inForce?.nominees.map((one) => one.name)).toEqual([
      `ছেলে ${suffix}`,
    ]);
  });

  it("is laid out with the Target Window an Amendment has moved it to, as the Agreement it becomes records", async () => {
    const ventureId = await aVenture("সংশোধনের পরে");
    const first = await invited("সংশোধনের আগে");
    const { id: firstOffer } = await offeredAndAgreed(ventureId, first);
    const owner = await as("owner");
    await owner.ventures.agreements.offers.approve({ offerId: firstOffer });
    await owner.investors.setAgreementsInApp({ shown: true });
    const moved = await owner.ventures.agreements.amendments.propose({
      ventureId,
      investorsPercent: 60,
      targetWindowStart: "2093-07-01",
      targetWindowEnd: "2093-07-10",
      reason: `ঈদ পিছিয়েছে ${suffix}`,
    });
    const amendments = await first.client.portal.amendmentOffers();
    const amendment = amendments.find((one) => one.id === moved.id);
    await first.client.portal.agreeToAmendment({
      offerId: moved.id,
      paperHash: amendment?.paperHash ?? "",
      code: await aSigningCode(first, "amendment_offer", moved.id),
    });
    const approver = await as("owner", "2093-01-03T04:00:00.000Z");
    await approver.ventures.agreements.amendments.approve({
      offerId: moved.id,
    });

    // A second Investor offered it after: his paper says July, as the Agreement he will hold does.
    const second = await invited("সংশোধনের পরে");
    const later = await as("owner", LATER);
    const { id } = await later.ventures.agreements.offers.make(
      terms(ventureId, second.id)
    );
    const [kept] = await scratchDb()
      .select({ paper: agreementOffer.paper })
      .from(agreementOffer)
      .where(eq(agreementOffer.id, id));
    const text = JSON.stringify(kept?.paper);
    expect(text).toContain(said("2093-07-01"));
    expect(text).not.toContain(said("2093-06-01"));
    // And the Venture as the portal shows it to those not yet in it.
    await later.ventures.showInPortal({ id: ventureId, words: "" });
    const reading = await signedInAs(second.loginEmail, LATER);
    const open = await reading.portal.openVentures();
    expect(open.find((one) => one.id === ventureId)?.targetWindow.start).toBe(
      "2093-07-01"
    );
  });

  it("is gone from the portal, and cannot be agreed, once its Venture is canceled", async () => {
    const ventureId = await aVenture("বাতিল");
    const them = await invited("বাতিল");
    const owner = await as("owner");
    const offered = await owner.ventures.agreements.offers.make(
      terms(ventureId, them.id)
    );
    await owner.ventures.cancel({ id: ventureId, reason: "টাকা ওঠেনি" });
    expect(await them.client.portal.agreementOffers()).toEqual([]);
    expect(
      await refusalOf(
        them.client.portal.agreeToOffer({
          offerId: offered.id,
          paperHash: offered.paperHash,
          code: NO_CODE,
        })
      )
    ).toBe("venture_wrong_state");
  });

  it("is not shown while the Owner's switch is off", async () => {
    const ventureId = await aVenture("সুইচ বন্ধ দেখায় না");
    const them = await invited("সুইচ বন্ধ দেখায় না");
    const owner = await as("owner");
    await owner.ventures.agreements.offers.make(terms(ventureId, them.id));
    await owner.investors.setAgreementsInApp({ shown: false });
    try {
      const portal = await signedInAs(them.loginEmail, JANUARY);
      expect(await portal.portal.agreementOffers()).toEqual([]);
    } finally {
      await owner.investors.setAgreementsInApp({ shown: true });
    }
  });
});
