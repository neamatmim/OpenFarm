import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { farm as farmTable } from "@OpenFarm/db/schema/farm";
import {
  agreementOffer,
  amendmentOffer,
  nomination,
  nominationOffer,
} from "@OpenFarm/db/schema/venture";
import type { Nominee } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { aSigningCode, invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

const AT = "2097-04-10T04:00:00.000Z";
const run = `${Date.now()}`.slice(-6);
const invited = invitingInvestors({ prefix: "018", run }, AT);
const db = scratchDb;
const ownerAt = () =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(AT) });
const nominee: Nominee = {
  name: "রহিমা বেগম",
  relation: "স্ত্রী",
  phone: null,
  bornOn: "1982-03-14",
  nid: "1234567890",
  birthRegistration: null,
  sharePercent: 100,
  receiver: null,
};
const PHOTO = { contentType: "image/jpeg", data: "aGVsbG8=" } as const;

const venture = async () => {
  const { client } = await ownerAt();
  return client.ventures.open({
    name: `Archive ${uuidv7()}`,
    targetCapitalMoney: 500_000,
    floorMoney: 0,
    decideBy: "2097-04-20",
    targetWindowStart: "2097-06-01",
    targetWindowEnd: "2097-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
};
const signs = async (
  ventureId: string,
  investorId: string,
  withPhoto = true
) => {
  const { client } = await ownerAt();
  const signed = await client.ventures.agreements.sign({
    ventureId,
    investorId,
    units: 2,
    investorsPercent: 60,
    arbitrator: "সালিস",
    stampValueMoney: 300,
    stampedOn: "2097-04-01",
    stampSerial: uuidv7(),
    nominees: [nominee],
  });
  if (withPhoto) {
    await client.ventures.agreements.keepPaper({
      agreementId: signed.id,
      ...PHOTO,
    });
  }
  return signed.id;
};

beforeAll(async () => {
  const { client } = await ownerAt();
  await client.farm.setIdentity({
    address: "সাভার, ঢাকা",
    phone: "+8801711000097",
    registrationNumber: `DLS/archive/${run}`,
    registrationOffice: "সাভার",
    registrationExpiresOn: "2100-01-01",
  });
  await client.investors.setPortalOpen({ open: true });
  await client.investors.setAgreementsInApp({ shown: true });
});

describe("the Investor's saved documents", () => {
  it("opens their own stamped Agreement and its nomination, without sending photos or identity numbers in the list", async () => {
    const them = await invited("Own archive");
    const runVenture = await venture();
    const agreementId = await signs(runVenture.id, them.id);
    const list = await them.client.portal.documents();
    expect(list).toContainEqual(
      expect.objectContaining({
        kind: "agreement",
        id: agreementId,
        source: "photo",
      })
    );
    const named = list.find((one) => one.kind === "nomination");
    expect(named).toMatchObject({
      current: true,
      source: "photo",
      nominees: [{ name: nominee.name, sharePercent: 100 }],
    });
    expect(JSON.stringify(list)).not.toContain(PHOTO.data);
    expect(JSON.stringify(list)).not.toContain(nominee.nid);
    expect(
      await them.client.portal.document({ kind: "agreement", id: agreementId })
    ).toMatchObject({ format: "photo", ...PHOTO });
    expect(
      await them.client.portal.document({
        kind: "nomination",
        id: named?.id ?? "",
      })
    ).toMatchObject({ format: "photo", ...PHOTO });
    const stranger = await invited("Other archive");
    for (const one of list) {
      // oxlint-disable-next-line no-await-in-loop -- each guessed identifier must be refused independently
      await expect(
        stranger.client.portal.document({ kind: one.kind, id: one.id })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("keeps missing copies explicit and preserves Agreements after a Venture is canceled", async () => {
    const them = await invited("Missing archive");
    const runVenture = await venture();
    const agreementId = await signs(runVenture.id, them.id, false);
    const { client } = await ownerAt();
    await client.ventures.cancel({
      id: runVenture.id,
      reason: "Not proceeding",
    });
    expect(await them.client.portal.documents()).toContainEqual(
      expect.objectContaining({ id: agreementId, source: null })
    );
    await expect(
      them.client.portal.document({ kind: "agreement", id: agreementId })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      data: { refusal: "no_saved_document" },
    });
    await client.ventures.agreements.keepPaper({ agreementId, ...PHOTO });
    expect(
      await them.client.portal.document({ kind: "agreement", id: agreementId })
    ).toMatchObject({ format: "photo" });
  });

  it("orders current and earlier nominations by the day signed, handles backdating and never calls a carried-over record signed", async () => {
    const them = await invited("Nomination history");
    const { client } = await ownerAt();
    const older = await client.investors.recordNomination({
      id: them.id,
      signedOn: "2097-04-01",
      nominees: [{ ...nominee, name: "Earlier nominee" }],
    });
    const current = await client.investors.recordNomination({
      id: them.id,
      signedOn: "2097-04-09",
      nominees: [nominee],
      ...PHOTO,
    });
    const carriedId = uuidv7();
    await db()
      .insert(nomination)
      .values({
        id: carriedId,
        farmId: theFarm().id,
        investorId: them.id,
        how: "carried_over",
        signedOn: "2097-03-01",
        recordedAt: new Date(AT),
      });
    const list = await them.client.portal.documents();
    expect(list.find((one) => one.id === current.id)).toMatchObject({
      current: true,
      source: "photo",
    });
    expect(list.find((one) => one.id === older.id)).toMatchObject({
      current: false,
      source: null,
    });
    expect(list.find((one) => one.id === carriedId)).toMatchObject({
      current: false,
      source: null,
      carriedOver: true,
    });
  });

  it("reads the exact approved online Agreement and nomination; refuses a stored paper whose fingerprint no longer matches", async () => {
    const them = await invited("Online archive");
    const { client } = await ownerAt();
    const runVenture = await venture();
    const offer = await client.ventures.agreements.offers.make({
      ventureId: runVenture.id,
      investorId: them.id,
      units: 2,
      investorsPercent: 60,
      arbitrator: "সালিস",
      nominees: [nominee],
    });
    expect(await them.client.portal.documents()).toEqual([]);
    const agreementOffers = await them.client.portal.agreementOffers();
    const original = agreementOffers.find((one) => one.id === offer.id)?.paper;
    await them.client.portal.agreeToOffer({
      offerId: offer.id,
      paperHash: offer.paperHash,
      code: await aSigningCode(them, "agreement_offer", offer.id),
    });
    const signed = await client.ventures.agreements.offers.approve({
      offerId: offer.id,
    });
    const opened = await them.client.portal.document({
      kind: "agreement",
      id: signed.agreementId,
    });
    expect(opened).toMatchObject({
      format: "document",
      document: original,
      agreedAt: new Date(AT),
      approvedAt: new Date(AT),
    });
    const offered = await client.investors.offerNomination({
      id: them.id,
      nominees: [{ ...nominee, name: "New nominee" }],
    });
    const nominationOffers = await them.client.portal.nominationOffers();
    const originalNomination = nominationOffers.find(
      (one) => one.id === offered.id
    )?.paper;
    await them.client.portal.agreeToNomination({
      offerId: offered.id,
      paperHash: offered.paperHash,
      code: await aSigningCode(them, "nomination_offer", offered.id),
    });
    const named = await client.investors.approveNominationOffer({
      offerId: offered.id,
    });
    expect(
      await them.client.portal.document({
        kind: "nomination",
        id: named.nominationId,
      })
    ).toMatchObject({ format: "document", document: originalNomination });
    const stranger = await invited("Online stranger");
    await expect(
      stranger.client.portal.document({
        kind: "nomination",
        id: named.nominationId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db()
      .update(agreementOffer)
      .set({ paper: { tampered: true } })
      .where(eq(agreementOffer.id, offer.id));
    await expect(
      them.client.portal.document({ kind: "agreement", id: signed.agreementId })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      data: { refusal: "saved_document_changed" },
    });
    await db()
      .update(nominationOffer)
      .set({ paper: { tampered: true } })
      .where(eq(nominationOffer.id, offered.id));
    await expect(
      them.client.portal.document({
        kind: "nomination",
        id: named.nominationId,
      })
    ).rejects.toMatchObject({ data: { refusal: "saved_document_changed" } });
  });

  it("allows only signatories to a shared paper Amendment, including when another Investor joins the same Venture afterwards", async () => {
    const them = await invited("Amendment party");
    const runVenture = await venture();
    await signs(runVenture.id, them.id);
    const { client } = await ownerAt();
    await client.ventures.agreements.amend({
      ventureId: runVenture.id,
      investorsPercent: 65,
      targetWindowStart: "2097-06-05",
      targetWindowEnd: "2097-06-15",
      reason: "Window changed",
      signedOn: "2097-04-10",
      ...PHOTO,
    });
    const documents = await them.client.portal.documents();
    const amended = documents.find((one) => one.kind === "amendment");
    expect(
      await them.client.portal.document({
        kind: "amendment",
        id: amended?.id ?? "",
      })
    ).toMatchObject({ format: "photo", ...PHOTO });
    const later = await invited("Later party");
    await signs(runVenture.id, later.id);
    const laterDocuments = await later.client.portal.documents();
    expect(laterDocuments.some((one) => one.kind === "amendment")).toBe(false);
    await expect(
      later.client.portal.document({ kind: "amendment", id: amended?.id ?? "" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reopens an approved online Amendment with that Investor's agreement and refuses tampering", async () => {
    const them = await invited("Online amendment party");
    const runVenture = await venture();
    await signs(runVenture.id, them.id);
    const { client } = await ownerAt();
    const offer = await client.ventures.agreements.amendments.propose({
      ventureId: runVenture.id,
      investorsPercent: 65,
      targetWindowStart: "2097-06-05",
      targetWindowEnd: "2097-06-15",
      reason: "Window changed",
    });
    const offers = await them.client.portal.amendmentOffers();
    const original = offers.find((one) => one.id === offer.id);
    if (!original) {
      throw new Error("Expected offered Amendment");
    }
    await them.client.portal.agreeToAmendment({
      offerId: offer.id,
      paperHash: original.paperHash,
      code: await aSigningCode(them, "amendment_offer", offer.id),
    });
    await client.ventures.agreements.amendments.approve({ offerId: offer.id });
    const documents = await them.client.portal.documents();
    const saved = documents.find((one) => one.kind === "amendment");
    if (!saved) {
      throw new Error("Expected saved Amendment");
    }
    expect(
      await them.client.portal.document({ kind: "amendment", id: saved.id })
    ).toMatchObject({
      format: "document",
      document: original.paper,
      agreedAt: new Date(AT),
      approvedAt: new Date(AT),
    });
    const stranger = await invited("Online amendment stranger");
    await expect(
      stranger.client.portal.document({ kind: "amendment", id: saved.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db()
      .update(amendmentOffer)
      .set({ paper: { tampered: true } })
      .where(eq(amendmentOffer.id, offer.id));
    await expect(
      them.client.portal.document({ kind: "amendment", id: saved.id })
    ).rejects.toMatchObject({ data: { refusal: "saved_document_changed" } });
  });

  it("does not cross a farm boundary, even for a Nomination wrongly associated with their Investor id", async () => {
    const them = await invited("Farm boundary");
    const currentFarm = await db().query.farm.findFirst({
      where: { id: theFarm().id },
    });
    if (!currentFarm) {
      throw new Error("Expected test farm");
    }
    const foreignFarmId = uuidv7();
    await db()
      .insert(farmTable)
      .values({ ...currentFarm, id: foreignFarmId });
    const foreignId = uuidv7();
    await db()
      .insert(nomination)
      .values({
        id: foreignId,
        farmId: foreignFarmId,
        investorId: them.id,
        how: "nomination",
        signedOn: "2097-04-10",
        recordedAt: new Date(AT),
      });
    expect(await them.client.portal.documents()).toEqual([]);
    await expect(
      them.client.portal.document({ kind: "nomination", id: foreignId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { client } = await ownerAt();
    await expect(
      client.portalPreview.document({
        investorId: them.id,
        kind: "nomination",
        id: foreignId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("uses the Owner's preview without marking the Investor seen; each opened copy is audited to its real reader", async () => {
    const them = await invited("Preview archive");
    const runVenture = await venture();
    const agreementId = await signs(runVenture.id, them.id);
    const before = await db().query.investorAccess.findFirst({
      where: { investorId: them.id },
    });
    const { client, context } = await ownerAt();
    expect(
      await client.portalPreview.documents({ investorId: them.id })
    ).toEqual(await them.client.portal.documents());
    const seen = await db().query.investorAccess.findFirst({
      where: { investorId: them.id },
    });
    await client.portalPreview.document({
      investorId: them.id,
      kind: "agreement",
      id: agreementId,
    });
    expect(
      await db().query.investorAccess.findFirst({
        where: { investorId: them.id },
      })
    ).toEqual(seen);
    const previewExport = await db().query.auditEvent.findFirst({
      where: { farmId: theFarm().id, entityId: agreementId, action: "export" },
      orderBy: { receivedAt: "desc", id: "desc" },
    });
    expect(previewExport).toMatchObject({
      actorId: context.actor?.id,
      after: {
        investorId: them.id,
        inPreviewOf: them.id,
        documentKind: "agreement",
      },
    });
    await them.client.portal.document({ kind: "agreement", id: agreementId });
    const ownExport = await db().query.auditEvent.findFirst({
      where: { farmId: theFarm().id, entityId: agreementId, action: "export" },
      orderBy: { receivedAt: "desc", id: "desc" },
    });
    expect(ownExport?.actorId).not.toBe(context.actor?.id);
    expect(ownExport?.after).not.toHaveProperty("inPreviewOf");
    expect(before?.investorId).toBe(them.id);
    await expect(client.portal.documents()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(AT),
    });
    await expect(
      manager.portalPreview.documents({ investorId: them.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { client: anonymous } = await createTestClient(appRouter, {
      as: null,
      clock: new FakeClock(AT),
    });
    await expect(
      anonymous.portal.document({ kind: "agreement", id: agreementId })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
