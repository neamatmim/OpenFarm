import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Investment Agreement handled inside the farm's own system: printed from the terms before it is signed, and
// its stamp duty paid by e-challan as well as on stamp paper.

const suffix = `draft-${Date.now()}`;
const JANUARY = "2052-01-01T04:00:00.000Z";

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(JANUARY) });

let ventureId = "";
let investorId = "";
const HIM = `আব্দুল করিম ${suffix}`;
const ARBITRATOR = `মাওলানা সালিস ${suffix}`;

beforeAll(async () => {
  const { client: owner } = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000098",
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
  const him = await owner.investors.record({
    name: HIM,
    phone: "01977000021",
    address: `সাভার, ঢাকা ${suffix}`,
    nid: "1234567899",
    bankAccount: "0123456780",
  });
  investorId = him.id;
});

const terms = () => ({
  ventureId,
  investorId,
  units: 3,
  investorsPercent: 60,
  arbitrator: ARBITRATOR,
});

describe("the Investment Agreement, printed to be signed", () => {
  it("names both parties, the Venture, his Units and capital, and the seven terms", async () => {
    const { client: owner } = await as("owner");

    const { text } = await owner.investorStatements.agreementDraft(terms());

    expect(text).toContain("মুদারাবা বিনিয়োগ চুক্তি");
    expect(text).toContain(HIM);
    expect(text).toContain(`ভেঞ্চার ${suffix}`);
    expect(text).toContain(ARBITRATOR);
    // Three Units at fifty thousand, in the owner's own numerals.
    expect(text).toContain("১,৫০,০০০ টাকা");
    expect(text).toContain("বিনিয়োগকারী ৬০% এবং খামার ৪০%");
    expect(text).toContain("স্ট্যাম্প বা ই-চালান");
  });

  it("says it is a draft, not to be signed, until a lawyer approves the wording", async () => {
    const { client: owner } = await as("owner");

    const { text } = await owner.investorStatements.agreementDraft(terms());

    expect(text).toContain("DRAFT — not to be signed until a lawyer approves");
  });

  it("is the Owner's alone to print", async () => {
    const { client: manager } = await as("manager");

    await expect(
      manager.investorStatements.agreementDraft(terms())
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("stamp duty paid by e-challan", () => {
  it("is kept against the Agreement, and the joining letter says it by its challan number", async () => {
    const { client: owner } = await as("owner");
    const signed = await owner.ventures.sign({
      ...terms(),
      stampKind: "e_challan",
      stampValueBdt: 300,
      stampedOn: "2052-01-02",
      stampSerial: `2324-${suffix}`,
    });
    await owner.ventures.keepAgreementPaper({
      agreementId: signed.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.ventures.takeCapital({
      agreementId: signed.id,
      amountBdt: 150_000,
      movedOn: "2052-01-03",
      paymentMethod: "bank",
      reference: `TRF-${suffix}`,
    });

    const agreements = await owner.ventures.agreements({ ventureId });
    const { text } = await owner.investorStatements.joining({
      agreementId: signed.id,
    });

    expect(agreements.find((one) => one.id === signed.id)?.stamp.kind).toBe(
      "e_challan"
    );
    expect(text).toContain(`ই-চালান নম্বর / e-challan no.: 2324-${suffix}`);
    expect(text).not.toContain("স্ট্যাম্প সিরিয়াল");
  });
});
