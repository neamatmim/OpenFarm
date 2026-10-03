import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Venture's animals inherit its Target Window: not the next Eid, not dates the Manager typed on the Intake sheet,
 * and not the window it opened with once an Amendment has moved it.
 */
const suffix = `vwindow-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

/** No Eid falls in it, so a sheet that fell back on the next Eid would say so. */
const VENTURES = { start: "2047-06-01", end: "2047-06-05" };
const AMENDED = { start: "2047-07-01", end: "2047-07-05" };
const FARMS = { start: "2047-08-01", end: "2047-08-03" };

let ventureId = "";
let penId = "";

beforeAll(async () => {
  const owner = await as("owner", "2047-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2047-01-20",
    targetWindowStart: VENTURES.start,
    targetWindowEnd: VENTURES.end,
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  // Somebody has to have signed, or there is nobody to amend anything with.
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01950000001",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 20,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueMoney: 300,
    stampedOn: "2047-01-02",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountMoney: 1_000_000,
    movedOn: "2047-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: ventureId });
});

/** One bull off the lorry: the Venture's when one is named, with whatever window the sheet was given. */
const bull = async (
  instant: string,
  sheet: {
    ventureId?: string;
    targetWindowStart?: string;
    targetWindowEnd?: string;
  }
) => {
  // A Venture's bull at the gate is the Owner's, paid from its account by bank.
  const buyer = await as(sheet.ventureId ? "owner" : "manager", instant);
  return await buyer.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ...(sheet.ventureId ? PAID_FROM_THE_ACCOUNT : {}),
    ...sheet,
  });
};

/** Her window as the board shows it and as her page shows it. */
const windowsOf = async (instant: string, tagNumber: string) => {
  const owner = await as("owner", instant);
  const board = await owner.client.fattening.board({ penId });
  const her = await owner.client.animals.byTag({ tagNumber });
  return {
    board: board.find((one) => one.tagNumber === tagNumber)?.targetWindow,
    page: her.intake?.targetWindow,
  };
};

const tags: string[] = [];

describe("a Venture's animal and its Target Window", () => {
  it("is aimed at the Venture's window when the sheet names none", async () => {
    const hers = await bull("2047-01-05T05:00:00.000Z", { ventureId });
    tags.push(hers.tagNumber);
    expect(hers.targetWindow).toEqual(VENTURES);
    expect(await windowsOf("2047-01-05T09:00:00.000Z", hers.tagNumber)).toEqual(
      { board: VENTURES, page: VENTURES }
    );
  });

  it("refuses a window on the sheet that is not the Venture's", async () => {
    await expect(
      bull("2047-01-06T05:00:00.000Z", {
        ventureId,
        targetWindowStart: FARMS.start,
        targetWindowEnd: FARMS.end,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "window_is_the_ventures" },
    });
  });

  it("takes the Venture's window when a Farm animal is put right to the Venture", async () => {
    const slip = await bull("2047-01-07T05:00:00.000Z", {
      targetWindowStart: FARMS.start,
      targetWindowEnd: FARMS.end,
    });
    tags.push(slip.tagNumber);
    // The Owner's, paid from the Venture Account by bank.
    const owner = await as("owner", "2047-01-07T09:00:00.000Z");
    await owner.client.intake.correct({
      id: slip.intakeId,
      reason: `ভেঞ্চারের গরু, খামারের নামে লেখা হয়েছিল ${suffix}`,
      changes: {
        owner: { from: null, to: ventureId },
        paymentMethod: { from: "cash", to: "bank" },
        reference: { from: null, to: `TRF ${suffix}` },
      },
    });
    expect(await windowsOf("2047-01-07T10:00:00.000Z", slip.tagNumber)).toEqual(
      { board: VENTURES, page: VENTURES }
    );
  });

  it("moves with the Venture's window when an Amendment moves it", async () => {
    const owner = await as("owner", "2047-02-01T04:00:00.000Z");
    await owner.client.ventures.amend({
      ventureId,
      investorsPercent: 60,
      targetWindowStart: AMENDED.start,
      targetWindowEnd: AMENDED.end,
      signedOn: "2047-01-31",
      reason: `সবাই মিলে বিক্রির সময় পিছিয়েছি ${suffix}`,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    for (const tagNumber of tags) {
      // oxlint-disable-next-line no-await-in-loop -- one animal at a time, as her page is read
      expect(await windowsOf("2047-02-01T09:00:00.000Z", tagNumber)).toEqual({
        board: AMENDED,
        page: AMENDED,
      });
    }
  });
});

describe("a Correction and the window she is sold in", () => {
  const MANAGER_AT = "2047-02-02T09:00:00.000Z";

  it("asks the Farm's window when it makes a Venture's animal the Farm's own", async () => {
    const hers = await bull("2047-02-02T05:00:00.000Z", { ventureId });
    const manager = await as("manager", MANAGER_AT);
    const reason = `খামারের গরু, ভেঞ্চারের নামে লেখা হয়েছিল ${suffix}`;
    // The Venture's window was never the Farm's choice for her: nobody may leave her on it without saying so.
    await expect(
      manager.client.intake.correct({
        id: hers.intakeId,
        reason,
        changes: { owner: { from: ventureId, to: null } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "window_needed" },
    });
    await manager.client.intake.correct({
      id: hers.intakeId,
      reason,
      changes: {
        owner: { from: ventureId, to: null },
        targetWindow: { from: AMENDED, to: FARMS },
      },
    });
    expect(await windowsOf("2047-02-02T10:00:00.000Z", hers.tagNumber)).toEqual(
      { board: FARMS, page: FARMS }
    );
  });

  it("refuses a window for an animal that stays a Venture's", async () => {
    const hers = await bull("2047-02-03T05:00:00.000Z", { ventureId });
    const manager = await as("manager", "2047-02-03T09:00:00.000Z");
    await expect(
      manager.client.intake.correct({
        id: hers.intakeId,
        reason: `ভুল তারিখ ${suffix}`,
        changes: { targetWindow: { from: AMENDED, to: FARMS } },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "window_is_the_ventures" },
    });
  });

  it("puts a Farm animal's window right, as any other slip at the livestock market", async () => {
    const OTHER = { start: "2047-09-10", end: "2047-09-12" };
    const hers = await bull("2047-02-04T05:00:00.000Z", {
      targetWindowStart: FARMS.start,
      targetWindowEnd: FARMS.end,
    });
    const manager = await as("manager", "2047-02-04T09:00:00.000Z");
    await manager.client.intake.correct({
      id: hers.intakeId,
      reason: `ভুল তারিখ লেখা হয়েছিল ${suffix}`,
      changes: { targetWindow: { from: FARMS, to: OTHER } },
    });
    expect(await windowsOf("2047-02-04T10:00:00.000Z", hers.tagNumber)).toEqual(
      { board: OTHER, page: OTHER }
    );
  });
});
