import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A bill in pieces is one bill: money entered by hand to one person, by anybody but the Owner, that comes to more than
// the Approval Threshold over a week waits for the Owner from the piece that takes it past — however small that piece.

const suffix = `pieces-${Date.now()}`;

const as = (role: "owner" | "manager", day = "2077-05-10") =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(`${day}T08:00:00.000Z`),
  });

let repairsId = "";

beforeAll(async () => {
  await as("owner");
  const manager = await as("manager");
  const categories = await manager.client.money.categories();
  repairsId = categories.find((one) => one.key === "repairs")?.id ?? "";
});

const enter = async (
  role: "owner" | "manager",
  name: string,
  amountMoney: number,
  day: string
) => {
  const who = await as(role, day);
  const made = await who.client.money.enter({
    categoryId: repairsId,
    amountMoney,
    occurredOn: day,
    counterparty: { name },
  });
  const row = await scratchDb().query.moneyEvent.findFirst({
    where: { id: made.id },
    columns: { approval: true },
  });
  return { id: made.id, approval: row?.approval };
};

/** Where an entry stands with the Owner once it is made. */
const standing = async (
  role: "owner" | "manager",
  name: string,
  amountMoney: number,
  day: string
) => {
  const made = await enter(role, name, amountMoney, day);
  return made.approval;
};

describe("a bill in pieces", () => {
  it("waits from the piece that takes the week past the line, and the pieces before stand", async () => {
    const name = `বাঁশ বিক্রেতা ${suffix}`;
    const first = await enter("manager", name, 8000, "2077-05-04");
    const second = await enter("manager", name, 8000, "2077-05-06");
    expect([first.approval, second.approval]).toEqual([
      "not_needed",
      "not_needed",
    ]);
    // Twenty-four thousand in the week: the third waits, and so does any after it.
    expect(await standing("manager", name, 8000, "2077-05-10")).toBe(
      "awaiting"
    );
    expect(await standing("manager", name, 500, "2077-05-10")).toBe("awaiting");
  });

  it("adds up only the week: pieces eight days apart are two bills", async () => {
    const name = `রং মিস্ত্রি ${suffix}`;
    await enter("manager", name, 15_000, "2077-05-01");
    expect(await standing("manager", name, 15_000, "2077-05-08")).toBe(
      "not_needed"
    );
  });

  it("never counts the Owner's own money, nor another person's", async () => {
    const name = `ইট বিক্রেতা ${suffix}`;
    await enter("owner", name, 15_000, "2077-05-09");
    expect(await standing("manager", name, 10_000, "2077-05-10")).toBe(
      "not_needed"
    );
    await enter("manager", `বালু বিক্রেতা ${suffix}`, 15_000, "2077-05-10");
    expect(
      await standing("manager", `সিমেন্ট বিক্রেতা ${suffix}`, 10_000, "2077-05-10")
    ).toBe("not_needed");
  });

  it("is on the Owner's queue as a piece, with who entered it", async () => {
    const name = `টিন বিক্রেতা ${suffix}`;
    await enter("manager", name, 12_000, "2077-05-09");
    const waiting = await enter("manager", name, 12_000, "2077-05-10");
    const owner = await as("owner");
    const home = await owner.client.overview.get();
    expect(
      home.needsYou.moneyAwaiting.find((one) => one.id === waiting.id)
    ).toMatchObject({
      inPieces: true,
      recordedByName: thePerson("manager").name,
    });
  });
});
