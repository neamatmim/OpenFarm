import type { Nominee } from "@OpenFarm/domain";
import { paperText } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import {
  aSigningCode,
  invitingInvestors,
  textsKept,
  textsTo,
} from "../test/portal-client";
import { appRouter } from "./index";

// A মনোনয়নপত্র offered in the app (ADR 0022): the Owner writes the Nominees as for paper and offers it, the Investor
// reads it in the portal and agrees with a Signing Code, and the Owner approves it — and only then is it the list in
// force. One naming a minor stays on paper, as the market does.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2098-01-01T04:00:00.000Z";
const LATER = "2098-01-02T04:00:00.000Z";

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

/** A grown Nominee with their NID, taking the whole share. */
const WIFE: Nominee = {
  name: `রহিমা বেগম ${suffix}`,
  relation: "স্ত্রী",
  phone: "01712-345678",
  bornOn: "1982-03-14",
  nid: "1982 4417 2093",
  birthRegistration: null,
  sharePercent: 100,
  receiver: null,
};

/** Offered by the Owner, read in the portal and agreed by them with the code they were texted. */
const offeredAndAgreed = async (them: Them, nominees: Nominee[] = [WIFE]) => {
  const owner = await as("owner");
  const { id, paperHash } = await owner.investors.offerNomination({
    id: them.id,
    nominees,
  });
  const theirs = await them.client.portal.nominationOffers();
  expect(theirs.map((one) => one.id)).toContain(id);
  await them.client.portal.agreeToNomination({
    offerId: id,
    paperHash,
    code: await aSigningCode(them, "nomination_offer", id),
  });
  return { id, paperHash };
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000094",
    registrationNumber: `DLS/SAV/2098/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2100-03-31",
  });
  // What the privacy notice names, so a Data Copy can be made.
  await owner.farm.setDataKeepers({
    dataHost: `হোস্ট ${suffix}`,
    backupStore: `ব্যাকআপ ${suffix}`,
    backupCountry: "জার্মানি",
  });
  await owner.investors.setPortalOpen({ open: true });
  await owner.investors.setAgreementsInApp({ shown: true });
});

describe("a মনোনয়নপত্র offered in the app", () => {
  it("is the list in force once agreed with a code and approved, made in the app on the day agreed, with no photo", async () => {
    const them = await invited("মনোনয়ন অ্যাপে");
    const { id } = await offeredAndAgreed(them);

    const owner = await as("owner", LATER);
    await owner.investors.approveNominationOffer({ offerId: id });

    const [inForce] = await owner.investors.nominations({ id: them.id });
    expect(inForce).toMatchObject({
      how: "in_app",
      signedOn: "2098-01-01",
      hasPhoto: false,
      nominees: [{ name: WIFE.name, sharePercent: 100 }],
    });
    const offers = await owner.investors.nominationOffers({ id: them.id });
    expect(offers.find((one) => one.id === id)).toMatchObject({
      standing: "approved",
      proof: { channel: "sms" },
    });
    // Their Data Copy keeps it, with how it was sealed.
    const { document } = await owner.investors.dataCopy({ id: them.id });
    const said = paperText(document, "en");
    expect(said).toContain("মনোনয়নপত্র agreed in the app");
    expect(said).toContain("the code came by text");
  });

  it("is not offered naming a minor, whose Receiver signs on paper, nor to an Organization, which names none", async () => {
    const them = await invited("মনোনয়ন নাবালক");
    const owner = await as("owner");
    const daughter: Nominee = {
      name: `সাদিয়া আক্তার ${suffix}`,
      relation: "মেয়ে",
      phone: null,
      bornOn: "2090-11-20",
      nid: null,
      birthRegistration: "20902691507114382",
      sharePercent: 50,
      receiver: {
        name: WIFE.name,
        relation: "মা",
        phone: null,
        nid: "1982 4417 2093",
      },
    };
    expect(
      await refusalOf(
        owner.investors.offerNomination({
          id: them.id,
          nominees: [{ ...WIFE, sharePercent: 50 }, daughter],
        })
      )
    ).toBe("minor_signs_on_paper");

    const company = await owner.investors.record({
      kind: "organization",
      name: `পদ্মা ট্রেডার্স ${suffix}`,
      phone: `0195${suffix}9`,
      authority: "পরিচালনা পর্ষদের সিদ্ধান্ত",
      signatoryName: `মো. করিম ${suffix}`,
    });
    expect(
      await refusalOf(
        owner.investors.offerNomination({ id: company.id, nominees: [WIFE] })
      )
    ).toBe("organization_names_no_nominee");
  });

  it("is one at a time for an Investor, and the Owner may take it back", async () => {
    const them = await invited("মনোনয়ন একটি");
    const owner = await as("owner");
    const { id } = await owner.investors.offerNomination({
      id: them.id,
      nominees: [WIFE],
    });
    expect(
      await refusalOf(
        owner.investors.offerNomination({ id: them.id, nominees: [WIFE] })
      )
    ).toBe("nomination_offer_standing");

    await owner.investors.withdrawNominationOffer({ offerId: id });
    expect(await them.client.portal.nominationOffers()).toEqual([]);
    expect(
      await refusalOf(owner.investors.approveNominationOffer({ offerId: id }))
    ).toBe("offer_withdrawn");
    await owner.investors.offerNomination({ id: them.id, nominees: [WIFE] });
  });

  it("may be withdrawn by the Investor until it is approved, and then cannot be approved", async () => {
    const them = await invited("মনোনয়ন ফেরত");
    const { id } = await offeredAndAgreed(them);
    await them.client.portal.withdrawAgreement({
      kind: "nomination_offer",
      offerId: id,
    });

    const owner = await as("owner", LATER);
    expect(
      await refusalOf(owner.investors.approveNominationOffer({ offerId: id }))
    ).toBe("offer_not_agreed");
    const offers = await owner.investors.nominationOffers({ id: them.id });
    expect(offers.find((one) => one.id === id)).toMatchObject({
      standing: "offered",
      agreementWithdrawnAt: new Date(JANUARY),
      proof: null,
    });
    expect(await owner.investors.nominations({ id: them.id })).toEqual([]);
  });

  it("is told to them by text once approved, by its number", async () => {
    const them = await invited("মনোনয়ন খবর");
    const { id, paperHash } = await offeredAndAgreed(them);
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock: new FakeClock(LATER),
      sms: textsKept,
    });
    await owner.investors.approveNominationOffer({ offerId: id });

    // The code came in good Bangla: «মনোনয়নপত্রে», not «মনোনয়নপত্রতে».
    expect(textsTo(them.phone).at(-2)?.text).toContain("মনোনয়নপত্রে সম্মতির কোড");
    const told = textsTo(them.phone).at(-1)?.text ?? "";
    expect(told).toContain(paperHash.slice(0, 12).toUpperCase());
    expect(told).toContain("মনোনয়নপত্র");
    expect(told).not.toContain("()");
  });

  it("is not approved for an Investor retired since it was offered, who signs nothing new", async () => {
    const them = await invited("মনোনয়ন অবসর");
    const { id } = await offeredAndAgreed(them);
    const owner = await as("owner", LATER);
    await owner.investors.retire({ id: them.id });

    expect(
      await refusalOf(owner.investors.approveNominationOffer({ offerId: id }))
    ).toBe("investor_retired");
    expect(await owner.investors.nominations({ id: them.id })).toEqual([]);
  });

  it("is approved in the offer's own trail, by whom and into which Nomination", async () => {
    const them = await invited("মনোনয়ন খাতা");
    const { id } = await offeredAndAgreed(them);
    const owner = await as("owner", LATER);
    const { nominationId } = await owner.investors.approveNominationOffer({
      offerId: id,
    });

    const trail = await owner.audit.list({
      entity: "nomination_offer",
      limit: 100,
    });
    const approval = trail.find(
      (one) =>
        one.entityId === id &&
        (one.after as { nominationId?: string } | null)?.nominationId ===
          nominationId
    );
    expect(approval).toBeDefined();
  });

  it("refuses a second offer sent at the same moment by name, as one at a time", async () => {
    const them = await invited("মনোনয়ন একসাথে");
    const owner = await as("owner");
    const [first, second] = await Promise.allSettled([
      owner.investors.offerNomination({ id: them.id, nominees: [WIFE] }),
      owner.investors.offerNomination({ id: them.id, nominees: [WIFE] }),
    ]);
    const words = [first, second].map((one) =>
      one.status === "fulfilled"
        ? "done"
        : (one.reason as { data?: { refusal?: string } }).data?.refusal
    );
    expect(words.toSorted()).toEqual(["done", "nomination_offer_standing"]);
  });
});
