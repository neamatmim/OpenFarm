import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
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
  const categories = await manager.client.money.categories.list();
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

  it("counts a piece dated before one already entered: the week is the same week whichever came first", async () => {
    const name = `টিন বিক্রেতা ${suffix}`;
    await enter("manager", name, 15_000, "2077-05-20");
    // Written up a day late, dated the day before: thirty thousand in the week all the same.
    expect(await standing("manager", name, 15_000, "2077-05-19")).toBe(
      "awaiting"
    );
  });

  it("counts a Wage Draw as a piece: two draws to one person in a week past the line wait", async () => {
    const name = `অগ্রিম নেওয়া ${suffix}`;
    const draw = async (amountMoney: number, day: string) => {
      const manager = await as("manager", day);
      const made = await manager.client.money.drawWage({
        counterparty: { name },
        amountMoney,
        drawnOn: day,
      });
      const row = await scratchDb().query.moneyEvent.findFirst({
        where: { source: "wage_draw", sourceId: made.id },
        columns: { approval: true },
      });
      return row?.approval;
    };
    expect(await draw(15_000, "2077-05-21")).toBe("not_needed");
    expect(await draw(15_000, "2077-05-22")).toBe("awaiting");
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

describe("money waiting when the line moves", () => {
  it("still says it waits over the line, not in pieces, once the Owner raises the line above it", async () => {
    const name = `জেনারেটর মিস্ত্রি ${suffix}`;
    const owner = await as("owner", "2077-06-02");
    const ours = await scratchDb().query.farm.findFirst({
      where: { id: theFarm().id },
      columns: { approvalThresholdMoney: true },
    });
    const line = ours?.approvalThresholdMoney ?? 0;
    // Half as much again as the line, in one go.
    const waiting = await enter("manager", name, line * 1.5, "2077-06-02");
    expect(waiting.approval).toBe("awaiting");
    await owner.client.farm.setParameters({ approvalThresholdMoney: line * 2 });
    try {
      const after = await as("owner", "2077-06-02");
      const home = await after.client.overview.get();
      expect(
        home.needsYou.moneyAwaiting.find((one) => one.id === waiting.id)
      ).toMatchObject({ inPieces: false });
    } finally {
      await owner.client.farm.setParameters({ approvalThresholdMoney: line });
    }
  });
});

describe("the Owner's approval", () => {
  it("is of the terms she read: corrected under her since, it is refused — the same amount or not", async () => {
    const name = `ঠিকাদার ${suffix}`;
    const made = await enter("manager", name, 25_000, "2077-05-24");
    expect(made.approval).toBe("awaiting");
    const owner = await as("owner", "2077-05-24");
    const home = await owner.client.overview.get();
    const read = home.needsYou.moneyAwaiting.find((one) => one.id === made.id);
    expect(read?.termsRead).toBeTruthy();

    // While she reads, the Manager puts the category right: the same amount, other terms.
    const manager = await as("manager", "2077-05-24");
    const categories = await manager.client.money.categories.list();
    const utilities = categories.find((one) => one.key === "utilities");
    await manager.client.money.correctEntered({
      id: made.id,
      changes: {
        categoryId: { from: repairsId, to: utilities?.id ?? "" },
      },
      reason: `ভুল খাত ${suffix}`,
    });
    await expect(
      owner.client.money.approve({
        id: made.id,
        amountMoney: 25_000,
        termsRead: read?.termsRead,
      })
    ).rejects.toMatchObject({ data: { refusal: "terms_changed" } });

    // Read again, it is hers to approve.
    const again = await owner.client.overview.get();
    const now = again.needsYou.moneyAwaiting.find((one) => one.id === made.id);
    await owner.client.money.approve({
      id: made.id,
      amountMoney: 25_000,
      termsRead: now?.termsRead,
    });
  });
});
