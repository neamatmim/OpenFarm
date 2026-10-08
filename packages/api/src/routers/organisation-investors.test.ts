import { investor, nomination } from "@OpenFarm/db/schema/venture";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { theWhole } from "../test/nominations";
import { appRouter } from "./index";

/**
 * An Organisation as an Investor (ADR 0020): a company, a firm or a society, written down with its own papers and the
 * one Signatory it acts through, counted once towards the Investor Cap, and never turned into a person or back.
 */
const suffix = `organisation-investors-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const plan = {
  targetCapitalMoney: 2_000_000,
  floorMoney: 0,
  decideBy: "2046-08-15",
  targetWindowStart: "2047-05-17",
  targetWindowEnd: "2047-05-19",
  unitPriceMoney: 50_000,
  units: 40,
  cattleBudgetMoney: 1_500_000,
};

const paper = {
  investorsPercent: 60,
  arbitrator: `মাওলানা আব্দুল হক ${suffix}`,
  stampValueMoney: 300,
  stampedOn: "2046-08-02",
  stampSerial: `AA ${suffix}`,
};

const organisation = (which: number) => ({
  kind: "organisation" as const,
  name: `মেঘনা ডেইরি ট্রেডার্স লিমিটেড ${which} ${suffix}`,
  phone: `0183${String(which).padStart(7, "0")}`,
  address: "মতিঝিল, ঢাকা",
  bankAccount:
    "মেঘনা ডেইরি ট্রেডার্স লিমিটেড\nসোনালী ব্যাংক · 0002 3344 5566\nমতিঝিল শাখা",
  tradeLicence: `TRAD/DNCC/0${which}4521/2025`,
  rjscNumber: `C-1774${which}`,
  tin: `5544332211${which}`,
  authority: "পরিচালনা পর্ষদের সিদ্ধান্ত",
  authorityOn: "2046-07-20",
  signatoryName: `মো. রফিকুল ইসলাম ${which}`,
  signatoryNid: `1990${String(which).padStart(9, "0")}`,
  signatoryRole: "ব্যবস্থাপনা পরিচালক",
});

const person = (which: number) => ({
  name: `বিনিয়োগকারী ${which} ${suffix}`,
  phone: `0184${String(which).padStart(7, "0")}`,
  nid: `1985${String(which).padStart(9, "0")}`,
});

let ventureId = "";
let otherVentureId = "";

beforeAll(async () => {
  const owner = await as("owner", "2046-08-01T04:00:00.000Z");
  const one = await owner.client.ventures.open({
    name: `ঈদ ২০৪৭ ${suffix}`,
    ...plan,
  });
  ventureId = one.id;
  const two = await owner.client.ventures.open({
    name: `দ্বিতীয় ${suffix}`,
    ...plan,
  });
  otherVentureId = two.id;
});

describe("an Organisation as an Investor", () => {
  it("is written down with its own papers and its Signatory, and no NID of its own", async () => {
    const owner = await as("owner", "2046-08-03T04:00:00.000Z");
    const { id } = await owner.client.investors.record(organisation(1));
    const { people } = await owner.client.investors.list();
    expect(people.find((one) => one.id === id)).toMatchObject({
      kind: "organisation",
      name: organisation(1).name,
      phone: organisation(1).phone,
      nid: null,
      organisation: {
        tradeLicence: organisation(1).tradeLicence,
        rjscNumber: organisation(1).rjscNumber,
        tin: organisation(1).tin,
        authority: "পরিচালনা পর্ষদের সিদ্ধান্ত",
        authorityOn: "2046-07-20",
        signatory: {
          name: organisation(1).signatoryName,
          nid: organisation(1).signatoryNid,
          role: "ব্যবস্থাপনা পরিচালক",
        },
      },
    });
  });

  it("is a person when nothing says otherwise, with nothing of an Organisation's", async () => {
    const owner = await as("owner", "2046-08-03T05:00:00.000Z");
    const { id } = await owner.client.investors.record(person(1));
    const { people } = await owner.client.investors.list();
    expect(people.find((one) => one.id === id)).toMatchObject({
      kind: "person",
      organisation: null,
    });
  });

  it("is refused without a Signatory or the paper that names them", async () => {
    const owner = await as("owner", "2046-08-04T04:00:00.000Z");
    const { signatoryName: _name, ...noSignatory } = organisation(2);
    await expect(
      // @ts-expect-error -- an Organisation with nobody to act for it is what is being refused
      owner.client.investors.record(noSignatory)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { authority: _authority, ...noAuthority } = organisation(2);
    await expect(
      // @ts-expect-error -- as above, without the paper that names the Signatory
      owner.client.investors.record(noAuthority)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is refused by the database as a person with a Signatory, or an Organisation without one", async () => {
    const at = new Date("2046-08-04T05:00:00.000Z");
    const farmId = theFarm().id;
    await expect(
      scratchDb()
        .insert(investor)
        .values({
          id: `person-with-signatory-${suffix}`,
          farmId,
          name: `ভুল ${suffix}`,
          phone: "01700000001",
          signatoryName: "কেউ একজন",
          createdAt: at,
        })
    ).rejects.toMatchObject({
      cause: { constraint: "investor_person_has_no_signatory" },
    });
    await expect(
      scratchDb()
        .insert(investor)
        .values({
          id: `organisation-alone-${suffix}`,
          farmId,
          kind: "organisation",
          name: `একা ${suffix}`,
          phone: "01700000002",
          createdAt: at,
        })
    ).rejects.toMatchObject({
      cause: { constraint: "investor_organisation_has_a_signatory" },
    });
  });

  it("is put right, Signatory and all, and the trail keeps what it said before", async () => {
    const owner = await as("owner", "2046-08-05T04:00:00.000Z");
    const { id } = await owner.client.investors.record(organisation(3));
    await owner.client.investors.update({
      id,
      ...organisation(3),
      signatoryNid: "19901234567890",
      tin: "998877665544",
    });
    const trail = await owner.client.audit.list({
      entity: "investor",
      entityId: id,
    });
    const correction = trail.find((one) => one.action === "update");
    expect(correction?.before).toMatchObject({
      kind: "organisation",
      tin: organisation(3).tin,
      signatoryNid: organisation(3).signatoryNid,
    });
    expect(correction?.after).toMatchObject({
      tin: "998877665544",
      signatoryNid: "19901234567890",
    });
  });

  it("never becomes a person, nor a person an Organisation", async () => {
    const owner = await as("owner", "2046-08-06T04:00:00.000Z");
    const company = await owner.client.investors.record(organisation(4));
    const somebody = await owner.client.investors.record(person(4));
    await expect(
      owner.client.investors.update({ id: company.id, ...person(40) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_kind_fixed" },
    });
    await expect(
      owner.client.investors.update({ id: somebody.id, ...organisation(40) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_kind_fixed" },
    });
  });

  it("is the same Investor on the same name and the same Signatory's mobile", async () => {
    const owner = await as("owner", "2046-08-07T04:00:00.000Z");
    await owner.client.investors.record(organisation(5));
    await expect(
      owner.client.investors.record(organisation(5))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_exists" },
    });
  });

  it("counts once towards the Investor Cap, in however many Ventures", async () => {
    const owner = await as("owner", "2046-08-08T04:00:00.000Z");
    const before = await owner.client.investors.list();
    const { id } = await owner.client.investors.record(organisation(6));
    for (const run of [ventureId, otherVentureId]) {
      // oxlint-disable-next-line no-await-in-loop -- each signature is counted against the one before it
      await owner.client.ventures.agreements.sign({
        ventureId: run,
        investorId: id,
        units: 2,
        ...paper,
      });
    }
    const after = await owner.client.investors.list();
    expect(after.standing).toBe(before.standing + 1);
    expect(after.people.find((one) => one.id === id)?.unitsHeld).toBe(4);
  });
});

describe("an Organisation and Nominees", () => {
  it("signs an Agreement that is no Nomination", async () => {
    const owner = await as("owner", "2046-08-09T04:00:00.000Z");
    const { id } = await owner.client.investors.record(organisation(7));
    await owner.client.ventures.agreements.sign({
      ventureId,
      investorId: id,
      units: 1,
      ...paper,
    });
    const nominations = await scratchDb()
      .select({ id: nomination.id })
      .from(nomination)
      .where(eq(nomination.investorId, id));
    expect(nominations).toHaveLength(0);
  });

  it("is refused a Nominee on its Agreement, or on a মনোনয়নপত্র of its own", async () => {
    const owner = await as("owner", "2046-08-10T04:00:00.000Z");
    const { id } = await owner.client.investors.record(organisation(8));
    const named = [theWhole(`কেউ একজন ${suffix}`)];
    const refusal = {
      code: "BAD_REQUEST",
      data: { refusal: "organisation_names_no_nominee" },
    };
    await expect(
      owner.client.ventures.agreements.sign({
        ventureId,
        investorId: id,
        units: 1,
        ...paper,
        nominees: named,
      })
    ).rejects.toMatchObject(refusal);
    await expect(
      owner.client.investors.nominationToSign({ id, nominees: named })
    ).rejects.toMatchObject(refusal);
    await expect(
      owner.client.investors.recordNomination({
        id,
        nominees: named,
        signedOn: "2046-08-10",
        contentType: "image/jpeg",
        data: "aGVsbG8=",
      })
    ).rejects.toMatchObject(refusal);
  });
});
