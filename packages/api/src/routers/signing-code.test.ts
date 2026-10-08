import { eq } from "@OpenFarm/db/operators";
import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import { signingCode } from "@OpenFarm/db/schema/venture";
import {
  PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE,
  inLanguage,
  paperText,
} from "@OpenFarm/domain";
import {
  FakeClock,
  asTheFarmHeldItBefore,
  scratchDb,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { EmailMessage, EmailTransport } from "../email";
import { silentSms } from "../sms";
import { createTestClient } from "../test/client";
import {
  codeTextedTo,
  invitingInvestors,
  signedInAs,
  textsKept,
  textsTo,
} from "../test/portal-client";
import { appRouter } from "./index";

// A paper agreed in the app is sealed by a one-time code (ADR 0022): the farm sends one by text and another to a
// confirmed email, entering either seals it, and the farm keeps its proof — and tells them once the Owner approves.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2096-01-01T04:00:00.000Z";
const A_MINUTE_LATER = "2096-01-01T04:01:00.000Z";
const ELEVEN_MINUTES_LATER = "2096-01-01T04:11:00.000Z";

const as = async (role: "owner" | "manager", at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
    // The Owner's approval texts its confirmation through the tests' own outbox.
    sms: textsKept,
  });
  return client;
};

const invited = invitingInvestors({ prefix: "016", run: suffix }, JANUARY);
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

/** A mail account that keeps what it was given. */
const anOutbox = () => {
  const sent: { to: string; message: EmailMessage }[] = [];
  const transport: EmailTransport = {
    sends: true,
    send: (to, message) => {
      sent.push({ to, message });
      return Promise.resolve({ delivered: true });
    },
  };
  return { sent, transport };
};

/** A Venture of ten Units, still open, and an Agreement offered on it to them: the offer as they read it. */
const offeredTo = async (them: Them, name: string) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2096-01-20",
    targetWindowStart: "2096-06-01",
    targetWindowEnd: "2096-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  const { id } = await owner.ventures.agreements.offers.make({
    ventureId: venture.id,
    investorId: them.id,
    units: 2,
    investorsPercent: 60,
    arbitrator: `মাওলানা সালিস ${suffix}`,
  });
  const offers = await them.client.portal.agreementOffers();
  const offer = offers.find((one) => one.id === id);
  if (!offer) {
    throw new Error("expected the offer in their portal");
  }
  return { ventureId: venture.id, offer };
};

/** Their offer agreed with the code they were sent, through the client given. */
const agreesWith = (
  client: Them["client"],
  offer: { id: string; paperHash: string },
  code: string
) =>
  client.portal.agreeToOffer({
    offerId: offer.id,
    paperHash: offer.paperHash,
    code,
  });

const sendFor = (client: Them["client"], offerId: string) =>
  client.portal.sendSigningCode({ kind: "agreement_offer", offerId });

/** The offer as the Owner reads it on the Venture, with its proof. */
const ownersOffer = async (ventureId: string, offerId: string) => {
  const owner = await as("owner");
  const offers = await owner.ventures.agreements.offers.list({ ventureId });
  return offers.find((one) => one.id === offerId);
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000096",
    registrationNumber: `DLS/SAV/2096/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2098-03-31",
  });
  // What the privacy notice names, so the Data Copy can be made.
  await owner.farm.setDataKeepers({
    dataHost: `হোস্ট ${suffix}`,
    backupStore: `ব্যাকআপ ${suffix}`,
    backupCountry: "জার্মানি",
  });
  await owner.investors.setPortalOpen({ open: true });
  await owner.investors.setAgreementsInApp({ shown: true });
});

describe("a Signing Code", () => {
  it("seals an Agreement Offer by text, and the farm keeps its proof and tells them once it is approved", async () => {
    const them = await invited("কোড এসএমএস");
    const { ventureId, offer } = await offeredTo(them, "কোড এসএমএস");

    const sent = await sendFor(them.client, offer.id);
    expect(sent).toEqual({
      bySms: expect.stringContaining("••"),
      byEmail: null,
      minutes: 10,
    });
    const text = textsTo(them.phone).at(-1)?.text ?? "";
    expect(text).toContain("সম্মতির কোড");
    await expect(
      agreesWith(
        them.client,
        offer,
        codeTextedTo(them.phone) === "000000" ? "111111" : "000000"
      )
    ).rejects.toMatchObject({ data: { refusal: "wrong_code" } });
    await agreesWith(them.client, offer, codeTextedTo(them.phone));

    const agreed = await ownersOffer(ventureId, offer.id);
    expect(agreed?.standing).toBe("agreed");
    expect(agreed?.proof).toMatchObject({
      investorId: them.id,
      channel: "sms",
      sentTo: sent.bySms,
      paperHash: offer.paperHash,
      agreedAt: new Date(JANUARY),
      confirmedAt: null,
    });
    const owner = await as("owner");
    await owner.ventures.agreements.offers.approve({ offerId: offer.id });
    const approvedText = textsTo(them.phone).at(-1)?.text ?? "";
    expect(approvedText).toContain(offer.paperHash.slice(0, 12).toUpperCase());
    expect(approvedText).toContain("অনুমোদন");
    const approved = await ownersOffer(ventureId, offer.id);
    expect(approved?.proof).toMatchObject({
      confirmedAt: new Date(JANUARY),
      confirmedBySms: true,
      confirmedByEmail: false,
    });
    // The copy of the paper, and the Data Copy, say how it was sealed.
    const { document } = await owner.investorStatements.agreementCopy({
      agreementId: approved?.agreementId ?? "",
    });
    expect(inLanguage(document.copyOf ?? "", "en")).toContain(
      "Agreed 1 January 2096 with a code sent by text"
    );
    const { document: theirData } = await owner.investors.dataCopy({
      id: them.id,
    });
    const said = paperText(theirData, "en");
    expect(said).toContain(`the code came by text to ${sent.bySms}`);
    expect(said).toContain("told of the approval by text");
  });

  it("seals it by the email code too, and the proof says the code came by email", async () => {
    const them = await invited("কোড ইমেইল");
    const owner = await as("owner");
    await owner.investors.update({
      id: them.id,
      name: `কোড ইমেইল ${suffix}`,
      phone: them.phone,
      address: "সাভার",
      nid: "1234567890",
      bankAccount: `01234${them.phone.slice(-5)}`,
      email: `email-${suffix}@example.com`,
    });
    const outbox = anOutbox();
    const portal = await signedInAs(them.loginEmail, JANUARY, {
      email: outbox.transport,
    });
    await portal.portal.sendEmailCode();
    const confirmation = outbox.sent
      .at(-1)
      ?.message.text.match(/\b\d{6}\b/u)?.[0];
    await portal.portal.confirmEmail({ code: confirmation ?? "" });
    const later = await signedInAs(them.loginEmail, A_MINUTE_LATER, {
      email: outbox.transport,
    });
    const { ventureId, offer } = await offeredTo(them, "কোড ইমেইল");

    const sent = await sendFor(later, offer.id);
    expect(sent.byEmail).toBe("em•••@example.com");
    const byEmail = outbox.sent.at(-1)?.message.text.match(/\b\d{6}\b/u)?.[0];
    // Not the texted one: the code entered says which way it came.
    expect(byEmail).not.toBe(codeTextedTo(them.phone));
    await agreesWith(later, offer, byEmail ?? "");

    const agreed = await ownersOffer(ventureId, offer.id);
    expect(agreed?.proof).toMatchObject({
      channel: "email",
      sentTo: "em•••@example.com",
    });
  });

  it("is refused once it has run out, and for another paper than the one it was sent for", async () => {
    const them = await invited("কোড পুরোনো");
    const { offer } = await offeredTo(them, "কোড পুরোনো");
    const { offer: other } = await offeredTo(them, "কোড অন্য");
    await sendFor(them.client, offer.id);
    const code = codeTextedTo(them.phone);

    expect(await refusalOf(agreesWith(them.client, other, code))).toBe(
      "wrong_code"
    );
    const tooLate = await signedInAs(them.loginEmail, ELEVEN_MINUTES_LATER);
    expect(await refusalOf(agreesWith(tooLate, offer, code))).toBe(
      "code_expired"
    );
  });

  it("is refused once used, as a code used by another try meanwhile is", async () => {
    const them = await invited("কোড ব্যবহৃত");
    const { offer } = await offeredTo(them, "কোড ব্যবহৃত");
    await sendFor(them.client, offer.id);
    // What another try that sealed it a moment before leaves behind.
    await scratchDb()
      .update(signingCode)
      .set({ usedAt: new Date(JANUARY) })
      .where(eq(signingCode.offerId, offer.id));

    expect(
      await refusalOf(agreesWith(them.client, offer, codeTextedTo(them.phone)))
    ).toBe("code_used");
  });

  it("stops anybody guessing after ten wrong — the right one too", async () => {
    const them = await invited("কোড অনুমান");
    const { offer } = await offeredTo(them, "কোড অনুমান");
    await sendFor(them.client, offer.id);
    const right = codeTextedTo(them.phone);
    const wrong = right === "000000" ? "111111" : "000000";

    // One at a time, as a person types them.
    for (let tried = 0; tried < 10; tried += 1) {
      // oxlint-disable-next-line no-await-in-loop
      expect(await refusalOf(agreesWith(them.client, offer, wrong))).toBe(
        "wrong_code"
      );
    }
    expect(await refusalOf(agreesWith(them.client, offer, right))).toBe(
      "too_many_codes"
    );
  });

  it("is sent once a minute for one paper, and not again once they agreed", async () => {
    const them = await invited("কোড বারবার");
    const { offer } = await offeredTo(them, "কোড বারবার");
    await sendFor(them.client, offer.id);

    expect(await refusalOf(sendFor(them.client, offer.id))).toBe(
      "code_sent_just_now"
    );
    const later = await signedInAs(them.loginEmail, A_MINUTE_LATER);
    await sendFor(later, offer.id);
    await agreesWith(later, offer, codeTextedTo(them.phone));
    const evenLater = await signedInAs(them.loginEmail, ELEVEN_MINUTES_LATER);
    expect(await refusalOf(sendFor(evenLater, offer.id))).toBe(
      "already_agreed"
    );
  });

  it("is sent five times an hour at most, a minute apart", async () => {
    const them = await invited("কোড ঘণ্টায়");
    const { offer } = await offeredTo(them, "কোড ঘণ্টায়");
    for (const minute of ["00", "01", "02", "03", "04"]) {
      // oxlint-disable-next-line no-await-in-loop
      const then = await signedInAs(
        them.loginEmail,
        `2096-01-01T04:${minute}:00.000Z`
      );
      // oxlint-disable-next-line no-await-in-loop
      await sendFor(then, offer.id);
    }
    const sixth = await signedInAs(them.loginEmail, "2096-01-01T04:05:00.000Z");
    expect(await refusalOf(sendFor(sixth, offer.id))).toBe(
      "code_sent_just_now"
    );
    const anHourOn = await signedInAs(
      them.loginEmail,
      "2096-01-01T05:00:00.000Z"
    );
    await sendFor(anHourOn, offer.id);
    expect(textsTo(them.phone)).toHaveLength(6);
  });

  it("is not sent to one whose consent has no signing clause, nor where the farm has no way to send it", async () => {
    const old = await invited("কোড পুরোনো সম্মতি");
    const { offer } = await offeredTo(old, "কোড পুরোনো সম্মতি");
    const consent = await scratchDb().query.portalConsent.findFirst({
      where: { investorId: old.id, withdrawnOn: { isNull: true } },
    });
    const version = consent?.versionId ?? "";
    const today = await scratchDb().query.paperTemplateVersion.findFirst({
      where: { id: version },
      columns: { content: true },
    });
    const wordedAs = (content: unknown) =>
      asTheFarmHeldItBefore((tx) =>
        tx
          .update(paperTemplateVersion)
          .set({ content })
          .where(eq(paperTemplateVersion.id, version))
      );
    await wordedAs(PORTAL_CONSENT_BEFORE_SIGNING_CLAUSE);
    try {
      expect(await refusalOf(sendFor(old.client, offer.id))).toBe(
        "no_signing_clause"
      );
    } finally {
      // Put back, so the farm's wording is today's for every other test here.
      await wordedAs(today?.content);
    }

    const unreachable = await invited("কোড পথ নেই");
    const { offer: theirs } = await offeredTo(unreachable, "কোড পথ নেই");
    const noGateway = await signedInAs(unreachable.loginEmail, JANUARY, {
      sms: silentSms,
    });
    expect(await refusalOf(sendFor(noGateway, theirs.id))).toBe(
      "no_way_to_send_a_code"
    );
  });

  it("seals an Amendment for each Investor who agrees, each told once it is approved", async () => {
    const owner = await as("owner");
    const venture = await owner.ventures.open({
      name: `কোড সংশোধন ${suffix}`,
      targetCapitalMoney: 500_000,
      floorMoney: 0,
      decideBy: "2096-01-20",
      targetWindowStart: "2096-06-01",
      targetWindowEnd: "2096-06-10",
      unitPriceMoney: 50_000,
      units: 10,
      cattleBudgetMoney: 400_000,
    });
    const both = [await invited("সংশোধন প্রথম"), await invited("সংশোধন দ্বিতীয়")];
    for (const them of both) {
      // oxlint-disable-next-line no-await-in-loop
      await owner.ventures.agreements.sign({
        ventureId: venture.id,
        investorId: them.id,
        units: 2,
        investorsPercent: 60,
        arbitrator: `মাওলানা সালিস ${suffix}`,
        stampValueMoney: 300,
        stampedOn: "2096-01-01",
        stampSerial: `AA ${them.id.slice(-8)}`,
      });
    }
    const { id, paperHash } =
      await owner.ventures.agreements.amendments.propose({
        ventureId: venture.id,
        investorsPercent: 65,
        targetWindowStart: "2096-06-05",
        targetWindowEnd: "2096-06-15",
        reason: `ঈদ পিছিয়েছে ${suffix}`,
      });
    for (const them of both) {
      // oxlint-disable-next-line no-await-in-loop
      await them.client.portal.sendSigningCode({
        kind: "amendment_offer",
        offerId: id,
      });
      // oxlint-disable-next-line no-await-in-loop
      await them.client.portal.agreeToAmendment({
        offerId: id,
        paperHash,
        code: codeTextedTo(them.phone),
      });
    }
    await owner.ventures.agreements.amendments.approve({ offerId: id });

    const offers = await owner.ventures.agreements.amendments.list({
      ventureId: venture.id,
    });
    const proofs = offers.find((one) => one.id === id)?.proofs ?? [];
    expect(proofs.map((one) => one.investorId).toSorted()).toEqual(
      both.map((them) => them.id).toSorted()
    );
    expect(proofs.every((one) => one.confirmedBySms)).toBe(true);
    for (const them of both) {
      expect(textsTo(them.phone).at(-1)?.text).toContain(
        paperHash.slice(0, 12).toUpperCase()
      );
    }
  });
});
