import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Money entered by hand: wages, and what no other record catches — electricity, repairs, manure sold —
// under the farm's own list of Categories.

const suffix = `${Date.now()}`;
const YEAR = { from: "2038-01-01", to: "2038-12-31" };

const as = (
  role: "owner" | "manager" | "staff" | "vet",
  instant: string,
  onShedPhone = false
) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(instant),
    onShedPhone,
  });

/** The Category with this standard key, as the Manager reads the list. */
const categoryKeyed = async (key: string) => {
  const manager = await as("manager", "2038-01-01T04:00:00.000Z");
  const all = await manager.client.money.categories();
  const found = all.find((one) => one.key === key);
  if (!found) {
    throw new Error(`No ${key} Category`);
  }
  return found;
};

/** A Money Event of this file's, as the Owner reads the year. */
const eventOf = async (id: string) => {
  const owner = await as("owner", "2038-12-31T12:00:00.000Z");
  const year = await owner.client.money.list(YEAR);
  return year.events.find((one) => one.id === id);
};

describe("money entered by hand", () => {
  it("starts from the standard Categories, the records' own among them", async () => {
    const manager = await as("manager", "2038-01-01T04:00:00.000Z");
    const all = await manager.client.money.categories();
    expect(all.map((one) => one.key)).toEqual(
      expect.arrayContaining([
        "dispatch",
        "sale",
        "intake",
        "feed_in",
        "medicine_purchase",
        "vet_fee",
        "wages",
        "utilities",
        "repairs",
        "transport",
        "manure_sales",
      ])
    );
  });

  it("takes an expense with its receipt, and an income", async () => {
    const utilities = await categoryKeyed("utilities");
    const manure = await categoryKeyed("manure_sales");
    const manager = await as("manager", "2038-01-10T04:00:00.000Z");

    const bill = await manager.client.money.enter({
      categoryId: utilities.id,
      amountBdt: 3500,
      occurredOn: "2038-01-10",
      counterparty: { name: `পল্লী বিদ্যুৎ ${suffix}` },
      paymentMethod: "bank",
      note: "জানুয়ারির বিল",
      receipt: { contentType: "image/jpeg", data: "AAAA" },
    });
    expect(await eventOf(bill.id)).toMatchObject({
      source: "entry",
      direction: "out",
      amountBdt: 3500,
      categoryKey: "utilities",
      counterpartyName: `পল্লী বিদ্যুৎ ${suffix}`,
      paymentMethod: "bank",
      note: "জানুয়ারির বিল",
      hasReceipt: true,
      approval: "not_needed",
    });
    expect(await manager.client.money.receipt({ id: bill.id })).toEqual({
      contentType: "image/jpeg",
      data: "AAAA",
    });

    const dung = await manager.client.money.enter({
      categoryId: manure.id,
      amountBdt: 2000,
      occurredOn: "2038-01-10",
      counterparty: { name: `বায়োগ্যাস ${suffix}` },
    });
    expect(await eventOf(dung.id)).toMatchObject({
      direction: "in",
      amountBdt: 2000,
      paymentMethod: "cash",
      hasReceipt: false,
    });
  });

  it("takes one wage per person per month, naming the person", async () => {
    const wages = await categoryKeyed("wages");
    const manager = await as("manager", "2038-02-01T04:00:00.000Z");
    const karim = { name: `করিম মিয়া ${suffix}` };
    const january = await manager.client.money.enter({
      categoryId: wages.id,
      amountBdt: 12_000,
      occurredOn: "2038-02-01",
      counterparty: karim,
      wageMonth: "2038-01",
    });
    expect(await eventOf(january.id)).toMatchObject({
      categoryKey: "wages",
      counterpartyName: karim.name,
      wageMonth: "2038-01",
    });

    await expect(
      manager.client.money.enter({
        categoryId: wages.id,
        amountBdt: 12_000,
        occurredOn: "2038-02-01",
        counterparty: karim,
        wageMonth: "2038-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "wage_already_entered" } });
    await expect(
      manager.client.money.enter({
        categoryId: wages.id,
        amountBdt: 12_000,
        occurredOn: "2038-02-01",
        counterparty: karim,
      })
    ).rejects.toMatchObject({ data: { refusal: "wage_needs_month" } });
    const repairs = await categoryKeyed("repairs");
    await expect(
      manager.client.money.enter({
        categoryId: repairs.id,
        amountBdt: 500,
        occurredOn: "2038-02-01",
        counterparty: karim,
        wageMonth: "2038-01",
      })
    ).rejects.toMatchObject({ data: { refusal: "month_is_for_wages" } });

    const inMarch = await as("manager", "2038-03-01T04:00:00.000Z");
    const february = await inMarch.client.money.enter({
      categoryId: wages.id,
      amountBdt: 12_000,
      occurredOn: "2038-03-01",
      counterparty: karim,
      wageMonth: "2038-02",
    });
    expect(await eventOf(february.id)).toMatchObject({ wageMonth: "2038-02" });
  });

  it("keeps the farm's own Categories, retiring one rather than removing it", async () => {
    const manager = await as("manager", "2038-03-01T04:00:00.000Z");
    const insurance = await manager.client.money.addCategory({
      nameBn: `পশু বীমা ${suffix}`,
      nameEn: "Cattle insurance",
      direction: "out",
    });
    await expect(
      manager.client.money.addCategory({
        nameBn: `পশু বীমা ${suffix}`,
        direction: "out",
      })
    ).rejects.toMatchObject({ data: { refusal: "category_exists" } });
    const premium = await manager.client.money.enter({
      categoryId: insurance.id,
      amountBdt: 4000,
      occurredOn: "2038-03-01",
      counterparty: { name: `সাধারণ বীমা ${suffix}` },
    });

    const owner = await as("owner", "2038-03-02T04:00:00.000Z");
    await owner.client.money.retireCategory({ id: insurance.id });
    const listed = await manager.client.money.categories();
    expect(listed.find((one) => one.id === insurance.id)).toMatchObject({
      retiredAt: expect.any(Date),
    });
    // What was entered under it keeps it.
    expect(await eventOf(premium.id)).toMatchObject({
      categoryBn: `পশু বীমা ${suffix}`,
    });
    await expect(
      manager.client.money.enter({
        categoryId: insurance.id,
        amountBdt: 4000,
        occurredOn: "2038-03-01",
        counterparty: { name: `সাধারণ বীমা ${suffix}` },
      })
    ).rejects.toMatchObject({ data: { refusal: "category_retired" } });

    // A record's own Category is not the farm's to retire: the milk would have nowhere to go.
    const milkSales = await categoryKeyed("dispatch");
    // Nor is milk entered by hand: its Dispatch books it, and twice would be the same money twice.
    await expect(
      manager.client.money.enter({
        categoryId: milkSales.id,
        amountBdt: 500,
        occurredOn: "2038-03-01",
        counterparty: { name: `ঘোষ ${suffix}` },
      })
    ).rejects.toMatchObject({ data: { refusal: "category_kept_by_records" } });
    await expect(
      owner.client.money.retireCategory({ id: milkSales.id })
    ).rejects.toMatchObject({ data: { refusal: "category_kept_by_records" } });
  });

  it("holds an entry over the threshold for the Owner, and corrects one as a Correction", async () => {
    const repairs = await categoryKeyed("repairs");
    const manager = await as("manager", "2038-04-01T04:00:00.000Z");
    const pump = await manager.client.money.enter({
      categoryId: repairs.id,
      amountBdt: 30_000,
      occurredOn: "2038-04-01",
      counterparty: { name: `মোটর মেকানিক ${suffix}` },
      note: "দুধের পাম্প",
    });
    expect(await eventOf(pump.id)).toMatchObject({ approval: "awaiting" });
    const owner = await as("owner", "2038-04-01T05:00:00.000Z");
    await owner.client.money.approve({ id: pump.id, amountBdt: 30_000 });

    await expect(
      manager.client.money.correctEntry({
        id: pump.id,
        amountBdt: 3000,
        reason: " ",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await manager.client.money.correctEntry({
      id: pump.id,
      amountBdt: 3000,
      note: null,
      reason: "একটা শূন্য বেশি লেখা হয়েছিল",
    });
    expect(await eventOf(pump.id)).toMatchObject({
      amountBdt: 3000,
      note: null,
      approval: "not_needed",
    });
    const trail = await manager.client.audit.list({
      entity: "money_event",
      entityId: pump.id,
    });
    expect(trail.map((event) => event.action)).toEqual(
      expect.arrayContaining(["create", "update", "correct"])
    );
    // Only an entry made by hand is corrected here; a record's money is put right on the record.
    const milk = await manager.client.milk.dispatch({
      dispatchedAt: new Date("2038-04-01T02:00:00.000Z"),
      litres: 40,
      buyer: { name: `ঘোষ ${suffix}` },
      pricePerLitreBdt: 50,
    });
    const year = await owner.client.money.list(YEAR);
    const fromTheRecord = year.events.find((one) => one.sourceId === milk.id);
    await expect(
      manager.client.money.correctEntry({
        id: fromTheRecord?.id ?? "",
        amountBdt: 1,
        reason: "ভুল",
      })
    ).rejects.toMatchObject({ data: { refusal: "correct_the_record" } });
  });

  it("is the Owner's and Manager's, from their own phones, and never Barn Staff's or the Vet's", async () => {
    const repairs = await categoryKeyed("repairs");
    const entry = {
      categoryId: repairs.id,
      amountBdt: 100,
      occurredOn: "2038-05-01",
      counterparty: { name: `দোকান ${suffix}` },
    };
    for (const role of ["staff", "vet"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const other = await as(role, "2038-05-01T04:00:00.000Z");
      // oxlint-disable-next-line no-await-in-loop
      await expect(other.client.money.categories()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      // oxlint-disable-next-line no-await-in-loop
      await expect(other.client.money.enter(entry)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    // Entering money is the Manager's; the Owner reads and approves it.
    const owner = await as("owner", "2038-05-01T04:00:00.000Z");
    await expect(owner.client.money.enter(entry)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const onShedPhone = await as("manager", "2038-05-01T04:00:00.000Z", true);
    await expect(onShedPhone.client.money.enter(entry)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const manager = await as("manager", "2038-05-01T04:00:00.000Z");
    await expect(
      manager.client.money.enter({ ...entry, occurredOn: "2038-05-02" })
    ).rejects.toMatchObject({ data: { refusal: "entered_in_the_future" } });
  });
});
