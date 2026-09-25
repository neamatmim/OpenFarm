import type { PaperDocument, PaperSection } from "@OpenFarm/domain";
import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The Investment Agreement handled inside the farm's own system: printed from the terms before it is signed, and
// its stamp duty paid by e-challan as well as on stamp paper.

const suffix = `to-sign-${Date.now()}`;
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

/** One part of a laid-out paper, by its kind. */
const partOf = <Kind extends PaperSection["kind"]>(
  document: PaperDocument,
  kind: Kind
): Extract<PaperSection, { kind: Kind }> => {
  const found = document.sections.find(
    (section): section is Extract<PaperSection, { kind: Kind }> =>
      section.kind === kind
  );
  if (!found) {
    throw new Error(`the paper has no ${kind} part`);
  }
  return found;
};

const terms = () => ({
  ventureId,
  investorId,
  units: 3,
  investorsPercent: 60,
  arbitrator: ARBITRATOR,
});

describe("the Investment Agreement, laid out to be signed", () => {
  it("names both parties, the Venture, his Units and capital, and the seven terms", async () => {
    const { client: owner } = await as("owner");

    const { document } =
      await owner.investorStatements.agreementToSign(terms());

    expect(document.title.bn).toBe("মুদারাবা বিনিয়োগ চুক্তি");
    const parties = partOf(document, "parties");
    expect(parties.parties.map((one) => one.role.en)).toEqual([
      "First party — Mudarib",
      "Second party — Investor",
    ]);
    const said = JSON.stringify(document);
    expect(said).toContain(HIM);
    expect(said).toContain(`ভেঞ্চার ${suffix}`);
    // Three Units at fifty thousand, in the paper's own Bangla numerals.
    expect(said).toContain("১,৫০,০০০ টাকা");
    // The terms unnumbered — the page numbers them — and the joining letter's own words.
    const { clauses } = partOf(document, "clauses");
    expect(clauses).toHaveLength(7);
    expect(clauses[1]?.bn).toContain("বিনিয়োগকারী ৬০% এবং খামার ৪০%");
    expect(clauses[1]?.en).toContain("60% to the Investor");
    expect(clauses[6]?.bn).toContain(ARBITRATOR);
    expect(
      partOf(document, "signatures").signers.map((one) => one.name)
    ).toContain(HIM);
  });

  it("prints no warning on the paper, and tells the screen the wording is not yet reviewed", async () => {
    const { client: owner } = await as("owner");

    const { document, wording } =
      await owner.investorStatements.agreementToSign(terms());

    expect(wording.reviewedOn).toBeNull();
    expect(JSON.stringify(document)).not.toMatch(/draft|খসড়া/iu);
  });

  it("is the Owner's alone to print", async () => {
    const { client: manager } = await as("manager");

    await expect(
      manager.investorStatements.agreementToSign(terms())
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("says in its data section and under the Investor what the farm keeps of him", async () => {
    const { client: owner } = await as("owner");

    const { document } =
      await owner.investorStatements.agreementToSign(terms());

    const data = document.sections.find(
      (section) => section.heading.en === "Data"
    );
    expect(data?.kind === "clauses" && data.clauses).toHaveLength(6);
    const [, him] = partOf(document, "parties").parties;
    expect(him?.lines.map((line) => line.en)).toEqual([
      expect.stringContaining("their nominee knows"),
      expect.stringContaining("The nominee is under eighteen"),
    ]);
  });
});

/** Who keeps the farm's records, as «আপনার তথ্য» names them. */
const KEEPERS = {
  dataHost: `হেটজনার ${suffix}`,
  backupStore: "ব্যাকব্লেজ",
  backupCountry: "নেদারল্যান্ডস",
};

describe("«আপনার তথ্য», handed over with the Agreement", () => {
  it("is not printed while it names a fact the farm has not written down", async () => {
    const { client: owner } = await as("owner");

    await expect(
      owner.investorStatements.noticeToHand({ ventureId, investorId })
    ).rejects.toMatchObject({ data: { refusal: "notice_unwritten" } });
  });

  it("is the notice in force, in Bangla, with who keeps the farm's records named", async () => {
    const { client: owner } = await as("owner");
    await owner.farm.setDataKeepers(KEEPERS);

    const { document, wording } = await owner.investorStatements.noticeToHand({
      ventureId,
      investorId,
    });

    expect(document.title).toEqual({
      bn: "আপনার তথ্য খামার কীভাবে রাখে",
      en: "How the farm keeps your data",
    });
    expect(JSON.stringify(document)).toContain(KEEPERS.dataHost);
    expect(document.preamble.en).toBe("");
    expect(wording.number).toBe(1);
  });

  it("is an Export on the Investor it was handed to, naming the Venture he was signing for", async () => {
    const { client: owner } = await as("owner");

    await owner.investorStatements.noticeToHand({ ventureId, investorId });

    const trail = await owner.audit.list({ entity: "investor", limit: 50 });
    const handed = trail.find(
      (one) =>
        one.entityId === investorId &&
        one.action === "export" &&
        (one.after as { paper?: string } | null)?.paper === "privacy_notice"
    );
    expect(handed).toMatchObject({
      actorId: thePerson("owner").id,
      after: expect.objectContaining({ ventureId, wording: 1 }),
    });
  });

  it("is the Owner's alone to print", async () => {
    const { client: manager } = await as("manager");

    await expect(
      manager.investorStatements.noticeToHand({ ventureId, investorId })
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
