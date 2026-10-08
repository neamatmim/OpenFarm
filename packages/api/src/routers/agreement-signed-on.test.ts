import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { theWhole } from "../test/nominations";
import { appRouter } from "./index";

// The day an Investment Agreement was signed, as the Owner says it: a paper signed in front of them on Eid morning and
// typed in two days later reads signed on Eid morning — never on a day still to come, before its stamp was bought,
// before its Venture opened, or before the Venture's terms were last amended.

const suffix = `signed-on-${Date.now()}`;
const OPENED = "2053-01-01T04:00:00.000Z";
const RECORDED = "2053-01-10T05:00:00.000Z";

const as = (instant: string) =>
  createTestClient(appRouter, { as: "owner", clock: new FakeClock(instant) });

const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
    return null;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
};

let ventureId = "";

/** An adult Nominee collecting the whole, with everything a paper asks of one. */
const nominee = (name: string) => ({
  ...theWhole(name),
  bornOn: "1990-02-03",
  nid: "1990 0203 5546",
});

/** A Venture opened on the first of January, to sign for. */
const aVenture = async (name: string) => {
  const { client: owner } = await as(OPENED);
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2053-01-25",
    targetWindowStart: "2053-04-01",
    targetWindowEnd: "2053-04-05",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  return venture.id;
};

let phones = 0;
const somebody = async (name: string) => {
  const { client: owner } = await as(OPENED);
  phones += 1;
  const him = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone: `0196${String(phones).padStart(7, "0")}`,
  });
  return him.id;
};

/** A paper stamped on the third, for one Unit. */
const paper = (venture: string, investorId: string) => ({
  ventureId: venture,
  investorId,
  units: 1,
  investorsPercent: 60,
  arbitrator: `মাওলানা ${suffix}`,
  stampValueMoney: 300,
  stampedOn: "2053-01-03",
  stampSerial: `AA-${investorId.slice(-6)}`,
});

beforeAll(async () => {
  ventureId = await aVenture("ভেঞ্চার");
});

describe("an Agreement's signing day", () => {
  it("is the day the Owner says, though typed in days later, and its Nominees are named that day", async () => {
    const investorId = await somebody("রহিম");
    const { client: owner } = await as(RECORDED);

    await owner.ventures.agreements.sign({
      ...paper(ventureId, investorId),
      signedOn: "2053-01-05",
      nominees: [nominee(`ফাতেমা ${suffix}`)],
    });

    const {
      agreements: [agreement],
    } = await owner.investors.agreements({ id: investorId });
    expect(agreement?.signedOn).toBe("2053-01-05");
    const [named] = await owner.investors.nominations({ id: investorId });
    expect(named?.how).toBe("agreement");
    expect(named?.signedOn).toBe("2053-01-05");
  });

  it("is the day it is recorded when none is said", async () => {
    const investorId = await somebody("করিম");
    const { client: owner } = await as(RECORDED);

    await owner.ventures.agreements.sign(paper(ventureId, investorId));

    const {
      agreements: [agreement],
    } = await owner.investors.agreements({ id: investorId });
    expect(agreement?.signedOn).toBe("2053-01-10");
  });

  it("is never a day still to come", async () => {
    const investorId = await somebody("সালাম");
    const { client: owner } = await as(RECORDED);

    expect(
      await refusalOf(
        owner.ventures.agreements.sign({
          ...paper(ventureId, investorId),
          signedOn: "2053-01-11",
        })
      )
    ).toBe("signed_in_future");
  });

  it("is never before its stamp was bought", async () => {
    const investorId = await somebody("জব্বার");
    const { client: owner } = await as(RECORDED);

    expect(
      await refusalOf(
        owner.ventures.agreements.sign({
          ...paper(ventureId, investorId),
          signedOn: "2053-01-02",
        })
      )
    ).toBe("signed_before_stamped");
  });

  it("is never before its Venture was opened", async () => {
    const investorId = await somebody("বরকত");
    const { client: owner } = await as(RECORDED);

    expect(
      await refusalOf(
        owner.ventures.agreements.sign({
          ...paper(ventureId, investorId),
          stampedOn: "2052-12-30",
          signedOn: "2052-12-31",
        })
      )
    ).toBe("signed_before_opened");
  });

  it("is never before the Venture's terms were last amended, and may be that day or after", async () => {
    const amended = await aVenture("সংশোধিত ভেঞ্চার");
    const first = await somebody("প্রথম");
    const late = await somebody("পরে আসা");
    const { client: owner } = await as(RECORDED);
    await owner.ventures.agreements.sign({
      ...paper(amended, first),
      signedOn: "2053-01-04",
    });
    await owner.ventures.agreements.amend({
      ventureId: amended,
      investorsPercent: 60,
      targetWindowStart: "2053-04-08",
      targetWindowEnd: "2053-04-12",
      signedOn: "2053-01-08",
      reason: `সবাই মিলে বিক্রির সময় পিছিয়েছি ${suffix}`,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });

    expect(
      await refusalOf(
        owner.ventures.agreements.sign({
          ...paper(amended, late),
          signedOn: "2053-01-07",
        })
      )
    ).toBe("signed_before_amended");
    await owner.ventures.agreements.sign({
      ...paper(amended, late),
      signedOn: "2053-01-08",
    });
    const {
      agreements: [agreement],
    } = await owner.investors.agreements({ id: late });
    expect(agreement?.targetWindow).toEqual({
      start: "2053-04-08",
      end: "2053-04-12",
    });
  });

  it("does not outrank a মনোনয়নপত্র they signed after it, though recorded before it", async () => {
    const investorId = await somebody("হাশেম");
    const { client: owner } = await as(RECORDED);
    await owner.investors.recordNomination({
      id: investorId,
      nominees: [nominee(`নতুন নমিনি ${suffix}`)],
      signedOn: "2053-01-08",
    });

    await owner.ventures.agreements.sign({
      ...paper(ventureId, investorId),
      signedOn: "2053-01-06",
      nominees: [nominee(`পুরোনো নমিনি ${suffix}`)],
    });

    const [inForce] = await owner.investors.nominations({ id: investorId });
    expect(inForce?.signedOn).toBe("2053-01-08");
    expect(inForce?.nominees.map((one) => one.name)).toEqual([
      `নতুন নমিনি ${suffix}`,
    ]);
  });
});

describe("putting an Agreement's stamp right", () => {
  it("never moves the stamp's day after the day it was signed", async () => {
    const investorId = await somebody("মজিদ");
    const { client: owner } = await as(RECORDED);
    const { id } = await owner.ventures.agreements.sign({
      ...paper(ventureId, investorId),
      signedOn: "2053-01-05",
    });

    expect(
      await refusalOf(
        owner.ventures.agreements.correct({
          id,
          reason: `সইয়ের পরের দিন লেখা ${suffix}`,
          changes: {
            stampedOn: { from: "2053-01-03", to: "2053-01-06" },
          },
        })
      )
    ).toBe("signed_before_stamped");
  });
});
