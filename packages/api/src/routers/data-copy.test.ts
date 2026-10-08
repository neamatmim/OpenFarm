import { payInNote } from "@OpenFarm/db/schema/venture-account";
import type { PaperDocument } from "@OpenFarm/domain";
import { inLanguage } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { TRAILED } from "../data-copy";
import { createTestClient } from "../test/client";
import { nominationOnFile, theWhole } from "../test/nominations";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

// «খামারে আপনার তথ্য»: one unmasked paper of everything the farm holds on one Investor, the privacy notice's points
// first, made by the Owner from the Investor's page to answer a written request for a copy. An Export, the Owner's
// alone, and never offered in the portal or the Preview.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2061-01-01T04:00:00.000Z";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

const invited = invitingInvestors({ prefix: "019", run: suffix }, JANUARY);

const KEEPERS = {
  dataHost: `হোস্ট ${suffix}`,
  backupStore: `ব্যাকআপ ${suffix}`,
  backupCountry: "জার্মানি",
};
const NID = `19853012${suffix}`;
/** A moment as the database keeps it, `2061-01-01T04:00:00.000Z`: never on a Bangla paper. */
const ISO_MOMENT = /\d{4}-\d{2}-\d{2}T\d{2}/u;
const BANK = `সোনালী ব্যাংক, সাভার শাখা, হিসাব ০১২৩${suffix}`;
/** A Bangla numeral: never in a figure the farm writes on the English paper. */
const BANGLA_DIGIT = /[০-৯]/u;

/** One part of the paper as it is drawn in one language, a line at a time: a fact's label and what it says, or a
 *  table's cells across. Found by its Bangla heading, or the start of it. */
const drawn = (
  document: PaperDocument,
  heading: string,
  language: Language
): string[] => {
  const section =
    document.sections.find((one) => one.heading.bn === heading) ??
    document.sections.find((one) => one.heading.bn.startsWith(heading));
  if (section?.kind === "facts") {
    return section.rows.map(
      (row) =>
        `${inLanguage(row.label, language)}: ${inLanguage(row.value, language)}`
    );
  }
  if (section?.kind === "table") {
    return section.rows.map((row) =>
      row.map((cell) => inLanguage(cell, language)).join(" | ")
    );
  }
  throw new Error(`expected the part «${heading}»`);
};

/** Their Nominations as the Nominees table draws them: each paper's lines together, the one in force first. */
const nominationsDrawn = (
  document: PaperDocument,
  language: Language
): string[] => {
  const papers: string[] = [];
  for (const line of drawn(document, "আপনার নমিনি", language)) {
    // A line with no paper of its own is another Nominee on the paper above it.
    if (line.startsWith(" | ") || line.startsWith("| ")) {
      papers[papers.length - 1] = `${papers.at(-1) ?? ""}\n${line}`;
    } else {
      papers.push(line);
    }
  }
  return papers;
};

/**
 * An Investor with a history: in the portal, a Request made and changed and answered yes, an Agreement signed with its
 * capital in, papers made for them, and their record put right once. Their id, and the Venture's name.
 */
const withAHistory = async () => {
  const owner = await as("owner");
  const them = await invited("রাশেদ");
  const { people } = await owner.investors.list();
  const phone = people.find((one) => one.id === them.id)?.phone ?? "";
  await owner.investors.update({
    id: them.id,
    name: `রাশেদ ${suffix}`,
    phone,
    address: `আশুলিয়া ${suffix}`,
    nid: NID,
    bankAccount: BANK,
  });
  // His Nominees as they were written down before Nominations, then as he signed them afterwards.
  await nominationOnFile({
    investorId: them.id,
    nominees: [theWhole(`রাশেদের ছেলে ${suffix}`, "ছেলে")],
    signedOn: "2061-01-01",
    recordedAt: new Date(JANUARY),
  });
  await owner.investors.recordNomination({
    id: them.id,
    nominees: [
      {
        ...theWhole(`রাশেদের ছেলে ${suffix}`, "ছেলে"),
        bornOn: "1990-02-03",
        nid: "1990 0203 5546",
        sharePercent: 60,
      },
      {
        ...theWhole(`রাশেদের মেয়ে ${suffix}`, "মেয়ে"),
        bornOn: "2050-04-05",
        birthRegistration: "20502691507114382",
        sharePercent: 40,
        receiver: {
          name: `রাশেদের স্ত্রী ${suffix}`,
          relation: "মা",
          phone: null,
          nid: "1965 0712 3390",
        },
      },
    ],
    signedOn: "2061-01-01",
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  const venture = await owner.ventures.open({
    name: `তথ্যের ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 500_000,
    floorMoney: 50_000,
    decideBy: "2061-01-20",
    targetWindowStart: "2061-06-01",
    targetWindowEnd: "2061-06-10",
    unitPriceMoney: 50_000,
    units: 10,
    cattleBudgetMoney: 400_000,
  });
  await owner.ventures.showInPortal({ id: venture.id, words: "" });
  const { id: requestId } = await them.client.portal.requestToJoin({
    ventureId: venture.id,
    units: 2,
    note: "",
  });
  await them.client.portal.requestToJoin({
    ventureId: venture.id,
    units: 3,
    note: "তিনটি",
  });
  await owner.ventures.requests.answer({
    requestId,
    answer: { kind: "come_and_sign", units: 3 },
  });
  const agreement = await owner.ventures.agreements.sign({
    ventureId: venture.id,
    investorId: them.id,
    units: 3,
    investorsPercent: 60,
    arbitrator: `সালিস ${suffix}`,
    stampKind: "paper",
    stampValueMoney: 300,
    stampedOn: "2061-01-02",
    stampSerial: `S-${suffix}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 150_000,
    movedOn: "2061-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.investors.consentSheet({ id: them.id });
  // What they told the farm they paid, from the portal: as theirs as anything they signed.
  await scratchDb()
    .insert(payInNote)
    .values({
      id: `note-${suffix}`,
      farmId: theFarm().id,
      ventureId: venture.id,
      agreementId: agreement.id,
      investorId: them.id,
      amountMoney: 50_000,
      sentOn: "2061-01-20",
      way: "mobile_money",
      reference: `TrxID ${suffix}`,
      createdAt: new Date("2061-01-20T06:00:00.000Z"),
    });
  return { id: them.id, ventureName: `তথ্যের ভেঞ্চার ${suffix}` };
};

/** The one Investor with a history these tests read, made once: building it is most of the file's time. */
let history: Awaited<ReturnType<typeof withAHistory>>;

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000095",
    registrationNumber: `DLS/SAV/2061/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2063-03-31",
  });
  await owner.farm.setDataKeepers(KEEPERS);
  await owner.investors.setPortalOpen({ open: true });
  history = await withAHistory();
});

describe("«খামারে আপনার তথ্য»", () => {
  it("holds the notice's points first, then everything the farm holds on them, unmasked", async () => {
    const owner = await as("owner");
    const { id, ventureName } = history;

    const { document } = await owner.investors.dataCopy({ id });

    const { notice } = await owner.portalPreview.yourData();
    const headings = document.sections.map((one) => one.heading.bn);
    // The notice's points, in its own order, before anything of theirs.
    expect(headings.slice(0, notice?.parts.length)).toEqual(
      notice?.parts.map((part) => part.heading)
    );
    // Each part of theirs, read on its own, found by its heading or the start of it.
    const part = (heading: string) =>
      JSON.stringify(
        document.sections.find((one) => one.heading.bn === heading) ??
          document.sections.find((one) => one.heading.bn.startsWith(heading))
      );
    // The record, unmasked: the whole NID and bank account, never the last digits alone.
    const record = part("আপনার রেকর্ড");
    expect(record).toContain(NID);
    expect(record).toContain(BANK);
    expect(record).not.toContain("নমিনি");
    // Every Nomination on file, the one in force first and said so, each Nominee with a minor's Receiver.
    // A table, one Nominee to a line.
    expect(
      document.sections.find((one) => one.heading.bn === "আপনার নমিনি")?.kind
    ).toBe("table");
    // The Agreement he signed afterwards names the same list and is now the one in force; before it, his মনোনয়নপত্র;
    // and first of all, the nominee carried over.
    const [inForce, signed, carried] = nominationsDrawn(document, "bn");
    expect(inForce).toContain("বিনিয়োগ চুক্তিতে · এখন বহাল");
    expect(signed).toContain("মনোনয়নপত্র");
    expect(carried).toContain("এখনো সই হয়নি");
    expect(inForce).toContain(`রাশেদের মেয়ে ${suffix}`);
    expect(inForce).toContain("৪০%");
    expect(inForce).toContain(
      `গ্রহণকারী রাশেদের স্ত্রী ${suffix} (মা), এনআইডি 1965 0712 3390`
    );
    // Their Nominees' numbers in full: the copy is theirs.
    expect(inForce).toContain("1990 0203 5546");
    expect(inForce).toContain("জন্ম নিবন্ধন 20502691507114382");
    expect(signed).toContain(`রাশেদের মেয়ে ${suffix}`);
    expect(carried).toContain("১০০%");
    // Their Agreement on its own, and the money it moved.
    expect(part("চুক্তি — ")).toContain(`S-${suffix}`);
    expect(part("আপনার টাকার লেনদেন")).toContain(`TRF-${suffix}`);
    expect(part("আপনার টাকার লেনদেন")).toContain(ventureName);
    // The papers made for them.
    expect(part("আপনার জন্য তৈরি কাগজ")).toContain("পোর্টাল সম্মতিপত্র");
    // Their Request, and each change they made to it.
    const requests = part("ভেঞ্চারে যোগ দেওয়ার অনুরোধ");
    expect(requests).toContain(ventureName);
    expect(requests).toContain("তিনটি");
    expect(part("অনুরোধে আপনার প্রতিটি বদল")).toContain("বদলে ৩টি ইউনিট করেছেন");
    // Their portal access, and the consent they signed.
    const portal = part("পোর্টাল");
    expect(portal).toContain("প্রথম সাইন ইন");
    expect(portal).toContain("বহাল");
    // The change to their record, what it was and what it became.
    const changes = part("আপনার সম্পর্কে প্রতিটি বদল");
    expect(changes).toContain(`আশুলিয়া ${suffix}`);
    // Their Nominees changed by the মনোনয়নপত্র they signed: what the list was, and what it became.
    expect(changes).toContain("আপনার নমিনি");
    expect(changes).toContain(`রাশেদের মেয়ে ${suffix} ৪০%`);
    // Their portal access and consent changed too, on the trail beside their record.
    expect(changes).toContain("পোর্টাল প্রবেশাধিকার");
    expect(changes).toContain("পোর্টাল সম্মতি");
    // Nothing on the trail printed as the database keeps it: every moment worded in Bangla.
    expect(changes).not.toMatch(ISO_MOMENT);
    // The Agreement's photo kept, said so.
    expect(part("চুক্তি — ")).toContain("ছবি");
  });

  it("is read in English with every day, sum, count and word the farm writes in English", async () => {
    const owner = await as("owner");
    const { document } = await owner.investors.dataCopy({ id: history.id });

    // The notice's points in the English the portal's page reads them in.
    const { inEnglish } = await owner.portalPreview.yourData();
    expect(
      document.sections
        .slice(0, inEnglish?.parts.length)
        .map((one) => one.heading.en)
    ).toEqual(inEnglish?.parts.map((part) => part.heading));
    expect(inLanguage(document.preamble, "en")).toContain(
      "everything the farm holds about you up to 1 January 2061"
    );
    expect(inLanguage(document.produced, "en")).not.toMatch(BANGLA_DIGIT);
    // Each Nominee in English: their numbers in full, their birth day and share in English figures.
    const [inForce] = nominationsDrawn(document, "en");
    expect(inForce).toContain("in force now");
    expect(inForce).toContain("1990 0203 5546");
    expect(inForce).toContain("3 February 1990");
    expect(inForce).toContain("birth registration 20502691507114382");
    expect(inForce).toContain("40%");
    expect(inForce).toContain("Receiver");
    // Their Agreement, money, Pay-in Note and Request, each in English figures.
    const agreement = drawn(document, "চুক্তি — ", "en").join("\n");
    expect(agreement).toContain("3 Units");
    expect(agreement).toContain("Your share: 60%");
    expect(agreement).toContain(`Stamp: S-${suffix}`);
    expect(agreement).toContain("2 January 2061");
    expect(drawn(document, "আপনার টাকার লেনদেন", "en").join("\n")).toContain(
      "150,000"
    );
    expect(drawn(document, "আপনার জমার খবর", "en").join("\n")).toContain(
      "Mobile money to the Venture Account"
    );
    expect(
      drawn(document, "অনুরোধে আপনার প্রতিটি বদল", "en").join("\n")
    ).toContain("Changed to 3 units");
    expect(drawn(document, "পোর্টাল", "en").join("\n")).toContain("in force");
    // The changes about them in English, the farm's moments too.
    const changes = drawn(document, "আপনার সম্পর্কে প্রতিটি বদল", "en").join("\n");
    expect(changes).toContain("Your record");
    expect(changes).toContain("Portal access");
    // No Bangla numeral anywhere the farm writes a figure: what they typed (the bank account) and what the trail kept
    // in Bangla (the Nominees' line) are theirs, as written.
    const farmWritten = document.sections
      .flatMap((one) =>
        (one.kind === "facts" || one.kind === "table") &&
        one.heading.bn !== "আপনার রেকর্ড" &&
        one.heading.bn !== "আপনার সম্পর্কে প্রতিটি বদল"
          ? drawn(document, one.heading.bn, "en")
          : []
      )
      .join("\n");
    expect(farmWritten).not.toMatch(BANGLA_DIGIT);
    expect(
      document.sections.flatMap((one) => {
        if (one.kind === "facts") {
          return one.rows.map((row) => inLanguage(row.label, "en"));
        }
        return one.kind === "table"
          ? one.columns.map((column) => inLanguage(column.label, "en"))
          : [];
      })
    ).not.toContainEqual(expect.stringMatching(BANGLA_DIGIT));
  });

  it("holds the Pay-in Notes they sent from the portal, with the reference they gave", async () => {
    const owner = await as("owner");
    const { document } = await owner.investors.dataCopy({ id: history.id });
    const notes = JSON.stringify(
      document.sections.find((one) => one.heading.bn === "আপনার জমার খবর")
    );
    expect(notes).toContain(`TrxID ${suffix}`);
  });

  it("is an Export on the Investor, by the Owner", async () => {
    const owner = await as("owner");
    const { id } = history;

    await owner.investors.dataCopy({ id });

    const trail = await owner.audit.list({ entity: "investor", limit: 50 });
    const made = trail.find(
      (one) =>
        one.entityId === id &&
        one.action === "export" &&
        (one.after as { paper?: string } | null)?.paper === "data_copy"
    );
    expect(made).toMatchObject({
      actorId: thePerson("owner").id,
      after: expect.objectContaining({ investorId: id }),
    });
  });

  it("reads every field the trail keeps of their record", async () => {
    const owner = await as("owner");
    const trail = await owner.audit.list({ entity: "investor", limit: 50 });
    const made = trail.find(
      (one) => one.entityId === history.id && one.action === "create"
    );

    const fields: readonly string[] = TRAILED.investor.fields;
    expect(
      Object.keys(made?.after ?? {}).filter((field) => !fields.includes(field))
    ).toEqual([]);
  });

  it("reads every field the trail keeps of an Organization's record, but the kind it never changes from", async () => {
    const owner = await as("owner");
    const them = await owner.investors.record({
      kind: "organization",
      name: `প্রতিষ্ঠান ${suffix}`,
      phone: `0195${suffix}9`,
      tradeLicense: "TRAD/1",
      rjscNumber: "C-1",
      tin: "1",
      authority: "পর্ষদের সিদ্ধান্ত",
      authorityOn: "2046-01-01",
      signatoryName: "স্বাক্ষরকারী",
      signatoryNid: "1",
      signatoryRole: "পরিচালক",
    });
    const trail = await owner.audit.list({ entity: "investor", limit: 50 });
    const made = trail.find(
      (one) => one.entityId === them.id && one.action === "create"
    );

    expect(
      Object.keys(made?.after ?? {})
        .filter((field) => field !== "kind")
        .toSorted()
    ).toEqual([...TRAILED.investor.fields].toSorted());
  });

  it("words a retirement's moment in Bangla", async () => {
    const owner = await as("owner");
    const them = await owner.investors.record({
      name: `অবসর ${suffix}`,
      phone: `0195${suffix}2`,
    });
    await owner.investors.retire({ id: them.id });

    const { document } = await owner.investors.dataCopy({ id: them.id });

    const changes = JSON.stringify(
      document.sections.find(
        (one) => one.heading.bn === "আপনার সম্পর্কে প্রতিটি বদল"
      )
    );
    expect(changes).toContain("বাদ দেওয়ার দিন");
    expect(changes).not.toMatch(ISO_MOMENT);
  });

  it("is not made while the notice on its first page has a fact unwritten", async () => {
    const owner = await as("owner");
    await owner.farm.setDataKeepers({ ...KEEPERS, backupCountry: null });

    try {
      await expect(
        owner.investors.dataCopy({ id: history.id })
      ).rejects.toMatchObject({ data: { refusal: "notice_unwritten" } });
    } finally {
      await owner.farm.setDataKeepers(KEEPERS);
    }
  });

  it("is the Owner's alone", async () => {
    const owner = await as("owner");
    const manager = await as("manager");
    const them = await owner.investors.record({
      name: `কামরুল ${suffix}`,
      phone: `0195${suffix}1`,
    });

    await expect(
      manager.investors.dataCopy({ id: them.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is never offered in the portal or its Preview", () => {
    expect(Object.keys(appRouter.portal)).not.toContain("dataCopy");
    expect(Object.keys(appRouter.portalPreview)).not.toContain("dataCopy");
  });
});
