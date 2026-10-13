import { uuidv7 } from "@OpenFarm/db/ids";
import { paperText } from "@OpenFarm/domain";
import {
  FakeClock,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { bookMoney } from "../money-store";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A Closed Month: once the Owner has closed a month of the Farm's own money, only she may enter money into it, put it
// right, move it in or out or take it off the books. Anybody else is refused, and the paper of the month she changes it
// in lists what she changed under "changed after closing" (ADR 0028).

const suffix = `closed-${Date.now()}`;
/** Mid-April: March has ended, April has not. */
const clock = new FakeClock("2079-04-10T06:00:00.000Z");

const as = (role: "owner" | "manager" | "vet") =>
  createTestClient(appRouter, { as: role, clock });

let repairsId = "";

beforeAll(async () => {
  const owner = await as("owner");
  // The paper is an Export, refused without the farm's registration.
  await owner.client.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2079/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2081-03-31",
  });
  const categories = await owner.client.money.categories.list();
  repairsId = categories.find((one) => one.key === "repairs")?.id ?? "";
});

const enter = async (
  role: "owner" | "manager",
  amountMoney: number,
  occurredOn: string,
  name: string
) => {
  const who = await as(role);
  return who.client.money.enter({
    categoryId: repairsId,
    amountMoney,
    occurredOn,
    counterparty: { name },
  });
};

/** One Money Event as the database keeps it: nothing once it is off the books. */
const moneyOf = (id: string) =>
  scratchDb().query.moneyEvent.findFirst({
    where: { id },
    columns: { amountMoney: true, occurredAt: true, approval: true },
  });

/** The changes kept against one Money Event for a closed month's paper. */
const changesKeptFor = (recordId: string) =>
  scratchDb().query.closedMonthChange.findMany({
    where: { recordId },
    columns: {
      month: true,
      change: true,
      beforeMoney: true,
      afterMoney: true,
    },
  });

const MONTH_CLOSED = { data: { refusal: "month_closed" } };

/** Where a month stands with the Owner, as the month's own page says it. */
const closingOf = async (month: string) => {
  const owner = await as("owner");
  const one = await owner.client.monthlyReport.month({ month });
  return one.closing;
};

describe("closing a month", () => {
  it("closes a month that has ended, and refuses one still going or closed already", async () => {
    const owner = await as("owner");
    await owner.client.monthlyReport.close({ month: "2079-01" });
    expect(await closingOf("2079-01")).toMatchObject({
      closed: true,
      ended: true,
    });
    await expect(
      owner.client.monthlyReport.close({ month: "2079-01" })
    ).rejects.toMatchObject({ data: { refusal: "month_already_closed" } });
    await expect(
      owner.client.monthlyReport.close({ month: "2079-04" })
    ).rejects.toMatchObject({ data: { refusal: "month_not_ended" } });
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.monthlyReport.close({ month: "2078-12" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("waits while any of the month's own money waits for her word", async () => {
    const owner = await as("owner");
    // Over the line: the Manager's pump waits for the Owner.
    const pump = await enter("manager", 900_000, "2079-02-14", `পাম্প ${suffix}`);
    await expect(
      owner.client.monthlyReport.close({ month: "2079-02" })
    ).rejects.toMatchObject({ data: { refusal: "month_has_money_waiting" } });
    await owner.client.money.approve({ id: pump.id, amountMoney: 900_000 });
    await owner.client.monthlyReport.close({ month: "2079-02" });
  });
});

describe("a closed month's money, written by the Manager", () => {
  let bill = "";
  let april = "";

  beforeAll(async () => {
    // The Owner's own bills, one in March and one in April, before March is closed.
    const march = await enter("owner", 1000, "2079-03-12", `ঝালাই ${suffix}`);
    const sooner = await enter("owner", 600, "2079-04-02", `তার ${suffix}`);
    bill = march.id;
    april = sooner.id;
    const owner = await as("owner");
    await owner.client.monthlyReport.close({ month: "2079-03" });
  });

  it("is refused for money entered new into it, and nothing of the entry is written", async () => {
    await expect(
      enter("manager", 300, "2079-03-20", `দেরি ${suffix}`)
    ).rejects.toMatchObject(MONTH_CLOSED);
    const owner = await as("owner");
    const march = await owner.client.money.list({
      from: "2079-03-01",
      to: "2079-03-31",
    });
    expect(
      march.events.filter((one) => one.counterpartyName === `দেরি ${suffix}`)
    ).toEqual([]);
  });

  it("goes through for money in the month still going", async () => {
    const now = await enter("manager", 300, "2079-04-05", `এখন ${suffix}`);
    expect(await moneyOf(now.id)).toMatchObject({ amountMoney: 300 });
  });

  it("is refused for a Correction of its money, which stands as it was", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.money.correctEntered({
        id: bill,
        changes: { amountMoney: { from: 1000, to: 1200 } },
        reason: "বিল ভুল লেখা হয়েছিল",
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
    expect(await moneyOf(bill)).toMatchObject({ amountMoney: 1000 });
  });

  it("is refused for a change of Side, which is a figure of the month too", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.money.correctEntered({
        id: bill,
        changes: { side: { from: null, to: "dairy" } },
        reason: "গাভীর খরচ ছিল",
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
  });

  it("goes through for a receipt added beside it, which changes none of its money", async () => {
    const manager = await as("manager");
    await manager.client.money.correctEntered({
      id: bill,
      receipt: { contentType: "image/png", data: "BBBB" },
      reason: "রসিদ পরে পাওয়া গেল",
    });
    expect(await changesKeptFor(bill)).toEqual([]);
  });

  it("is refused for money moved out of it", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.money.correctEntered({
        id: bill,
        changes: { occurredOn: { from: "2079-03-12", to: "2079-04-01" } },
        reason: "এপ্রিলের বিল",
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
  });

  it("is refused for money moved into it", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.money.correctEntered({
        id: april,
        changes: { occurredOn: { from: "2079-04-02", to: "2079-03-30" } },
        reason: "মার্চের বিল",
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
    expect(await moneyOf(april)).toMatchObject({ amountMoney: 600 });
  });

  it("is refused for a void, and the money stays on the books", async () => {
    const manager = await as("manager");
    await expect(
      manager.client.money.correctEntered({
        id: bill,
        changes: { voided: { from: false, to: true } },
        reason: "দুবার লেখা",
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
    expect(await moneyOf(bill)).toBeDefined();
  });
});

describe("a Vet's fee in a closed month", () => {
  it("is refused when the Vet puts it right in place", async () => {
    const vet = await as("vet");
    const fee = await vet.client.money.vetFee({
      amountMoney: 1500,
      visitedOn: "2078-07-05",
      paymentMethod: "cash",
    });
    const owner = await as("owner");
    await owner.client.monthlyReport.close({ month: "2078-07" });
    await expect(
      vet.client.money.correctVetFee({
        id: fee.id,
        reason: "ভিজিট দুটো ছিল",
        changes: { amountMoney: { from: 1500, to: 2000 } },
      })
    ).rejects.toMatchObject(MONTH_CLOSED);
    const money = await scratchDb().query.moneyEvent.findFirst({
      where: { source: "vet_fee", sourceId: fee.id },
      columns: { amountMoney: true },
    });
    expect(money).toMatchObject({ amountMoney: 1500 });
  });
});

describe("the Owner's own changes to a closed month", () => {
  const changedIn = async (month: string) => {
    const owner = await as("owner");
    const one = await owner.client.monthlyReport.month({ month });
    return one.changedAfterClosing;
  };

  it("go through, each listed with what the closed month held of it before and after", async () => {
    const owner = await as("owner");
    const fixed = await enter("owner", 1000, "2078-03-12", `রঙ ${suffix}`);
    const moving = await enter("owner", 800, "2078-03-15", `খড় ${suffix}`);
    const twice = await enter("owner", 700, "2078-03-18", `দুবার ${suffix}`);
    await owner.client.monthlyReport.close({ month: "2078-03" });

    const late = await enter("owner", 450, "2078-03-21", `পেরেক ${suffix}`);
    await owner.client.money.correctEntered({
      id: fixed.id,
      changes: { amountMoney: { from: 1000, to: 1200 } },
      reason: "আসল বিল",
    });
    await owner.client.money.correctEntered({
      id: moving.id,
      changes: { occurredOn: { from: "2078-03-15", to: "2078-04-02" } },
      reason: "এপ্রিলের বিল",
    });
    await owner.client.money.correctEntered({
      id: twice.id,
      changes: { voided: { from: false, to: true } },
      reason: "দুবার লেখা",
    });

    expect(await moneyOf(late.id)).toMatchObject({ amountMoney: 450 });
    expect(await moneyOf(fixed.id)).toMatchObject({ amountMoney: 1200 });
    expect(await moneyOf(twice.id)).toBeUndefined();
    expect(await changesKeptFor(late.id)).toEqual([
      {
        month: "2078-03",
        change: "entered",
        beforeMoney: null,
        afterMoney: 450,
      },
    ]);
    expect(await changesKeptFor(fixed.id)).toEqual([
      {
        month: "2078-03",
        change: "corrected",
        beforeMoney: 1000,
        afterMoney: 1200,
      },
    ]);
    expect(await changesKeptFor(moving.id)).toEqual([
      { month: "2078-03", change: "moved", beforeMoney: 800, afterMoney: null },
    ]);
    expect(await changesKeptFor(twice.id)).toEqual([
      {
        month: "2078-03",
        change: "voided",
        beforeMoney: 700,
        afterMoney: null,
      },
    ]);
    // Listed on the month she made them in — April 2079 — not the month they changed.
    const listed = await changedIn("2079-04");
    expect(
      listed?.filter((one) => one.month === "2078-03").map((one) => one.change)
    ).toEqual(["entered", "corrected", "moved", "voided"]);
    expect(await changedIn("2078-03")).toEqual([]);
  });

  it("are listed on the paper of the month she made them in, in both languages", async () => {
    const owner = await as("owner");
    const { document } = await owner.client.monthlyReport.monthPaper({
      month: "2079-04",
    });
    const en = paperText(document, "en");
    expect(en).toContain("Changed after closing");
    expect(en).toContain("March 2078");
    expect(en).toContain("Moved");
    const bn = paperText(document, "bn");
    expect(bn).toContain("বন্ধ করা মাসে পরে যা বদলেছে");
    expect(bn).toContain("সরানো");
  });
});

describe("a Venture's purse in a closed month", () => {
  it("is never refused: its figures are its own papers', not the Farm's month", async () => {
    const owner = await as("owner");
    const venture = await owner.client.ventures.open({
      name: `মাস ${suffix}`,
      targetCapitalMoney: 1_000_000,
      decideBy: "2079-05-30",
      targetWindowStart: "2079-11-17",
      targetWindowEnd: "2079-11-19",
      unitPriceMoney: 50_000,
    });
    await owner.client.monthlyReport.close({ month: "2078-09" });
    const byTheManager = (purseVentureId: string | null) => {
      const id = uuidv7(clock.now());
      return scratchDb().transaction((tx) =>
        bookMoney(
          tx,
          {
            farm: { id: theFarm().id, approvalThresholdMoney: 100_000 },
            actorId: thePerson("manager").id,
            role: "manager",
            byTheOwner: false,
            now: clock.now(),
          },
          {
            source: "by_hand",
            sourceId: id,
            amountMoney: 400,
            occurredAt: new Date("2078-09-10T06:00:00.000Z"),
            counterpartyId: null,
            purseVentureId,
          },
          {
            id,
            category: { id: repairsId, direction: "out" },
            note: null,
            wageMonth: null,
            side: null,
          }
        )
      );
    };
    await expect(byTheManager(venture.id)).resolves.toBeDefined();
    await expect(byTheManager(null)).rejects.toMatchObject(MONTH_CLOSED);
  });
});

/** The Owner, on a day of her choosing. */
const ownerOn = (day: string) =>
  createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(`${day}T06:00:00.000Z`),
  });

/** The month her home names as ready to close, or nothing. */
const toClose = async (who: Awaited<ReturnType<typeof ownerOn>>) => {
  const home = await who.client.overview.get();
  return home.needsYou.monthToClose;
};

describe("the Owner's home", () => {
  it("names last month as ready to close from the 7th, and not once it is closed", async () => {
    expect(await toClose(await ownerOn("2077-08-06"))).toBeNull();
    const seventh = await ownerOn("2077-08-07");
    expect(await toClose(seventh)).toMatchObject({
      month: "2077-07",
      waiting: 0,
    });
    await seventh.client.monthlyReport.close({ month: "2077-07" });
    expect(await toClose(seventh)).toBeNull();
  });
});

describe("reopening a month", () => {
  it("takes the Owner's reason, and then the Manager may write into it again", async () => {
    const owner = await as("owner");
    const bill = await enter("owner", 500, "2078-11-10", `বাল্ব ${suffix}`);
    await owner.client.monthlyReport.close({ month: "2078-11" });
    await expect(
      enter("manager", 250, "2078-11-28", `দেরি ২ ${suffix}`)
    ).rejects.toMatchObject(MONTH_CLOSED);

    await expect(
      owner.client.monthlyReport.reopen({ month: "2078-11", reason: "" })
    ).rejects.toBeDefined();
    const manager = await as("manager");
    await expect(
      manager.client.monthlyReport.reopen({
        month: "2078-11",
        reason: "আমি চাই",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.client.monthlyReport.reopen({
      month: "2078-11",
      reason: "হিসাবরক্ষক একটি বিল পেয়েছেন",
    });
    expect(await closingOf("2078-11")).toMatchObject({
      closed: false,
      reopened: { reason: "হিসাবরক্ষক একটি বিল পেয়েছেন" },
    });

    const late = await enter("manager", 250, "2078-11-28", `দেরি ২ ${suffix}`);
    expect(await moneyOf(late.id)).toMatchObject({ amountMoney: 250 });
    await manager.client.money.correctEntered({
      id: bill.id,
      changes: { amountMoney: { from: 500, to: 550 } },
      reason: "বিল ভুল",
    });
    expect(await moneyOf(bill.id)).toMatchObject({ amountMoney: 550 });
    expect(await changesKeptFor(bill.id)).toEqual([]);
  });

  it("refuses a month that is not closed", async () => {
    const owner = await as("owner");
    await expect(
      owner.client.monthlyReport.reopen({ month: "2078-10", reason: "ভুল" })
    ).rejects.toMatchObject({ data: { refusal: "month_not_closed" } });
  });
});

describe("closing a month while money is booked into it", () => {
  it("either finds the money waiting or refuses it: never closes over money that waits", async () => {
    const owner = await as("owner");
    const [closing, entry] = await Promise.allSettled([
      owner.client.monthlyReport.close({ month: "2078-05" }),
      enter("manager", 900_000, "2078-05-20", `পাম্প ২ ${suffix}`),
    ]);
    if (closing.status === "fulfilled") {
      // Closed first: the pump found it closed.
      expect(entry.status).toBe("rejected");
      expect(entry.status === "rejected" && entry.reason).toMatchObject(
        MONTH_CLOSED
      );
    } else {
      // The pump first: the month had money waiting, and closing was refused.
      expect(entry.status).toBe("fulfilled");
      expect(closing.reason).toMatchObject({
        data: { refusal: "month_has_money_waiting" },
      });
    }
  });
});
