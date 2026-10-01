import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

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
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2047-01-20",
    targetWindowStart: VENTURES.start,
    targetWindowEnd: VENTURES.end,
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
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
    stampValueBdt: 300,
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
    amountBdt: 1_000_000,
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
  const manager = await as("manager", instant);
  return await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 60_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
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
    const manager = await as("manager", "2047-01-07T09:00:00.000Z");
    await manager.client.intake.correct({
      id: slip.intakeId,
      reason: `ভেঞ্চারের গরু, খামারের নামে লেখা হয়েছিল ${suffix}`,
      changes: { owner: { from: null, to: ventureId } },
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
