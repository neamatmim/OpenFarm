import { uuidv7 } from "@OpenFarm/db/ids";
import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Milk a processor's collection centre takes daily and pays for by its own statement: sent with its price to follow, it
// is liters and no money — never a Receivable of a price somebody made up at the gate — until the buyer's statement
// prices it (ADR 0030).

const suffix = `price-to-follow-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const centre = (name: string) => ({ name: `${name} ${suffix}` });

describe("milk sent with its price to follow", () => {
  it("is liters and no money: nothing paid, nothing owed, and the day says its price is to follow", async () => {
    const manager = await as("manager", "2081-03-02T06:00:00.000Z");
    const buyer = centre("মিল্ক ভিটা");
    const { id } = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2081-03-02T01:00:00.000Z"),
      liters: 120,
      buyer,
      priceToFollow: true,
      fatPercent: 4.1,
      snfPercent: 8.3,
    });

    const day = await manager.client.milk.day({ day: "2081-03-02" });
    const sent = day.dispatches.find((one) => one.id === id);

    expect(sent).toMatchObject({
      liters: 120,
      pricePerLiterMoney: null,
      priceToFollow: true,
      worthMoney: null,
      receivableMoney: 0,
      owingMoney: 0,
    });
    const owing = await manager.client.receivables.ofBuyer({
      name: buyer.name,
    });

    expect(owing).toBeNull();
  });

  it("refuses money said paid on milk whose price is to follow", async () => {
    const manager = await as("manager", "2081-03-03T06:00:00.000Z");

    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2081-03-03T01:00:00.000Z"),
        liters: 50,
        buyer: centre("প্রাণ"),
        priceToFollow: true,
        paidNowMoney: 500,
      })
    ).rejects.toMatchObject({ data: { refusal: "price_to_follow_paid" } });
  });

  it("asks for a price or for the price to follow, never both or neither", async () => {
    const manager = await as("manager", "2081-03-03T06:00:00.000Z");

    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2081-03-03T01:00:00.000Z"),
        liters: 50,
        buyer: centre("আড়ং"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2081-03-03T01:00:00.000Z"),
        liters: 50,
        buyer: centre("আড়ং"),
        pricePerLiterMoney: 60,
        priceToFollow: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

type Client = Awaited<ReturnType<typeof as>>["client"];

/** What a buyer owes in all, as his Receivable says it; nothing for a buyer who owes nothing. */
const owingOf = async (client: Client, name: string) => {
  const his = await client.receivables.ofBuyer({ name });
  return his?.owingMoney;
};

/** One Dispatch as its day lists it. */
const sentOn = async (client: Client, day: string, id: string) => {
  const milkDay = await client.milk.day({ day });
  return milkDay.dispatches.find((one) => one.id === id);
};

/** One statement as the Statements tab lists it. */
const statementCalled = async (client: Client, id: string) => {
  const all = await client.milk.statements();
  return all.find((one) => one.id === id);
};

/** A milk buyer as the sheets offer him. */
const buyerCalled = async (client: Client, name: string) => {
  const buyers = await client.milk.buyers();
  return buyers.find((one) => one.name === name);
};

/** A fortnight of a centre's milk: two cans sent with the price to follow, and one priced and paid at the gate. */
const aFortnight = async (client: Client, name: string, month: string) => {
  const buyer = centre(name);
  const first = await client.milk.dispatch({
    dispatchedAt: new Date(`${month}-01T01:00:00.000Z`),
    liters: 100,
    buyer,
    priceToFollow: true,
  });
  await client.milk.dispatch({
    dispatchedAt: new Date(`${month}-05T01:00:00.000Z`),
    liters: 50,
    buyer,
    pricePerLiterMoney: 60,
  });
  const second = await client.milk.dispatch({
    dispatchedAt: new Date(`${month}-10T01:00:00.000Z`),
    liters: 150,
    buyer,
    priceToFollow: true,
  });
  const his = await buyerCalled(client, buyer.name);
  return {
    buyer,
    counterpartyId: his?.counterpartyId ?? "",
    first: first.id,
    second: second.id,
  };
};

/** His statement for the first fortnight: 295 liters by his count, ৳18,000. */
const fortnightStatement = (
  counterpartyId: string,
  month: string,
  more: Partial<Parameters<Client["milk"]["recordStatement"]>[0]> = {}
) => ({
  id: uuidv7(),
  counterpartyId,
  fromDay: `${month}-01`,
  toDay: `${month}-15`,
  statedOn: `${month}-16`,
  payBy: `${month}-25`,
  liters: 295,
  amountMoney: 18_000,
  fatPercent: 4.2,
  snfPercent: 8.4,
  ...more,
});

describe("a buyer's statement", () => {
  it("prices the milk whose price was to follow by its liters, leaves the milk priced at the gate, and makes the rest his Receivable", async () => {
    const manager = await as("manager", "2081-04-17T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "পিআরএএন", "2081-04");
    const statement = fortnightStatement(sent.counterpartyId, "2081-04");

    const beside = await manager.client.milk.statementBeside(statement);

    expect(beside).toMatchObject({
      farmLiters: 300,
      differenceLiters: -5,
      differencePercent: -1.67,
      pricedLiters: 50,
      pricedMoney: 3000,
      toFollowCount: 2,
      toFollowLiters: 250,
      spreadMoney: 15_000,
      problem: null,
    });

    await manager.client.milk.recordStatement(statement);

    expect(await owingOf(manager.client, sent.buyer.name)).toBe(15_000);
    expect(
      await sentOn(manager.client, "2081-04-01", sent.first)
    ).toMatchObject({
      priceToFollow: false,
      buyerStatementId: statement.id,
      worthMoney: 6000,
      receivableMoney: 6000,
      promisedBy: "2081-04-25",
    });
    expect(await statementCalled(manager.client, statement.id)).toMatchObject({
      buyerName: sent.buyer.name,
      liters: 295,
      amountMoney: 18_000,
      farmLiters: 300,
      differenceLiters: -5,
      pricedMoney: 3000,
      pricedByItCount: 2,
      pricedByItMoney: 15_000,
      voided: null,
    });
  });

  it("is one statement however often the phone sends it", async () => {
    const manager = await as("manager", "2081-05-17T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "আকিজ", "2081-05");
    const statement = fortnightStatement(sent.counterpartyId, "2081-05");

    await manager.client.milk.recordStatement(statement);
    await manager.client.milk.recordStatement(statement);

    const all = await manager.client.milk.statements();

    expect(
      all.filter((one) => one.counterpartyId === sent.counterpartyId)
    ).toHaveLength(1);
    expect(await owingOf(manager.client, sent.buyer.name)).toBe(15_000);
  });

  it("is refused for days another of his statements covers, or under a number of his already used", async () => {
    const manager = await as("manager", "2081-06-20T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "ব্র্যাক", "2081-06");
    await manager.client.milk.recordStatement(
      fortnightStatement(sent.counterpartyId, "2081-06", { number: "BR-17" })
    );

    await expect(
      manager.client.milk.recordStatement(
        fortnightStatement(sent.counterpartyId, "2081-06", {
          fromDay: "2081-06-15",
          toDay: "2081-06-18",
          statedOn: "2081-06-19",
        })
      )
    ).rejects.toMatchObject({ data: { refusal: "statement_overlaps" } });
    await expect(
      manager.client.milk.recordStatement(
        fortnightStatement(sent.counterpartyId, "2081-06", {
          number: "br-17",
          fromDay: "2081-06-16",
          toDay: "2081-06-18",
          statedOn: "2081-06-19",
        })
      )
    ).rejects.toMatchObject({ data: { refusal: "statement_number_taken" } });
  });

  it("is refused where his amount is no more than the milk already priced at the gate", async () => {
    const manager = await as("manager", "2081-07-17T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "মিল্কভিটা", "2081-07");

    await expect(
      manager.client.milk.recordStatement(
        fortnightStatement(sent.counterpartyId, "2081-07", {
          amountMoney: 3000,
        })
      )
    ).rejects.toMatchObject({ data: { refusal: "statement_below_priced" } });
  });

  it("holds the milk it priced: no more milk with its price to follow into its days, and its liters are not put right under it", async () => {
    const manager = await as("manager", "2081-08-17T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "আড়ং ডেইরি", "2081-08");
    await manager.client.milk.recordStatement(
      fortnightStatement(sent.counterpartyId, "2081-08")
    );

    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2081-08-12T01:00:00.000Z"),
        liters: 20,
        buyer: sent.buyer,
        priceToFollow: true,
      })
    ).rejects.toMatchObject({ data: { refusal: "statement_covers_it" } });
    await expect(
      manager.client.milk.correctDispatch({
        id: sent.first,
        reason: "ভুল লিটার",
        changes: { liters: { from: 100, to: 110 } },
      })
    ).rejects.toMatchObject({ data: { refusal: "priced_by_statement" } });
    // The collector's figures and the notes stay the Manager's.
    await manager.client.milk.correctDispatch({
      id: sent.first,
      reason: "স্লিপ পরে এল",
      changes: { deliveryNote: { from: null, to: "CH-88" } },
    });
  });
});

describe("a wrong statement voided", () => {
  it("is the Owner's: the milk it priced goes back to its price to follow, owing nothing", async () => {
    const manager = await as("manager", "2081-09-17T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "ফার্ম ফ্রেশ", "2081-09");
    const statement = fortnightStatement(sent.counterpartyId, "2081-09");
    await manager.client.milk.recordStatement(statement);

    await expect(
      manager.client.milk.voidStatement({
        id: statement.id,
        reason: "অন্য খামারের বিল",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const owner = await as("owner", "2081-09-18T06:00:00.000Z");
    await owner.client.milk.voidStatement({
      id: statement.id,
      reason: "অন্য খামারের বিল",
    });

    expect(await sentOn(owner.client, "2081-09-01", sent.first)).toMatchObject({
      priceToFollow: true,
      worthMoney: null,
      receivableMoney: 0,
      buyerStatementId: null,
    });
    expect(await owingOf(owner.client, sent.buyer.name)).toBeUndefined();
    const listed = await statementCalled(owner.client, statement.id);

    expect(listed?.voided?.reason).toBe("অন্য খামারের বিল");

    // The right statement then prices the same milk.
    await owner.client.milk.recordStatement(
      fortnightStatement(sent.counterpartyId, "2081-09", {
        amountMoney: 18_500,
      })
    );

    expect(await owingOf(owner.client, sent.buyer.name)).toBe(15_500);
  });

  it("is refused once his payments have cleared some of what it priced", async () => {
    const owner = await as("owner", "2081-10-20T06:00:00.000Z");
    const sent = await aFortnight(owner.client, "শিলাইদহ", "2081-10");
    const statement = fortnightStatement(sent.counterpartyId, "2081-10");
    await owner.client.milk.recordStatement(statement);
    await owner.client.receivables.pay({
      buyer: sent.buyer.name,
      kind: "milk",
      amountMoney: 5000,
      paidOn: "2081-10-20",
      paymentMethod: "cash",
    });

    await expect(
      owner.client.milk.voidStatement({ id: statement.id, reason: "ভুল" })
    ).rejects.toMatchObject({ data: { refusal: "statement_paid_on" } });
  });
});

describe("milk money in the monthly report", () => {
  it("leaves milk whose price is to follow out of what milk fetched and says its liters apart, until its statement prices it in the month it left", async () => {
    const owner = await as("owner", "2082-01-20T06:00:00.000Z");
    const sent = await aFortnight(owner.client, "ডেইরি হাব", "2082-01");

    const before = await owner.client.monthlyReport.month({
      month: "2082-01",
    });

    expect(before.figures.dairy).toMatchObject({
      milkSoldMoney: 3000,
      litersSold: 50,
      fetchedPerLiterMoney: 60,
      litersPriceToFollow: 250,
    });

    const later = await as("owner", "2082-02-03T06:00:00.000Z");
    await later.client.milk.recordStatement(
      fortnightStatement(sent.counterpartyId, "2082-01", {
        statedOn: "2082-02-02",
        payBy: "2082-02-10",
      })
    );
    const after = await later.client.monthlyReport.month({ month: "2082-01" });

    expect(after.figures.dairy).toMatchObject({
      milkSoldMoney: 18_000,
      litersSold: 300,
      fetchedPerLiterMoney: 60,
      litersPriceToFollow: 0,
    });
  });
});

describe("milk whose price is to follow, waiting", () => {
  it("lists each buyer's, and is late once his period and ten days more have gone with no statement", async () => {
    const manager = await as("manager", "2082-03-05T06:00:00.000Z");
    const buyer = centre("অপেক্ষার কেন্দ্র");
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2082-03-01T01:00:00.000Z"),
      liters: 80,
      buyer,
      priceToFollow: true,
    });
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2082-03-04T01:00:00.000Z"),
      liters: 70,
      buyer,
      priceToFollow: true,
    });
    const theirs = async (instant: string) => {
      const reading = await as("manager", instant);
      const waiting = await reading.client.milk.priceToFollow();
      return waiting.find((one) => one.name === buyer.name);
    };

    expect(await theirs("2082-03-05T06:00:00.000Z")).toMatchObject({
      count: 2,
      liters: 150,
      oldestOn: "2082-03-01",
      lateFrom: "2082-04-11",
      lateCount: 0,
    });
    // A month and ten days after the first left: the first is late, the second not yet.
    expect(await theirs("2082-04-11T06:00:00.000Z")).toMatchObject({
      lateCount: 1,
      lateLiters: 80,
    });
  });
});

describe("a Dispatch's price put right", () => {
  it("prices milk whose price was to follow, all of it owed, and sends a price guessed at the gate back to follow only where nothing was paid", async () => {
    const manager = await as("manager", "2082-04-03T06:00:00.000Z");
    const buyer = centre("ঠিক করা দাম");
    const toFollow = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2082-04-01T01:00:00.000Z"),
      liters: 40,
      buyer,
      priceToFollow: true,
    });
    const paidCash = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2082-04-02T01:00:00.000Z"),
      liters: 10,
      buyer,
      pricePerLiterMoney: 55,
    });

    await manager.client.milk.correctDispatch({
      id: toFollow.id,
      reason: "দাম জানা গেল",
      changes: { pricePerLiterMoney: { from: null, to: 60 } },
    });

    expect(await owingOf(manager.client, buyer.name)).toBe(2400);
    await expect(
      manager.client.milk.correctDispatch({
        id: paidCash.id,
        reason: "দাম পরে ঠিক হবে",
        changes: { pricePerLiterMoney: { from: 55, to: null } },
      })
    ).rejects.toMatchObject({ data: { refusal: "price_to_follow_paid" } });

    await manager.client.milk.correctDispatch({
      id: paidCash.id,
      reason: "দাম পরে ঠিক হবে, টাকা নেওয়া হয়নি",
      changes: {
        pricePerLiterMoney: { from: 55, to: null },
        paidNowMoney: { from: 550, to: 0 },
      },
    });
    expect(
      await sentOn(manager.client, "2082-04-02", paidCash.id)
    ).toMatchObject({ priceToFollow: true, worthMoney: null });
  });
});

describe("a statement for milk of a closed month", () => {
  it("is the Owner's alone to record, and listed as a change after closing", async () => {
    const manager = await as("manager", "2082-05-20T06:00:00.000Z");
    const buyer = centre("বন্ধ মাসের কেন্দ্র");
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2082-05-03T01:00:00.000Z"),
      liters: 200,
      buyer,
      priceToFollow: true,
    });
    const his = await buyerCalled(manager.client, buyer.name);
    const owner = await as("owner", "2082-06-08T06:00:00.000Z");
    await owner.client.monthlyReport.close({ month: "2082-05" });
    const statement = {
      id: uuidv7(),
      counterpartyId: his?.counterpartyId ?? "",
      fromDay: "2082-05-01",
      toDay: "2082-05-31",
      statedOn: "2082-06-05",
      liters: 198,
      amountMoney: 11_880,
    };

    const lateManager = await as("manager", "2082-06-08T07:00:00.000Z");

    await expect(
      lateManager.client.milk.recordStatement(statement)
    ).rejects.toMatchObject({ data: { refusal: "month_closed" } });

    await owner.client.milk.recordStatement(statement);

    const june = await owner.client.monthlyReport.month({ month: "2082-06" });

    expect(june.changedAfterClosing).toEqual([
      expect.objectContaining({
        month: "2082-05",
        source: "buyer_statement",
        recordId: statement.id,
        about: buyer.name,
        change: "entered",
        beforeMoney: null,
        afterMoney: 11_880,
      }),
    ]);
  });
});
