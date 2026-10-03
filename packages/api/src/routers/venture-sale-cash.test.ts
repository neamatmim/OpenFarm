import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A Venture's bull sold for cash at the livestock market leaves her price in the hand that took it, as that Venture's money —
 * counted with the hand, and not in the Venture Account — until a Handover deposits it there with its slip. The
 * Venture Account takes no cash and no bKash: what it holds is what the bank holds.
 */
const suffix = `sale-cash-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let ventureId = "";
let penId = "";
/** Three bulls bought while it was buying: its first Sale makes it Selling, which buys no more. */
const tags: string[] = [];

/** A bull for the Venture at the gate, bought on the second of January. */
const aBull = async (price: number) => {
  const owner = await as("owner", "2080-01-02T06:00:00.000Z");
  return await owner.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `প্রতিবেশী ${suffix}` },
    purchasePriceMoney: price,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date("2080-01-02T05:00:00.000Z"),
    ventureId,
    ...PAID_FROM_THE_ACCOUNT,
  });
};

/** The Manager sells him at the livestock market. */
const sold = async (
  tagNumber: string,
  priceMoney: number,
  paymentMethod: "cash" | "bkash" | "bank",
  instant = "2080-01-10T06:00:00.000Z",
  reference?: string
) => {
  const manager = await as("manager", instant);
  return await manager.client.sale.record({
    tagNumber,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceMoney,
    weightKg: 300,
    destination: `হাট ${suffix}`,
    vehicle: `ট্রাক ${suffix}`,
    driver: `চালক ${suffix}`,
    paymentMethod,
    soldAt: new Date(instant),
    ...(reference ? { reference } : {}),
  });
};

const handOf = async (role: "owner" | "manager", instant: string) => {
  const owner = await as("owner", instant);
  const hands = await owner.client.cash.inHand();
  return hands.find((one) => one.userId === thePerson(role).id);
};

const saleMoneyIn = async (instant: string) => {
  const owner = await as("owner", instant);
  const moves = await owner.client.ventures.movements({ ventureId });
  return moves.filter((one) => one.kind === "sale_in");
};

beforeAll(async () => {
  const owner = await as("owner", "2080-01-01T04:00:00.000Z");
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2080-01-01",
    targetWindowStart: "2080-09-01",
    targetWindowEnd: "2080-09-05",
    unitPriceMoney: 50_000,
    units: 20,
    cattleBudgetMoney: 800_000,
  });
  ventureId = venture.id;
  await putCapitalIn(
    owner.client,
    { id: ventureId, units: 20, unitPriceMoney: 50_000 },
    suffix,
    "2080-01-01"
  );
  await owner.client.ventures.startBuying({ id: ventureId });
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  for (const price of [100_000, 90_000, 80_000]) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after another off the gate
    const bull = await aBull(price);
    tags.push(bull.tagNumber);
  }
});

describe("a Venture's bull sold for cash", () => {
  let first = { saleId: "", tagNumber: "" };

  it("is held in the hand that took it, not in the Venture Account", async () => {
    const tagNumber = tags[0] ?? "";
    const sale = await sold(tagNumber, 150_000, "cash");
    first = { saleId: sale.id, tagNumber };
    expect(await saleMoneyIn("2080-01-10T09:00:00.000Z")).toEqual([]);
    expect(await handOf("manager", "2080-01-10T09:00:00.000Z")).toMatchObject({
      amount: 150_000,
    });
  });

  it("waits in the Settlement while it is held", async () => {
    const owner = await as("owner", "2080-01-10T10:00:00.000Z");
    const settlement = await owner.client.ventures.settlement({ ventureId });
    expect(settlement.blocks.map((one) => one.word)).toContain(
      "sale_cash_in_a_hand"
    );
  });

  it("moves with its price when the Sale is put right before it is deposited", async () => {
    const manager = await as("manager", "2080-01-10T11:00:00.000Z");
    await manager.client.sale.correct({
      id: first.saleId,
      reason: `দাম আসলে কম ছিল ${suffix}`,
      changes: { priceMoney: { from: 150_000, to: 148_000 } },
    });
    expect(await handOf("manager", "2080-01-10T12:00:00.000Z")).toMatchObject({
      amount: 148_000,
    });
    expect(await saleMoneyIn("2080-01-10T12:00:00.000Z")).toEqual([]);
  });

  it("reaches the Venture Account when deposited with its slip, on the day it went in", async () => {
    const manager = await as("manager", "2080-01-11T05:00:00.000Z");
    // A deposit with no slip is no deposit.
    await expect(
      manager.client.cash.handOver({
        from: { userId: thePerson("manager").id },
        to: { ventureId, saleIds: [first.saleId] },
        amountMoney: 148_000,
      })
    ).rejects.toMatchObject({ data: { refusal: "bank_needs_a_slip" } });
    await manager.client.cash.handOver({
      from: { userId: thePerson("manager").id },
      to: { ventureId, saleIds: [first.saleId] },
      amountMoney: 148_000,
      reference: `DEP-${suffix}`,
    });
    expect(await saleMoneyIn("2080-01-11T06:00:00.000Z")).toMatchObject([
      {
        amountMoney: 148_000,
        movedOn: "2080-01-11",
        reference: `DEP-${suffix}`,
      },
    ]);
    expect(await handOf("manager", "2080-01-11T06:00:00.000Z")).toMatchObject({
      amount: 0,
    });
    // Once only.
    await expect(
      manager.client.cash.handOver({
        from: { userId: thePerson("manager").id },
        to: { ventureId, saleIds: [first.saleId] },
        amountMoney: 148_000,
        reference: `DEP2-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "already_deposited" } });
    const owner = await as("owner", "2080-01-11T07:00:00.000Z");
    const settlement = await owner.client.ventures.settlement({ ventureId });
    expect(settlement.blocks.map((one) => one.word)).not.toContain(
      "sale_cash_in_a_hand"
    );
  });

  it("is deposited only from the hand that holds it", async () => {
    const sale = await sold(
      tags[1] ?? "",
      120_000,
      "cash",
      "2080-01-12T06:00:00.000Z"
    );
    const owner = await as("owner", "2080-01-12T08:00:00.000Z");
    await expect(
      owner.client.cash.handOver({
        from: { userId: thePerson("owner").id },
        to: { ventureId, saleIds: [sale.id] },
        amountMoney: 120_000,
        reference: `DEP-O-${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "not_held_here" } });
  });

  it("is never taken by bKash", async () => {
    await expect(
      sold(tags[2] ?? "", 110_000, "bkash", "2080-01-13T06:00:00.000Z")
    ).rejects.toMatchObject({
      data: { refusal: "venture_sale_not_by_bkash" },
    });
  });
});

describe("a Venture's bull sold by bank", () => {
  it("reaches the Venture Account under the transfer's reference, not her tag", async () => {
    await sold(
      tags[2] ?? "",
      110_000,
      "bank",
      "2080-01-14T06:00:00.000Z",
      `NPSB-${suffix}`
    );
    const moved = await saleMoneyIn("2080-01-14T07:00:00.000Z");
    expect(moved.map((one) => one.reference)).toContain(`NPSB-${suffix}`);
  });
});
