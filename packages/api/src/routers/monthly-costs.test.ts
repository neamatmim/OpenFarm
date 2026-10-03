import { uuidv7 } from "@OpenFarm/db/ids";
import { moneyEvent } from "@OpenFarm/db/schema/money";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * Monthly Costs: a Category the Owner marks as paid every month — shed rent — is named to the Manager and the Owner
 * for a month with nothing entered under it, and so is anybody paid a wage one month and not the next. A month
 * missing is otherwise read as a cheaper month.
 */
const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const category: Record<string, string> = {};

const managerHome = async (instant: string) => {
  const manager = await as("manager", instant);
  const home = await manager.client.home.manager();
  return home.queue.monthlyCosts;
};

/** The Monthly Costs the Manager's home names on that day. */
const costsOn = async (instant: string) => {
  const named = await managerHome(instant);
  return named.costs;
};

/** The wages the Manager's home names on that day. */
const wagesOn = async (instant: string) => {
  const named = await managerHome(instant);
  return named.wages;
};

const enter = async (
  instant: string,
  entry: {
    categoryId: string;
    amountMoney: number;
    occurredOn: string;
    name: string;
    wageMonth?: string;
  }
) => {
  const manager = await as("manager", instant);
  await manager.client.money.enter({
    categoryId: entry.categoryId,
    amountMoney: entry.amountMoney,
    occurredOn: entry.occurredOn,
    counterparty: { name: entry.name },
    paymentMethod: "cash",
    wageMonth: entry.wageMonth,
  });
};

beforeAll(async () => {
  const owner = await as("owner", "2044-05-01T04:00:00.000Z");
  for (const one of await owner.client.money.categories()) {
    if (one.key) {
      category[one.key] = one.id;
    }
  }
  const marking = await as("owner", "2044-05-02T04:00:00.000Z");
  await marking.client.money.setPaidMonthly({
    categoryId: category.rent ?? "",
    paidMonthly: true,
  });
});

describe("a Monthly Cost", () => {
  it("is shed rent, a standard Category the Owner may mark and nobody may charge to the animals", async () => {
    const owner = await as("owner", "2044-05-02T05:00:00.000Z");
    const categories = await owner.client.money.categories();
    const rent = categories.find((one) => one.key === "rent");
    expect(rent).toMatchObject({
      nameBn: "শেড ভাড়া",
      direction: "out",
      paidMonthly: true,
      monthlyMarkable: true,
      chargeable: false,
    });
  });

  it("is named for this month from the farm's day of the month, and not before the Owner marked it", async () => {
    // The 9th: April is before the mark, and May is not due yet.
    expect(await costsOn("2044-05-09T04:00:00.000Z")).toEqual([]);
    expect(await costsOn("2044-05-10T04:00:00.000Z")).toEqual([
      {
        categoryId: category.rent,
        categoryBn: "শেড ভাড়া",
        categoryEn: "Shed rent",
        month: "2044-05",
      },
    ]);
  });

  it("is no longer named once anything is entered under it, still waiting for the Owner or not", async () => {
    // Over the Approval Threshold, so it waits for the Owner: entered all the same.
    await enter("2044-05-12T04:00:00.000Z", {
      categoryId: category.rent ?? "",
      amountMoney: 25_000,
      occurredOn: "2044-05-05",
      name: "জমির মালিক",
    });
    expect(await costsOn("2044-05-12T05:00:00.000Z")).toEqual([]);
  });

  it("is named for last month whatever the day, to the Owner as well as the Manager", async () => {
    // June had nothing entered, and on 1 July it is named although July's day is ten days off.
    const owner = await as("owner", "2044-07-01T04:00:00.000Z");
    const home = await owner.client.home.owner();
    const { monthlyCosts } = home.needsYou;
    expect(monthlyCosts.costs).toEqual([
      expect.objectContaining({ categoryId: category.rent, month: "2044-06" }),
    ]);
    expect(await costsOn("2044-07-01T04:00:00.000Z")).toEqual(
      monthlyCosts.costs
    );
  });

  it("is the Owner's alone to mark, and never Wages, money coming in, or a record's money — a Vet's fee among them", async () => {
    const manager = await as("manager", "2044-05-03T04:00:00.000Z");
    await expect(
      manager.client.money.setPaidMonthly({
        categoryId: category.utilities ?? "",
        paidMonthly: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const owner = await as("owner", "2044-05-03T04:00:00.000Z");
    await expect(
      owner.client.money.setPaidMonthly({
        categoryId: category.wages ?? "",
        paidMonthly: true,
      })
    ).rejects.toMatchObject({ data: { refusal: "wages_watched_by_person" } });
    await Promise.all(
      ["manure_sales", "feed_in", "vet_fee"].map((key) =>
        expect(
          owner.client.money.setPaidMonthly({
            categoryId: category[key] ?? "",
            paidMonthly: true,
          })
        ).rejects.toMatchObject({ data: { refusal: "never_monthly" } })
      )
    );
  });
});

describe("a wage not entered", () => {
  it("names somebody paid for one month and not the next, once the month after has reached the farm's day, and only the once", async () => {
    const wage = (name: string, wageMonth: string, occurredOn: string) =>
      enter(`${occurredOn}T06:00:00.000Z`, {
        categoryId: category.wages ?? "",
        amountMoney: 9000,
        occurredOn,
        name,
        wageMonth,
      });
    await wage("করিম", "2044-05", "2044-06-05");
    await wage("রহিম", "2044-05", "2044-06-05");
    await wage("রহিম", "2044-06", "2044-07-05");

    // On the 9th of July, June's wages are not looked for yet.
    expect(await wagesOn("2044-07-09T04:00:00.000Z")).toEqual([]);
    expect(await wagesOn("2044-07-10T04:00:00.000Z")).toEqual([
      {
        personId: expect.any(String),
        personName: "করিম",
        month: "2044-06",
        categoryId: category.wages,
      },
    ]);
    // A month on, Karim — who has had nothing since May — is not named again; Rahim, paid for June and not July, is.
    expect(await wagesOn("2044-08-10T04:00:00.000Z")).toEqual([
      {
        personId: expect.any(String),
        personName: "রহিম",
        month: "2044-07",
        categoryId: category.wages,
      },
    ]);
  });
});

describe("the day of the month", () => {
  it("is the Owner's to set, and moves the day a month's Monthly Costs are named from", async () => {
    const manager = await as("manager", "2044-08-01T04:00:00.000Z");
    await expect(
      manager.client.farm.setParameters({ monthlyCostsFromDay: 3 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const months = async () => {
      const costs = await costsOn("2044-08-03T04:00:00.000Z");
      return costs.map((one) => one.month);
    };
    // On the 3rd, with the 10th the farm's day, July alone is named.
    expect(await months()).toEqual(["2044-07"]);
    const owner = await as("owner", "2044-08-01T04:00:00.000Z");
    await owner.client.farm.setParameters({ monthlyCostsFromDay: 3 });
    expect(await months()).toEqual(["2044-07", "2044-08"]);
    await owner.client.farm.setParameters({ monthlyCostsFromDay: 10 });
  });
});

describe("the mark", () => {
  it("is never put on a retired Category, and a retired one is not offered it", async () => {
    const owner = await as("owner", "2044-09-02T04:00:00.000Z");
    const gone = await owner.client.money.addCategory({
      nameBn: "পুরোনো জেনারেটর",
      direction: "out",
    });
    await owner.client.money.retireCategory({ id: gone.id });
    const categories = await owner.client.money.categories();
    expect(categories.find((one) => one.id === gone.id)).toMatchObject({
      monthlyMarkable: false,
    });
    await expect(
      owner.client.money.setPaidMonthly({
        categoryId: gone.id,
        paidMonthly: true,
      })
    ).rejects.toMatchObject({ data: { refusal: "category_retired" } });
  });

  it("taken off and put back, starts again from the day it went back on", async () => {
    const owner = await as("owner", "2044-10-02T04:00:00.000Z");
    const internet = await owner.client.money.addCategory({
      nameBn: "ইন্টারনেট",
      direction: "out",
    });
    await owner.client.money.setPaidMonthly({
      categoryId: internet.id,
      paidMonthly: true,
    });
    const off = await as("owner", "2044-10-03T04:00:00.000Z");
    await off.client.money.setPaidMonthly({
      categoryId: internet.id,
      paidMonthly: false,
    });
    const back = await as("owner", "2044-11-20T04:00:00.000Z");
    await back.client.money.setPaidMonthly({
      categoryId: internet.id,
      paidMonthly: true,
    });
    // October was before it went back on, so only November is asked about — had the first mark been kept, October
    // would be named as well.
    const costs = await costsOn("2044-11-25T04:00:00.000Z");
    expect(
      costs
        .filter((one) => one.categoryId === internet.id)
        .map((one) => one.month)
    ).toEqual(["2044-11"]);
  });
});

describe("a Venture's money", () => {
  it("never stands in for the Farm's rent", async () => {
    const owner = await as("owner", "2044-12-01T04:00:00.000Z");
    const venture = await owner.client.ventures.open({
      name: "শীতের ভেঞ্চার",
      targetCapitalMoney: 500_000,
      floorMoney: 0,
      decideBy: "2044-12-20",
      targetWindowStart: "2045-06-01",
      targetWindowEnd: "2045-06-05",
      unitPriceMoney: 50_000,
      units: 10,
    });
    // Nothing the app offers writes a Venture's money under the rent, so it is written here, as its writer would.
    const id = uuidv7(new Date());
    await scratchDb()
      .insert(moneyEvent)
      .values({
        id,
        farmId: theFarm().id,
        direction: "out",
        amountMoney: 18_000,
        occurredAt: new Date("2044-12-05T04:00:00.000Z"),
        categoryId: category.rent ?? "",
        paymentMethod: "bank",
        source: "by_hand",
        sourceId: id,
        purseVentureId: venture.id,
        approval: "approved",
        recordedByRole: "owner",
        recordedAt: new Date("2044-12-05T04:00:00.000Z"),
      });
    const costs = await costsOn("2044-12-15T04:00:00.000Z");
    expect(
      costs
        .filter((one) => one.categoryId === category.rent)
        .map((one) => one.month)
    ).toContain("2044-12");
  });
});
