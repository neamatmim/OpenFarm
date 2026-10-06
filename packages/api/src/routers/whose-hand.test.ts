import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * A cash Sale or Receivable Payment names whose hand took the notes: the writer's, unless the Owner names another Owner or
 * Manager. The Owner writing up the Manager's livestock market sale that evening puts the cash in the Manager's hand, where his
 * Friday count will look for it — not in her own, where it never was.
 */
const suffix = `whose-hand-${Date.now()}`;
const DAY = "2081-03-05";

const as = (
  role: "owner" | "manager" | "vet",
  instant = `${DAY}T10:00:00.000Z`
) => createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

let penId = "";
const tags: string[] = [];

const handOf = async (role: "owner" | "manager") => {
  const owner = await as("owner");
  const hands = await owner.client.cash.inHand();
  return hands.find((one) => one.userId === thePerson(role).id)?.amount ?? 0;
};

/** One of the Farm's bulls sold, written by `who`, naming `heldBy` where given. */
const sold = async (
  who: "owner" | "manager",
  tagNumber: string,
  sheet: {
    heldBy?: string;
    paymentMethod?: "cash" | "mobile_money" | "bank";
    paidNowMoney?: number;
    promisedBy?: string;
  } = {}
) => {
  const writer = await as(who);
  return await writer.client.sales.record({
    tagNumber,
    buyer: { name: `ক্রেতা ${suffix}` },
    priceMoney: 80_000,
    weightKg: 300,
    destination: `হাট ${suffix}`,
    vehicle: `ট্রাক ${suffix}`,
    driver: `চালক ${suffix}`,
    soldAt: new Date(`${DAY}T06:00:00.000Z`),
    paymentMethod: "cash",
    ...sheet,
  });
};

beforeAll(async () => {
  const owner = await as("owner", `${DAY}T03:00:00.000Z`);
  // The Vet has a Role on this farm, and holds none of its cash.
  await as("vet", `${DAY}T03:00:00.000Z`);
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const manager = await as("manager", `${DAY}T04:00:00.000Z`);
  for (const which of ["ক", "খ", "গ", "ঘ", "ঙ", "চ"]) {
    // oxlint-disable-next-line no-await-in-loop -- one bull after another off the lorry
    const bull = await manager.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী ${which} ${suffix}` },
      purchasePriceMoney: 50_000,
      weightKg: 250,
      estimatedAgeMonths: 20,
      arrivedAt: new Date(`${DAY}T04:00:00.000Z`),
      paymentMethod: "bank",
    });
    tags.push(bull.tagNumber);
  }
});

describe("whose hand took the notes", () => {
  it("is the Manager's when the Owner writes up the sale he made", async () => {
    const managerBefore = await handOf("manager");
    const ownerBefore = await handOf("owner");
    await sold("owner", tags[0] ?? "", { heldBy: thePerson("manager").id });
    expect(await handOf("manager")).toBe(managerBefore + 80_000);
    expect(await handOf("owner")).toBe(ownerBefore);
  });

  it("is the Manager's own to say only for himself", async () => {
    await expect(
      sold("manager", tags[1] ?? "", { heldBy: thePerson("owner").id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is never a hand that holds none of the farm's cash", async () => {
    await expect(
      sold("owner", tags[4] ?? "", { heldBy: thePerson("vet").id })
    ).rejects.toMatchObject({ data: { refusal: "holds_no_cash" } });
  });

  it("names nobody for mobile money, whatever is sent", async () => {
    const managerBefore = await handOf("manager");
    await sold("owner", tags[5] ?? "", {
      heldBy: thePerson("manager").id,
      paymentMethod: "mobile_money",
    });
    expect(await handOf("manager")).toBe(managerBefore);
  });

  it("names the hand on a Receivable Payment too", async () => {
    // Half paid at the gate into the Manager's hand, the rest promised.
    await sold("owner", tags[2] ?? "", {
      heldBy: thePerson("manager").id,
      paidNowMoney: 40_000,
      promisedBy: "2081-03-20",
    });
    const managerBefore = await handOf("manager");
    const owner = await as("owner", `${DAY}T12:00:00.000Z`);
    await owner.client.receivables.pay({
      buyer: `ক্রেতা ${suffix}`,
      kind: "cattle",
      amountMoney: 10_000,
      paidOn: DAY,
      paymentMethod: "cash",
      heldBy: thePerson("manager").id,
    });
    expect(await handOf("manager")).toBe(managerBefore + 10_000);
  });

  it("is put right by a Correction", async () => {
    const sale = await sold("owner", tags[3] ?? "");
    // Written as the Owner's, but it was the Manager who took the notes.
    const managerBefore = await handOf("manager");
    const owner = await as("owner", `${DAY}T13:00:00.000Z`);
    await owner.client.sales.correct({
      id: sale.id,
      reason: `রফিকুল টাকা নিয়েছিল ${suffix}`,
      changes: {
        heldBy: {
          from: thePerson("owner").id,
          to: thePerson("manager").id,
        },
      },
    });
    expect(await handOf("manager")).toBe(managerBefore + 80_000);
  });
});

describe("whose hand paid at the livestock market", () => {
  it("is the Manager's when the Owner writes up his bull and his lorry", async () => {
    const managerBefore = await handOf("manager");
    const ownerBefore = await handOf("owner");
    const owner = await as("owner", `${DAY}T11:00:00.000Z`);
    await owner.client.buyingTrips.record({
      wentTo: `হাট ${suffix}`,
      transportMoney: 2000,
      paymentMethod: "cash",
      wentOn: new Date(`${DAY}T05:00:00.000Z`),
      heldBy: thePerson("manager").id,
    });
    await owner.client.intakes.record({
      penId,
      sex: "male",
      seller: { name: `ব্যাপারী হাতে ${suffix}` },
      purchasePriceMoney: 40_000,
      weightKg: 220,
      estimatedAgeMonths: 18,
      arrivedAt: new Date(`${DAY}T05:30:00.000Z`),
      paymentMethod: "cash",
      heldBy: thePerson("manager").id,
    });
    expect(await handOf("manager")).toBe(managerBefore - 42_000);
    expect(await handOf("owner")).toBe(ownerBefore);
  });
});
