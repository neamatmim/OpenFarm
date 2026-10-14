import { FakeClock, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { appRouter } from "./index";

const suffix = `${Date.now()}`.slice(-6);
const AT = "2088-02-12T04:00:00.000Z";
const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  return client;
};
const invited = invitingInvestors({ prefix: "019", run: suffix }, AT);

/** A Venture paid by the month, three Investors on it with their stamped papers on file, buying already. */
const aMonthlyVenture = async (
  name: string,
  investors: readonly string[] = ["Rahim", "Karim", "Salma"]
) => {
  const owner = await asOwner();
  const { id } = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 580_000,
    floorMoney: 0,
    decideBy: "2088-01-25",
    targetWindowStart: "2088-11-01",
    targetWindowEnd: "2088-11-10",
    unitPriceMoney: 58_000,
    units: 10,
    cattleBudgetMoney: 400_000,
    capitalPaid: "by_the_month",
  });
  await owner.ventures.setBankAccount({
    id,
    bank: "Test bank",
    accountName: "Venture account",
    accountNumber: `MC-${id}`,
  });
  const papers: string[] = [];
  const people: Awaited<ReturnType<typeof invited>>[] = [];
  for (const who of investors) {
    // oxlint-disable-next-line no-await-in-loop -- each Investor signs in turn
    const them = await invited(`${who} ${name} ${suffix}`);
    // oxlint-disable-next-line no-await-in-loop -- each paper after its Investor
    const agreement = await owner.ventures.agreements.sign({
      ventureId: id,
      investorId: them.id,
      units: 1,
      investorsPercent: 60,
      arbitrator: "Test arbitrator",
      stampValueMoney: 300,
      stampedOn: "2088-01-02",
      stampSerial: `MC-${them.id}`,
    });
    // oxlint-disable-next-line no-await-in-loop -- its stamped paper on file
    await owner.ventures.agreements.keepPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    papers.push(agreement.id);
    people.push(them);
  }
  return { ventureId: id, papers, people };
};

const row = (agreementId: string, amountMoney: number, reference: string) => ({
  agreementId,
  amountMoney,
  reference,
  movedOn: "2088-02-11",
});

/** What a Venture's papers have taken, by paper. */
const takenBy = async (ventureId: string) => {
  const owner = await asOwner();
  const papers = await owner.ventures.agreements.list({ ventureId });
  return papers.map((one) => one.capitalLeftMoney);
};

beforeAll(async () => {
  const owner = await asOwner();
  await theFarm();
  await owner.farm.setIdentity({
    address: "Test farm",
    phone: "+8801711000096",
    registrationNumber: `MC-${suffix}`,
    registrationOffice: "Test office",
    registrationExpiresOn: "2090-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
  await owner.investors.setPayInNotes({ shown: true });
});

describe("a month's capital from the grid", () => {
  it("takes every line the statement shows, each its own receipt in the trail", async () => {
    const { ventureId, papers } = await aMonthlyVenture("Three lines");
    const owner = await asOwner();
    const [a = "", b = "", c = ""] = papers;

    const { received } = await owner.ventures.takeMonthsCapital({
      ventureId,
      receipts: [
        row(a, 42_000, "MC-A-1"),
        row(b, 40_000, "MC-B-1"),
        row(c, 2000, "MC-C-1"),
      ],
    });

    expect(received).toHaveLength(3);
    expect(await takenBy(ventureId)).toEqual([16_000, 18_000, 56_000]);
    const trail = await owner.audit.list({ entity: "venture_movement" });
    const ours = trail.filter((one) =>
      received.some((taken) => taken.id === one.entityId)
    );
    expect(ours).toHaveLength(3);
  });

  it("refuses the same transfer twice in one grid, naming its second line, and keeps nothing", async () => {
    const { ventureId, papers } = await aMonthlyVenture("Same twice");
    const owner = await asOwner();
    const [a = "", b = "", c = ""] = papers;

    await expect(
      owner.ventures.takeMonthsCapital({
        ventureId,
        receipts: [
          row(a, 40_000, "MC-DUP"),
          row(b, 40_000, "MC-OTHER"),
          row(c, 40_000, " mc-dup "),
        ],
      })
    ).rejects.toMatchObject({
      data: { refusal: "capital_reference_twice", row: 3 },
    });
    expect(await takenBy(ventureId)).toEqual([58_000, 58_000, 58_000]);
  });

  it("refuses a transfer the Venture took before, naming its line, and keeps the lines above it out too", async () => {
    const { ventureId, papers } = await aMonthlyVenture("Taken before");
    const owner = await asOwner();
    const [a = "", b = "", c = ""] = papers;
    await owner.ventures.takeCapital({
      ...row(a, 40_000, "MC-JAN"),
      paymentMethod: "bank",
    });

    await expect(
      owner.ventures.takeMonthsCapital({
        ventureId,
        receipts: [row(b, 40_000, "MC-FEB-B"), row(c, 40_000, "MC-JAN")],
      })
    ).rejects.toMatchObject({
      data: { refusal: "capital_reference_taken", row: 2 },
    });
    expect(await takenBy(ventureId)).toEqual([18_000, 58_000, 58_000]);
  });

  it("refuses a line for more than its paper may still take, naming that line", async () => {
    const { ventureId, papers } = await aMonthlyVenture("Over the units");
    const owner = await asOwner();
    const [a = "", b = ""] = papers;

    await expect(
      owner.ventures.takeMonthsCapital({
        ventureId,
        receipts: [row(a, 40_000, "MC-OK"), row(b, 58_001, "MC-OVER")],
      })
    ).rejects.toMatchObject({
      data: { refusal: "capital_over_units", row: 2 },
    });
    expect(await takenBy(ventureId)).toEqual([58_000, 58_000, 58_000]);
  });

  it("allocates each line against its Monthly Sums as the capital sheet does", async () => {
    const { ventureId, papers } = await aMonthlyVenture("Allocated alike");
    const owner = await asOwner();
    const [a = "", b = ""] = papers;

    const { received } = await owner.ventures.takeMonthsCapital({
      ventureId,
      receipts: [row(a, 43_000, "MC-GRID")],
    });
    const single = await owner.ventures.takeCapital({
      ...row(b, 43_000, "MC-SHEET"),
      paymentMethod: "bank",
    });

    expect(received[0]?.allocation).toEqual(single.allocation);
    expect(single.allocation?.after).toMatchObject({
      cattlePaidMoney: 40_000,
      monthlyPaidMoney: 3000,
    });
  });

  it("refuses a line on another Venture's paper", async () => {
    const here = await aMonthlyVenture("This one", ["Rahim"]);
    const there = await aMonthlyVenture("That one", ["Karim"]);
    const owner = await asOwner();

    await expect(
      owner.ventures.takeMonthsCapital({
        ventureId: here.ventureId,
        receipts: [row(there.papers[0] ?? "", 40_000, "MC-ELSEWHERE")],
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", data: { row: 1 } });
  });

  it("answers an Investor's Pay-in Note from the line that names it, or whose reference is the note's", async () => {
    const { ventureId, papers, people } = await aMonthlyVenture("With notes", [
      "Noted",
      "Matched",
    ]);
    const owner = await asOwner();
    const [a = "", b = ""] = papers;
    const [noted, matched] = people;
    const named = await noted?.client.portal.sendPayInNote({
      agreementId: a,
      amountMoney: 40_000,
      sentOn: "2088-02-10",
      way: "bank_transfer",
      reference: "NOTE-NAMED",
      photo: null,
    });
    await matched?.client.portal.sendPayInNote({
      agreementId: b,
      amountMoney: 40_000,
      sentOn: "2088-02-10",
      way: "bank_transfer",
      reference: "NOTE-MATCHED",
      photo: null,
    });

    await owner.ventures.takeMonthsCapital({
      ventureId,
      receipts: [
        { ...row(a, 40_000, "STATEMENT-A"), payInNoteId: named?.id },
        row(b, 40_000, " note-matched "),
      ],
    });

    const notes = await owner.ventures.payInNotes.list({ ventureId });
    expect(notes.map((one) => [one.agreementId, one.state]).toSorted()).toEqual(
      [
        [a, "received"],
        [b, "received"],
      ].toSorted()
    );
  });
});
