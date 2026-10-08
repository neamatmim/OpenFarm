import { setTimeout as sleep } from "node:timers/promises";

import { paperText } from "@OpenFarm/domain";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import {
  aSigningCode,
  invitingInvestors,
  signedInAs,
  textsKept,
  textsTo,
} from "../test/portal-client";
import { appRouter } from "./index";

// With the Owner's approval last, an Investor's agreement in the app is their offer (AAOIFI SS 38 5/3; ADR 0022): they
// may withdraw it in the portal until the Owner approves it, and it goes back to waiting on them.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2097-01-01T04:00:00.000Z";
const LATER = "2097-01-01T05:00:00.000Z";

const as = async (role: "owner" | "manager", at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
    // The Owner's approval texts its confirmation through the tests' own outbox.
    sms: textsKept,
  });
  return client;
};

const invited = invitingInvestors({ prefix: "017", run: suffix }, JANUARY);
type Them = Awaited<ReturnType<typeof invited>>;

/** A wait of so many milliseconds, or none for a negative: how one of two acts sent together is sent a little later. */
const after = (ms: number) => sleep(Math.max(ms, 0));

/** What an act was refused with, as the screen reads it. */
const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  throw new Error("expected a refusal");
};

/** How an act sent at the same moment as another ended: done, or the word it was refused with — or the error. */
const wordOf = (settled: PromiseSettledResult<unknown>) => {
  if (settled.status === "fulfilled") {
    return "done";
  }
  const error = settled.reason as {
    data?: { refusal?: string };
    cause?: { message?: string };
    message?: string;
  };
  return error.data?.refusal ?? error.cause?.message ?? error.message;
};

/** An open Venture of ten Units. */
const aVenture = async (name: string) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2097-01-20",
    targetWindowStart: "2097-06-01",
    targetWindowEnd: "2097-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  return venture.id;
};

/** An Agreement offered to them on a Venture of its own, and agreed by them with the code they were texted. */
const agreedOffer = async (them: Them, name: string) => {
  const ventureId = await aVenture(name);
  const owner = await as("owner");
  const { id, paperHash } = await owner.ventures.agreements.offers.make({
    ventureId,
    investorId: them.id,
    units: 2,
    investorsPercent: 60,
    arbitrator: `মাওলানা সালিস ${suffix}`,
  });
  await them.client.portal.agreeToOffer({
    offerId: id,
    paperHash,
    code: await aSigningCode(them, "agreement_offer", id),
  });
  return { ventureId, id, paperHash };
};

/** The offer as the Owner reads it on the Venture. */
const ownersOffer = async (ventureId: string, offerId: string) => {
  const owner = await as("owner");
  const offers = await owner.ventures.agreements.offers.list({ ventureId });
  return offers.find((one) => one.id === offerId);
};

beforeAll(async () => {
  const owner = await as("owner");
  // What the privacy notice names, so a Data Copy can be made.
  await owner.farm.setDataKeepers({
    dataHost: `হোস্ট ${suffix}`,
    backupStore: `ব্যাকআপ ${suffix}`,
    backupCountry: "জার্মানি",
  });
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000095",
    registrationNumber: `DLS/SAV/2097/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2099-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
  await owner.investors.setAgreementsInApp({ shown: true });
  // More Investors sign here than the law's twenty: each test its own, for a farm of its own.
  await owner.farm.setParameters({ investorCap: 50 });
});

describe("an agreement withdrawn before it is approved", () => {
  it("goes back to waiting on the Investor, says they withdrew it, and cannot be approved", async () => {
    const them = await invited("ফিরিয়ে নেওয়া");
    const { ventureId, id } = await agreedOffer(them, "ফিরিয়ে নেওয়া");

    await them.client.portal.withdrawAgreement({
      kind: "agreement_offer",
      offerId: id,
    });

    const offer = await ownersOffer(ventureId, id);
    expect(offer).toMatchObject({
      standing: "offered",
      agreedAt: null,
      withdrawnAt: null,
      agreementWithdrawnAt: new Date(JANUARY),
    });
    const owner = await as("owner", LATER);
    expect(
      await refusalOf(owner.ventures.agreements.offers.approve({ offerId: id }))
    ).toBe("offer_not_agreed");
    const theirs = await them.client.portal.agreementOffers();
    expect(theirs.find((one) => one.id === id)?.agreedAt).toBeNull();
    // The trail says the Investor took it back, by their own sign-in: not the Owner withdrawing the offer.
    const trail = await owner.audit.list({
      entity: "agreement_offer",
      limit: 50,
    });
    const taken = trail.find(
      (one) =>
        one.entityId === id &&
        one.actorId === them.userId &&
        one.reason !== null
    );
    expect(taken?.reason).toContain("withdrew their agreement");
    expect(taken?.after).toMatchObject({ withdrawnAt: null });
  });

  it("is refused once the Owner has approved it: it is an Agreement then", async () => {
    const them = await invited("অনুমোদনের পরে");
    const { id } = await agreedOffer(them, "অনুমোদনের পরে");
    const owner = await as("owner", LATER);
    await owner.ventures.agreements.offers.approve({ offerId: id });

    expect(
      await refusalOf(
        them.client.portal.withdrawAgreement({
          kind: "agreement_offer",
          offerId: id,
        })
      )
    ).toBe("offer_already_approved");
  });

  it("may be given again with a new code, and the Owner reads the standing one and approves it", async () => {
    const them = await invited("আবার সম্মতি");
    const { ventureId, id, paperHash } = await agreedOffer(them, "আবার সম্মতি");
    await them.client.portal.withdrawAgreement({
      kind: "agreement_offer",
      offerId: id,
    });

    const later = await signedInAs(them.loginEmail, LATER);
    await later.portal.agreeToOffer({
      offerId: id,
      paperHash,
      code: await aSigningCode(
        { client: later, phone: them.phone },
        "agreement_offer",
        id
      ),
    });

    const offer = await ownersOffer(ventureId, id);
    expect(offer).toMatchObject({
      standing: "agreed",
      agreedAt: new Date(LATER),
      proof: { agreedAt: new Date(LATER) },
    });
    const owner = await as("owner", LATER);
    await owner.ventures.agreements.offers.approve({ offerId: id });
    const approved = await ownersOffer(ventureId, id);
    expect(approved?.standing).toBe("approved");
    // Told once, for the agreement standing — not again for the one withdrawn.
    const told = textsTo(them.phone).filter((one) =>
      one.text.includes(paperHash.slice(0, 12).toUpperCase())
    );
    expect(told).toHaveLength(1);
  });

  it("is refused once the Owner has taken the offer back: a closed offer's history stays as it was", async () => {
    const them = await invited("মালিক ফেরত");
    const { ventureId, id } = await agreedOffer(them, "মালিক ফেরত");
    const owner = await as("owner", LATER);
    await owner.ventures.agreements.offers.withdraw({ offerId: id });

    expect(
      await refusalOf(
        them.client.portal.withdrawAgreement({
          kind: "agreement_offer",
          offerId: id,
        })
      )
    ).toBe("offer_withdrawn");
    const offer = await ownersOffer(ventureId, id);
    expect(offer).toMatchObject({
      standing: "withdrawn",
      agreedAt: new Date(JANUARY),
    });
  });

  it("can still be withdrawn while the farm's switch is off, the portal offering it", async () => {
    const them = await invited("সুইচ বন্ধ");
    const { ventureId, id } = await agreedOffer(them, "সুইচ বন্ধ");
    const owner = await as("owner");
    await owner.investors.setAgreementsInApp({ shown: false });
    try {
      // Signed in again: every request reads the farm as it is then.
      const portal = await signedInAs(them.loginEmail, JANUARY);
      const theirs = await portal.portal.agreementOffers();
      expect(theirs.map((one) => one.id)).toContain(id);
      await portal.portal.withdrawAgreement({
        kind: "agreement_offer",
        offerId: id,
      });
      const withdrawnNow = await ownersOffer(ventureId, id);
      expect(withdrawnNow?.agreedAt).toBeNull();
      // Nothing waiting on them while it is off: what they have not agreed to is not shown.
      const left = await portal.portal.agreementOffers();
      expect(left.map((one) => one.id)).not.toContain(id);
    } finally {
      await owner.investors.setAgreementsInApp({ shown: true });
    }
  });

  it("keeps one withdrawal in the trail when the Owner withdraws an offer twice at once", async () => {
    const them = await invited("দুবার মালিক");
    const { id } = await agreedOffer(them, "দুবার মালিক");
    const owner = await as("owner", LATER);
    await Promise.all([
      owner.ventures.agreements.offers.withdraw({ offerId: id }),
      owner.ventures.agreements.offers.withdraw({ offerId: id }),
    ]);

    const trail = await owner.audit.list({
      entity: "agreement_offer",
      limit: 100,
    });
    const withdrawals = trail.filter(
      (one) =>
        one.entityId === id &&
        (one.after as { withdrawnAt?: unknown } | null)?.withdrawnAt
    );
    expect(withdrawals).toHaveLength(1);
  });

  it("settles the Owner taking an offer back and approving it at once in one way or the other, never an error", async () => {
    const owner = await as("owner", LATER);
    const outcomes = [];
    for (const [n, gap] of [0, 5, -5].entries()) {
      // oxlint-disable-next-line no-await-in-loop
      const them = await invited(`মালিক একসাথে ${n}`);
      // oxlint-disable-next-line no-await-in-loop
      const { ventureId, id } = await agreedOffer(them, `মালিক একসাথে ${n}`);
      // oxlint-disable-next-line no-await-in-loop
      const [approved, withdrawn] = await Promise.allSettled([
        after(-gap).then(() =>
          owner.ventures.agreements.offers.approve({ offerId: id })
        ),
        after(gap).then(() =>
          owner.ventures.agreements.offers.withdraw({ offerId: id })
        ),
      ]);
      // oxlint-disable-next-line no-await-in-loop
      const offer = await ownersOffer(ventureId, id);
      outcomes.push({
        approved: wordOf(approved),
        withdrawn: wordOf(withdrawn),
        standing: offer?.standing,
      });
    }
    for (const outcome of outcomes) {
      expect([
        {
          approved: "done",
          withdrawn: "offer_already_approved",
          standing: "approved",
        },
        {
          approved: "offer_withdrawn",
          withdrawn: "done",
          standing: "withdrawn",
        },
      ]).toContainEqual(outcome);
    }
  });

  it("settles a withdrawal and an approval sent at once in one way or the other, never both", async () => {
    const owner = await as("owner", LATER);
    const outcomes = [];
    // Sent a few milliseconds apart, each way about, so that some land while the other is under way.
    const apart = [0, 5, 10, 20, 40, -2, -4, -6, -8, -10, -12, -15];
    for (const [n, gap] of apart.entries()) {
      // oxlint-disable-next-line no-await-in-loop
      const them = await invited(`একসাথে ${n}`);
      // oxlint-disable-next-line no-await-in-loop
      const { ventureId, id } = await agreedOffer(them, `একসাথে ${n}`);
      // oxlint-disable-next-line no-await-in-loop
      const [approved, withdrawn] = await Promise.allSettled([
        after(-gap).then(() =>
          owner.ventures.agreements.offers.approve({ offerId: id })
        ),
        after(gap).then(() =>
          them.client.portal.withdrawAgreement({
            kind: "agreement_offer",
            offerId: id,
          })
        ),
      ]);
      // oxlint-disable-next-line no-await-in-loop
      const offer = await ownersOffer(ventureId, id);
      // oxlint-disable-next-line no-await-in-loop
      const agreements = await scratchDb().query.investmentAgreement.findMany({
        where: { ventureId },
        columns: { id: true },
      });
      outcomes.push({
        approved: wordOf(approved),
        withdrawn: wordOf(withdrawn),
        standing: offer?.standing,
        agreements: agreements.length,
      });
    }
    // Either the approval came first and the withdrawal was refused by name, or the other way round — never an error,
    // never both, and never an Agreement left behind by an approval that was refused.
    for (const outcome of outcomes) {
      expect([
        {
          approved: "done",
          withdrawn: "offer_already_approved",
          standing: "approved",
          agreements: 1,
        },
        {
          approved: "offer_not_agreed",
          withdrawn: "done",
          standing: "offered",
          agreements: 0,
        },
      ]).toContainEqual(outcome);
    }
  });
});

/** A Venture with two Investors signed on stamp, and an Amendment offered on it that both have agreed to with a code. */
const anAgreedAmendment = async (name: string) => {
  const owner = await as("owner");
  const ventureId = await aVenture(name);
  const both = [await invited(`${name} ১`), await invited(`${name} ২`)];
  for (const them of both) {
    // oxlint-disable-next-line no-await-in-loop
    await owner.ventures.agreements.sign({
      ventureId,
      investorId: them.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `মাওলানা সালিস ${suffix}`,
      stampValueMoney: 300,
      stampedOn: "2097-01-01",
      stampSerial: `AA ${them.id.slice(-8)}`,
    });
  }
  const { id, paperHash } = await owner.ventures.agreements.amendments.propose({
    ventureId,
    investorsPercent: 65,
    targetWindowStart: "2097-06-05",
    targetWindowEnd: "2097-06-15",
    reason: `ঈদ পিছিয়েছে ${suffix}`,
  });
  for (const them of both) {
    // oxlint-disable-next-line no-await-in-loop
    const code = await aSigningCode(them, "amendment_offer", id);
    // oxlint-disable-next-line no-await-in-loop
    await them.client.portal.agreeToAmendment({ offerId: id, paperHash, code });
  }
  const [first] = both;
  if (!first) {
    throw new Error("expected two Investors");
  }
  return { ventureId, id, paperHash, both, first };
};

/** The Amendment as the Owner reads it on the Venture. */
const ownersAmendment = async (ventureId: string, offerId: string) => {
  const owner = await as("owner");
  const offers = await owner.ventures.agreements.amendments.list({ ventureId });
  return offers.find((one) => one.id === offerId);
};

describe("an agreement to an Amendment withdrawn before it is approved", () => {
  it("counts as not agreed, says who withdrew it, cannot be approved, and may be given again", async () => {
    const { ventureId, id, paperHash, first } =
      await anAgreedAmendment("সংশোধন ফেরত");

    await first.client.portal.withdrawAgreement({
      kind: "amendment_offer",
      offerId: id,
    });

    expect(await ownersAmendment(ventureId, id)).toMatchObject({
      agreed: 1,
      of: 2,
      withdrawals: [{ investorId: first.id, withdrawnAt: new Date(JANUARY) }],
    });
    const owner = await as("owner", LATER);
    expect(
      await refusalOf(
        owner.ventures.agreements.amendments.approve({ offerId: id })
      )
    ).toBe("amendment_not_agreed");
    const theirs = await first.client.portal.amendmentOffers();
    expect(theirs.find((one) => one.id === id)?.agreedAt).toBeNull();
    // Their Data Copy keeps the agreement they took back, and when.
    const { document } = await owner.investors.dataCopy({ id: first.id });
    expect(paperText(document, "en")).toContain(
      "you withdrew your agreement of 1 January 2097"
    );

    const later = await signedInAs(first.loginEmail, LATER);
    await later.portal.agreeToAmendment({
      offerId: id,
      paperHash,
      code: await aSigningCode(
        { client: later, phone: first.phone },
        "amendment_offer",
        id
      ),
    });
    await owner.ventures.agreements.amendments.approve({ offerId: id });
    const approved = await ownersAmendment(ventureId, id);
    expect(approved?.standing).toBe("approved");
  });

  it("is refused once the Owner has approved the Amendment", async () => {
    const { id, first } = await anAgreedAmendment("সংশোধন অনুমোদিত");
    const owner = await as("owner", LATER);
    await owner.ventures.agreements.amendments.approve({ offerId: id });

    expect(
      await refusalOf(
        first.client.portal.withdrawAgreement({
          kind: "amendment_offer",
          offerId: id,
        })
      )
    ).toBe("offer_already_approved");
  });

  it("settles a withdrawal and an approval sent at once in one way or the other, never both", async () => {
    const owner = await as("owner", LATER);
    const outcomes = [];
    for (const [n, gap] of [0, 10, -5, -10].entries()) {
      // oxlint-disable-next-line no-await-in-loop
      const { ventureId, id, first } = await anAgreedAmendment(
        `সংশোধন একসাথে ${n}`
      );
      // oxlint-disable-next-line no-await-in-loop
      const [approved, withdrawn] = await Promise.allSettled([
        after(-gap).then(() =>
          owner.ventures.agreements.amendments.approve({ offerId: id })
        ),
        after(gap).then(() =>
          first.client.portal.withdrawAgreement({
            kind: "amendment_offer",
            offerId: id,
          })
        ),
      ]);
      // oxlint-disable-next-line no-await-in-loop
      const amendment = await ownersAmendment(ventureId, id);
      outcomes.push({
        approved: wordOf(approved),
        withdrawn: wordOf(withdrawn),
        standing: amendment?.standing,
        agreed: amendment?.agreed,
      });
    }
    for (const outcome of outcomes) {
      expect([
        {
          approved: "done",
          withdrawn: "offer_already_approved",
          standing: "approved",
          agreed: 2,
        },
        {
          approved: "amendment_not_agreed",
          withdrawn: "done",
          standing: "offered",
          agreed: 1,
        },
      ]).toContainEqual(outcome);
    }
  });

  it("is refused once the Owner has taken the Amendment back", async () => {
    const { ventureId, id, first } = await anAgreedAmendment("সংশোধন বন্ধ");
    const owner = await as("owner", LATER);
    await owner.ventures.agreements.amendments.withdraw({ offerId: id });

    expect(
      await refusalOf(
        first.client.portal.withdrawAgreement({
          kind: "amendment_offer",
          offerId: id,
        })
      )
    ).toBe("offer_withdrawn");
    const closed = await ownersAmendment(ventureId, id);
    expect(closed?.agreed).toBe(2);
  });

  it("changes nothing, and writes nothing to the trail, when withdrawn again", async () => {
    const { id, first } = await anAgreedAmendment("সংশোধন দুবার");
    const withdraw = () =>
      first.client.portal.withdrawAgreement({
        kind: "amendment_offer",
        offerId: id,
      });
    await withdraw();
    await withdraw();

    const owner = await as("owner");
    const trail = await owner.audit.list({
      entity: "amendment_offer",
      limit: 100,
    });
    const withdrawals = trail.filter(
      (one) =>
        one.entityId === id &&
        one.actorId === first.userId &&
        (one.reason ?? "").includes("withdrew")
    );
    expect(withdrawals).toHaveLength(1);
  });

  it("settles the Owner withdrawing the Amendment and approving it at once in one way or the other, never an error", async () => {
    const owner = await as("owner", LATER);
    const outcomes = [];
    for (const [n, gap] of [0, 5, -5].entries()) {
      // oxlint-disable-next-line no-await-in-loop
      const { ventureId, id } = await anAgreedAmendment(`সংশোধন মালিক ${n}`);
      // oxlint-disable-next-line no-await-in-loop
      const [approved, withdrawn] = await Promise.allSettled([
        after(-gap).then(() =>
          owner.ventures.agreements.amendments.approve({ offerId: id })
        ),
        after(gap).then(() =>
          owner.ventures.agreements.amendments.withdraw({ offerId: id })
        ),
      ]);
      // oxlint-disable-next-line no-await-in-loop
      const amendment = await ownersAmendment(ventureId, id);
      outcomes.push({
        approved: wordOf(approved),
        withdrawn: wordOf(withdrawn),
        standing: amendment?.standing,
      });
    }
    for (const outcome of outcomes) {
      expect([
        {
          approved: "done",
          withdrawn: "offer_already_approved",
          standing: "approved",
        },
        {
          approved: "offer_withdrawn",
          withdrawn: "done",
          standing: "withdrawn",
        },
      ]).toContainEqual(outcome);
    }
  });
});
