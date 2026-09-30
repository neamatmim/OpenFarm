import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Money entered by hand that looks like money already entered — the same person, the same taka, the same day — is
// asked about before it is kept: shown the earlier one, saved only when sent again knowing, and then told to the Owner.

const suffix = `looks-entered-${Date.now()}`;
const NOW = "2076-04-12T08:00:00.000Z";
const DAY = "2076-04-12";

const as = (role: "owner" | "manager") =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(NOW) });

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
  amountBdt: number,
  occurredOn = DAY,
  sameAgain?: boolean
) => {
  const who = await as(role);
  return await who.client.money.enter({
    categoryId: repairsId,
    amountBdt,
    occurredOn,
    counterparty: { name },
    ...(sameAgain === undefined ? {} : { sameAgain }),
  });
};

const toldOf = async (id: string) =>
  await scratchDb().query.alert.findMany({
    where: { kind: "entered_twice", entityId: id },
    columns: { userId: true, params: true },
  });

describe("money that looks entered already", () => {
  it("is refused with the earlier entry: the same person, the same taka, the same day", async () => {
    const name = `রহিম মিস্ত্রি ${suffix}`;
    const first = await enter("manager", name, 1500);
    await expect(enter("manager", name, 1500)).rejects.toMatchObject({
      data: {
        refusal: "looks_entered_already",
        match: {
          id: first.id,
          name,
          amountBdt: 1500,
          day: DAY,
          recordedByName: thePerson("manager").name,
        },
      },
    });
  });

  it("knows the person whatever the capitals", async () => {
    await enter("manager", `Rahim Carpenter ${suffix}`, 900);
    await expect(
      enter("manager", `rahim carpenter ${suffix}`, 900)
    ).rejects.toMatchObject({ data: { refusal: "looks_entered_already" } });
  });

  it("lets another day, another amount or another person through", async () => {
    const name = `করিম ${suffix}`;
    await enter("manager", name, 700);
    await enter("manager", name, 700, "2076-04-11");
    await enter("manager", name, 701);
    await enter("manager", `জামাল ${suffix}`, 700);
  });

  it("is kept when sent again knowing, and the Owner is told", async () => {
    const name = `বাঁশ বিক্রেতা ${suffix}`;
    const first = await enter("manager", name, 4000);
    const second = await enter("manager", name, 4000, DAY, true);
    // The trail keeps that it was entered knowing, and against which.
    const trail = await scratchDb().query.auditEvent.findFirst({
      where: { entity: "money_event", entityId: second.id, action: "create" },
      columns: { after: true },
    });
    expect(trail?.after).toMatchObject({ enteredKnowing: first.id });
    const told = await toldOf(second.id);
    expect(told).toEqual([
      {
        userId: thePerson("owner").id,
        params: expect.objectContaining({
          name,
          amountBdt: 4000,
          day: DAY,
          by: thePerson("manager").name,
        }),
      },
    ]);
  });

  it("tells nobody when the Owner enters it twice knowingly", async () => {
    const name = `মালিকের কেনা ${suffix}`;
    await enter("owner", name, 2500);
    const second = await enter("owner", name, 2500, DAY, true);
    expect(await toldOf(second.id)).toEqual([]);
  });
});
