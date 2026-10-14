import { uuidv7 } from "@OpenFarm/db/ids";
import { counterparty } from "@OpenFarm/db/schema/fattening";
import { dispatch } from "@OpenFarm/db/schema/milk";
import { sameName } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Milk a processor's collection center takes daily and pays for by its own statement: sent with its price to follow, it
// is liters and no money — never a Receivable of a price somebody made up at the gate — until the buyer's statement
// prices it (ADR 0033).

const suffix = `price-to-follow-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

const center = (name: string) => ({ name: `${name} ${suffix}` });

describe("milk sent with its price to follow", () => {
  it("is liters and no money: nothing paid, nothing owed, and the day says its price is to follow", async () => {
    const manager = await as("manager", "2081-03-02T06:00:00.000Z");
    const buyer = center("মিল্ক ভিটা");
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
        buyer: center("প্রাণ"),
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
        buyer: center("আড়ং"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2081-03-03T01:00:00.000Z"),
        liters: 50,
        buyer: center("আড়ং"),
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

/** A fortnight of a center's milk: two cans sent with the price to follow, and one priced and paid at the gate. */
const aFortnight = async (client: Client, name: string, month: string) => {
  const buyer = center(name);
  const first = await client.milk.dispatch({
    dispatchedAt: new Date(`${month}-01T01:00:00.000Z`),
    liters: 100,
    buyer,
    priceToFollow: true,
  });
  const second = await client.milk.dispatch({
    dispatchedAt: new Date(`${month}-10T01:00:00.000Z`),
    liters: 150,
    buyer,
    priceToFollow: true,
  });
  // A can priced at the gate between them, written in last: he takes his milk on credit all the same.
  await client.milk.dispatch({
    dispatchedAt: new Date(`${month}-05T01:00:00.000Z`),
    liters: 50,
    buyer,
    pricePerLiterMoney: 60,
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

    // And what it priced stands: what he owes, and what the milk came to.
    expect(await owingOf(manager.client, sent.buyer.name)).toBe(15_000);
    expect(
      await sentOn(manager.client, "2081-08-01", sent.first)
    ).toMatchObject({
      deliveryNote: "CH-88",
      worthMoney: 6000,
      receivableMoney: 6000,
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
  it("lists each buyer's, and is late ten days after the end of his period it falls in", async () => {
    const manager = await as("manager", "2082-03-05T06:00:00.000Z");
    const buyer = center("অপেক্ষার কেন্দ্র");
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
    // With no statement of his yet, his period is the calendar month: both are late ten days after March's end, and not
    // a day before — whichever day of March each left.
    expect(await theirs("2082-04-10T06:00:00.000Z")).toMatchObject({
      lateCount: 0,
    });
    expect(await theirs("2082-04-11T06:00:00.000Z")).toMatchObject({
      lateCount: 2,
      lateLiters: 150,
    });
  });
});

describe("a Dispatch's price put right", () => {
  it("prices milk whose price was to follow, all of it owed, and sends a price guessed at the gate back to follow only where nothing was paid", async () => {
    const manager = await as("manager", "2082-04-03T06:00:00.000Z");
    const buyer = center("ঠিক করা দাম");
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
    const buyer = center("বন্ধ মাসের কেন্দ্র");
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

describe("his payments against milk a statement priced later", () => {
  it("clear what he owed when he paid, not the milk that was owed only from his statement", async () => {
    const manager = await as("manager", "2083-10-25T06:00:00.000Z");
    const buyer = center("আগে-পরে");
    const toFollow = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2083-10-03T01:00:00.000Z"),
      liters: 100,
      buyer,
      priceToFollow: true,
    });
    const onCredit = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2083-10-17T01:00:00.000Z"),
      liters: 100,
      buyer,
      pricePerLiterMoney: 50,
      paidNowMoney: 0,
    });
    await manager.client.receivables.pay({
      buyer: buyer.name,
      kind: "milk",
      amountMoney: 5000,
      paidOn: "2083-10-25",
      paymentMethod: "cash",
    });
    const his = await buyerCalled(manager.client, buyer.name);
    const later = await as("manager", "2083-11-03T06:00:00.000Z");
    const statement = {
      id: uuidv7(),
      counterpartyId: his?.counterpartyId ?? "",
      fromDay: "2083-10-01",
      toDay: "2083-10-15",
      statedOn: "2083-11-02",
      payBy: "2083-11-20",
      liters: 100,
      amountMoney: 6000,
    };
    const owner = await as("owner", "2083-11-04T06:00:00.000Z");
    const octoberOwed = async () => {
      const october = await owner.client.monthlyReport.month({
        month: "2083-10",
      });
      return october.figures.atEnd.receivables.owingMoney;
    };
    const owedBefore = await octoberOwed();
    await later.client.milk.recordStatement(statement);

    // At October's end he owed no more than before: the milk was priced only by November's statement.
    expect(await octoberOwed()).toBe(owedBefore);
    const owing = await later.client.receivables.ofBuyer({ name: buyer.name });
    const items = owing?.kinds.flatMap((one) => one.items) ?? [];

    expect(owing?.owingMoney).toBe(6000);
    expect(owing?.overdueSince).toBeNull();
    expect(items.find((one) => one.id === onCredit.id)?.owingMoney).toBe(0);
    expect(items.find((one) => one.id === toFollow.id)?.owingMoney).toBe(6000);

    // Nothing he paid cleared the milk it priced, so the Owner may still void it.
    await owner.client.milk.voidStatement({
      id: statement.id,
      reason: "ভুল দর",
    });
  });
});

describe("a statement saved twice at once", () => {
  it("is one statement, never refused as overlapping itself", async () => {
    const manager = await as("manager", "2083-12-17T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "দুবার", "2083-12");
    const statement = fortnightStatement(sent.counterpartyId, "2083-12");

    const saved = await Promise.all([
      manager.client.milk.recordStatement(statement),
      manager.client.milk.recordStatement(statement),
    ]);

    expect(saved).toEqual([{ id: statement.id }, { id: statement.id }]);
    expect(await owingOf(manager.client, sent.buyer.name)).toBe(15_000);
  });
});

describe("price to follow for a buyer who pays at the gate", () => {
  it("is refused: a sweet shop that pays cash for its can is priced at the gate", async () => {
    const manager = await as("manager", "2084-01-05T06:00:00.000Z");
    const shop = center("নগদের দোকান");
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2084-01-03T01:00:00.000Z"),
      liters: 10,
      buyer: shop,
      pricePerLiterMoney: 70,
    });

    await expect(
      manager.client.milk.dispatch({
        dispatchedAt: new Date("2084-01-04T01:00:00.000Z"),
        liters: 10,
        buyer: shop,
        priceToFollow: true,
      })
    ).rejects.toMatchObject({
      data: { refusal: "price_to_follow_pays_at_gate" },
    });
  });
});

describe("a statement beside milk priced at the gate later in its days", () => {
  it("says the difference his amount leaves, not nought", async () => {
    const manager = await as("manager", "2084-02-17T06:00:00.000Z");
    const sent = await aFortnight(manager.client, "পরে যোগ", "2084-02");
    const statement = fortnightStatement(sent.counterpartyId, "2084-02");
    await manager.client.milk.recordStatement(statement);
    // A can priced at the gate, written in after the statement: ৳1,200 his amount never counted.
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2084-02-12T01:00:00.000Z"),
      liters: 20,
      buyer: sent.buyer,
      pricePerLiterMoney: 60,
    });

    expect(await statementCalled(manager.client, statement.id)).toMatchObject({
      farmLiters: 320,
      pricedMoney: 4200,
      pricedByItMoney: 15_000,
      amountDifferenceMoney: -1200,
    });
  });
});

describe("a buyer the farm kept under two spellings", () => {
  it("has his statement price the milk sent under either", async () => {
    const manager = await as("manager", "2084-03-17T06:00:00.000Z");
    const farmId = theFarm().id;
    const first = uuidv7(new Date("2084-01-01T00:00:00.000Z"));
    const second = uuidv7(new Date("2084-01-02T00:00:00.000Z"));
    await scratchDb()
      .insert(counterparty)
      .values([
        {
          id: first,
          farmId,
          name: `Twin Center ${suffix}`,
          createdAt: new Date("2084-01-01T00:00:00.000Z"),
        },
        {
          id: second,
          farmId,
          name: `TWIN CENTER ${suffix}`,
          createdAt: new Date("2084-01-02T00:00:00.000Z"),
        },
      ]);
    const onTheSecond = uuidv7(new Date("2084-03-02T01:00:00.000Z"));
    await scratchDb()
      .insert(dispatch)
      .values({
        id: onTheSecond,
        farmId,
        dispatchedAt: new Date("2084-03-02T01:00:00.000Z"),
        liters: "100.00",
        buyerId: second,
        buyerName: `TWIN CENTER ${suffix}`,
        recordedByRole: "manager",
        recordedAt: new Date("2084-03-02T01:00:00.000Z"),
      });

    const statementId = uuidv7();
    await manager.client.milk.recordStatement({
      id: statementId,
      counterpartyId: first,
      fromDay: "2084-03-01",
      toDay: "2084-03-15",
      statedOn: "2084-03-16",
      liters: 100,
      amountMoney: 5800,
    });

    expect(
      await sentOn(manager.client, "2084-03-02", onTheSecond)
    ).toMatchObject({ priceToFollow: false, worthMoney: 5800 });
    // The milk it moved to the name he is found by is on the trail, from the name it was booked to.
    const trail = await scratchDb().query.auditEvent.findFirst({
      where: { entity: "buyer_statement", entityId: statementId },
      columns: { before: true, after: true },
    });

    expect(trail?.before).toMatchObject({
      priced: [{ id: onTheSecond, buyerId: second }],
    });
    expect(trail?.after).toMatchObject({
      priced: [{ id: onTheSecond, buyerId: first }],
    });

    // He pays it, named either way: one man, one book — nothing left owing under the other spelling.
    await manager.client.receivables.pay({
      buyer: `TWIN CENTER ${suffix}`,
      kind: "milk",
      amountMoney: 5800,
      paidOn: "2084-03-17",
      paymentMethod: "cash",
    });
    const everyone = await manager.client.receivables.list();
    const twins = everyone.filter((one) =>
      sameName(one.name, `twin center ${suffix}`)
    );

    expect(twins.reduce((sum, one) => sum + one.owingMoney, 0)).toBe(0);
  });

  it("is let send his milk with its price to follow when, under both names, he takes it on credit", async () => {
    const manager = await as("manager", "2084-04-05T06:00:00.000Z");
    const farmId = theFarm().id;
    const first = uuidv7(new Date("2084-01-03T00:00:00.000Z"));
    const second = uuidv7(new Date("2084-01-04T00:00:00.000Z"));
    const name = `Twin Two ${suffix}`;
    await scratchDb()
      .insert(counterparty)
      .values([
        {
          id: first,
          farmId,
          name,
          createdAt: new Date("2084-01-03T00:00:00.000Z"),
        },
        {
          id: second,
          farmId,
          name: name.toUpperCase(),
          createdAt: new Date("2084-01-04T00:00:00.000Z"),
        },
      ]);
    // A can paid at the gate under the first spelling; three on credit under the second.
    const sent = (day: string, buyerId: string, receivableMoney: number) => ({
      id: uuidv7(new Date(`${day}T01:00:00.000Z`)),
      farmId,
      dispatchedAt: new Date(`${day}T01:00:00.000Z`),
      liters: "10.00",
      buyerId,
      buyerName: name,
      pricePerLiterMoney: "50.00",
      receivableMoney,
      recordedByRole: "manager" as const,
      recordedAt: new Date(`${day}T01:00:00.000Z`),
    });
    await scratchDb()
      .insert(dispatch)
      .values([
        sent("2084-04-01", first, 0),
        sent("2084-04-02", second, 500),
        sent("2084-04-03", second, 500),
        sent("2084-04-04", second, 500),
      ]);
    const offered = await buyerCalled(manager.client, name);

    expect(offered?.paysLater).toBe(true);
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2084-04-05T01:00:00.000Z"),
      liters: 10,
      buyer: { name },
      priceToFollow: true,
    });
  });
});

describe("money paid before a statement was recorded", () => {
  it("never pins a statement: money paid ahead goes back ahead when the statement is voided", async () => {
    const manager = await as("manager", "2085-10-25T06:00:00.000Z");
    const buyer = center("আগাম");
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2085-10-03T01:00:00.000Z"),
      liters: 100,
      buyer,
      priceToFollow: true,
    });
    await manager.client.receivables.pay({
      buyer: buyer.name,
      kind: "milk",
      amountMoney: 5000,
      paidOn: "2085-10-25",
      paymentMethod: "cash",
      note: "আগাম দিল",
    });
    const his = await buyerCalled(manager.client, buyer.name);
    const later = await as("manager", "2085-11-03T06:00:00.000Z");
    const statement = {
      id: uuidv7(),
      counterpartyId: his?.counterpartyId ?? "",
      fromDay: "2085-10-01",
      toDay: "2085-10-15",
      statedOn: "2085-11-02",
      payBy: "2085-11-20",
      liters: 100,
      amountMoney: 6000,
    };
    await later.client.milk.recordStatement(statement);

    expect(await owingOf(later.client, buyer.name)).toBe(1000);

    const owner = await as("owner", "2085-11-04T06:00:00.000Z");
    await owner.client.milk.voidStatement({
      id: statement.id,
      reason: "ভুল দর",
    });
    const after = await owner.client.receivables.ofBuyer({ name: buyer.name });

    expect(
      after?.kinds.find((one) => one.kind === "milk")?.paidAheadMoney
    ).toBe(5000);
  });

  it("keeps what an earlier payment cleared, though the statement is dated before it", async () => {
    const manager = await as("manager", "2085-12-25T06:00:00.000Z");
    const buyer = center("আগের তারিখ");
    const toFollow = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2085-12-03T01:00:00.000Z"),
      liters: 100,
      buyer,
      priceToFollow: true,
    });
    const onCredit = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2085-12-22T01:00:00.000Z"),
      liters: 100,
      buyer,
      pricePerLiterMoney: 50,
      paidNowMoney: 0,
    });
    await manager.client.receivables.pay({
      buyer: buyer.name,
      kind: "milk",
      amountMoney: 5000,
      paidOn: "2085-12-25",
      paymentMethod: "cash",
    });
    const his = await buyerCalled(manager.client, buyer.name);
    // Dated the 20th, before his payment; recorded only on the 3rd of next month.
    const later = await as("manager", "2086-01-03T06:00:00.000Z");
    const statement = {
      id: uuidv7(),
      counterpartyId: his?.counterpartyId ?? "",
      fromDay: "2085-12-01",
      toDay: "2085-12-15",
      statedOn: "2085-12-20",
      payBy: "2086-01-20",
      liters: 100,
      amountMoney: 6000,
    };
    await later.client.milk.recordStatement(statement);

    const owing = await later.client.receivables.ofBuyer({ name: buyer.name });
    const items = owing?.kinds.flatMap((one) => one.items) ?? [];

    expect(items.find((one) => one.id === onCredit.id)?.owingMoney).toBe(0);
    expect(items.find((one) => one.id === toFollow.id)?.owingMoney).toBe(6000);
    expect(owing?.overdueSince).toBeNull();

    const owner = await as("owner", "2086-01-04T06:00:00.000Z");
    await owner.client.milk.voidStatement({
      id: statement.id,
      reason: "ভুল",
    });
  });
});

describe("a statement voided after the month it was recorded in is closed", () => {
  it("is listed against that month too: what buyers owed at its end changes", async () => {
    const manager = await as("manager", "2086-09-10T06:00:00.000Z");
    const buyer = center("সেপ্টেম্বরের বিল");
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2086-08-05T01:00:00.000Z"),
      liters: 100,
      buyer,
      priceToFollow: true,
    });
    const his = await buyerCalled(manager.client, buyer.name);
    const statement = {
      id: uuidv7(),
      counterpartyId: his?.counterpartyId ?? "",
      fromDay: "2086-08-01",
      toDay: "2086-08-31",
      statedOn: "2086-09-05",
      payBy: "2086-09-30",
      liters: 100,
      amountMoney: 6000,
    };
    await manager.client.milk.recordStatement(statement);
    const owner = await as("owner", "2086-10-08T06:00:00.000Z");
    await owner.client.monthlyReport.close({ month: "2086-08" });
    await owner.client.monthlyReport.close({ month: "2086-09" });
    await owner.client.monthlyReport.reopen({
      month: "2086-08",
      reason: "দেরিতে আসা বিল",
    });

    await owner.client.milk.voidStatement({ id: statement.id, reason: "ভুল" });

    const october = await owner.client.monthlyReport.month({
      month: "2086-10",
    });

    expect(october.changedAfterClosing).toContainEqual(
      expect.objectContaining({
        month: "2086-09",
        source: "buyer_statement",
        recordId: statement.id,
        change: "voided",
        beforeMoney: 6000,
      })
    );
  });

  it("weighs the month it was recorded in at all it made owed, its milk of an earlier month among it", async () => {
    const manager = await as("manager", "2087-11-20T06:00:00.000Z");
    const buyer = center("দুই মাসের বিল");
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2087-10-20T01:00:00.000Z"),
      liters: 100,
      buyer,
      priceToFollow: true,
    });
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2087-11-05T01:00:00.000Z"),
      liters: 60,
      buyer,
      priceToFollow: true,
    });
    const his = await buyerCalled(manager.client, buyer.name);
    const statement = {
      id: uuidv7(),
      counterpartyId: his?.counterpartyId ?? "",
      fromDay: "2087-10-16",
      toDay: "2087-11-15",
      statedOn: "2087-11-18",
      payBy: "2087-12-10",
      liters: 160,
      amountMoney: 8000,
    };
    await manager.client.milk.recordStatement(statement);
    const owner = await as("owner", "2087-12-08T06:00:00.000Z");
    await owner.client.monthlyReport.close({ month: "2087-11" });

    await owner.client.milk.voidStatement({ id: statement.id, reason: "ভুল" });

    const december = await owner.client.monthlyReport.month({
      month: "2087-12",
    });

    // November's end owed all ৳8,000 of it, October's ৳5,000 among it.
    expect(december.changedAfterClosing).toContainEqual(
      expect.objectContaining({
        month: "2087-11",
        recordId: statement.id,
        change: "voided",
        beforeMoney: 8000,
      })
    );
  });
});

describe("a month whose milk a statement priced after it ended", () => {
  it("says so beside its milk money, so it ties with what was owed at its end", async () => {
    const manager = await as("manager", "2088-02-03T06:00:00.000Z");
    const buyer = center("পরে ঠিক");
    await manager.client.milk.dispatch({
      dispatchedAt: new Date("2088-01-10T01:00:00.000Z"),
      liters: 100,
      buyer,
      priceToFollow: true,
    });
    const his = await buyerCalled(manager.client, buyer.name);
    await manager.client.milk.recordStatement({
      id: uuidv7(),
      counterpartyId: his?.counterpartyId ?? "",
      fromDay: "2088-01-01",
      toDay: "2088-01-31",
      statedOn: "2088-02-02",
      payBy: "2088-02-20",
      liters: 100,
      amountMoney: 6000,
    });
    const owner = await as("owner", "2088-02-04T06:00:00.000Z");

    const january = await owner.client.monthlyReport.month({
      month: "2088-01",
    });

    expect(january.figures.dairy).toMatchObject({
      pricedAfterMoney: 6000,
      pricedAfterLiters: 100,
      pricedAfterOn: ["2088-02-03"],
    });
  });
});
