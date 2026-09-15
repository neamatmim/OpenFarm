import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "../routers/index";
import { createTestClient } from "../test/client";

// Every kind of record a person can put right, through the one Correction: the Role and the trail it is written under,
// a value the record no longer holds, a Correction that changes nothing, a window that has closed, and a reason.

const suffix = `${Date.now()}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECORDED = "2039-03-01T04:00:00.000Z";
/** Long past the Manager's window, however the farm has it set, and never past the Owner's. */
const YEARS_ON = new Date(new Date(RECORDED).getTime() + 800 * DAY_MS);

const as = (role: "owner" | "manager", instant: string | Date) =>
  createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(
      instant instanceof Date ? instant.toISOString() : instant
    ),
  });

type Client = Awaited<ReturnType<typeof as>>["client"];

/** A record made for one test, and how to put one of its values right. */
interface Made {
  id: string;
  /** What its Audit Events are filed under. */
  trail: { entity: string; entityId: string };
  field: string;
  from: number;
  to: number;
}

interface Kind {
  name: string;
  make: (manager: Client) => Promise<Made>;
  correct: (
    client: Client,
    input: { id: string; reason: string; changes: Record<string, unknown> }
  ) => Promise<unknown>;
}

let penId = "";

beforeAll(async () => {
  const owner = await as("owner", RECORDED);
  const shed = await owner.client.herd.createShed({
    name: `correction-${suffix}`,
  });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `সংশোধন ${suffix}`,
  });
  penId = pen.id;
});

const intakeFor = (manager: Client, priceBdt: number) =>
  manager.intake.record({
    penId,
    sex: "male",
    seller: { name: `হাট ${suffix}` },
    purchasePriceBdt: priceBdt,
    weightKg: 240,
    estimatedAgeMonths: 18,
    targetWindowStart: "2039-12-01",
    targetWindowEnd: "2039-12-05",
  });

const KINDS: Kind[] = [
  {
    name: "a Dispatch",
    make: async (manager) => {
      const made = await manager.milk.dispatch({
        dispatchedAt: new Date("2039-03-01T02:00:00.000Z"),
        litres: 100,
        buyer: { name: `ক্রেতা ${suffix}` },
        pricePerLitreBdt: 50,
      });
      return {
        id: made.id,
        trail: { entity: "dispatch", entityId: made.id },
        field: "litres",
        from: 100,
        to: 120,
      };
    },
    correct: (client, input) => client.milk.correctDispatch(input as never),
  },
  {
    name: "an Intake",
    make: async (manager) => {
      const made = await intakeFor(manager, 20_000);
      const row = await scratchDb().query.intake.findFirst({
        where: { id: made.intakeId },
        columns: { animalId: true },
      });
      return {
        id: made.intakeId,
        // Filed under the Animal it made, as the Intake itself was.
        trail: { entity: "animal", entityId: row?.animalId ?? "" },
        field: "purchasePriceBdt",
        from: 20_000,
        to: 21_000,
      };
    },
    correct: (client, input) => client.intake.correct(input as never),
  },
  {
    name: "a Sale",
    make: async (manager) => {
      const bull = await intakeFor(manager, 20_000);
      const made = await manager.sale.record({
        tagNumber: bull.tagNumber,
        buyer: { name: `কসাই ${suffix}` },
        priceBdt: 30_000,
        weightKg: 260,
        destination: "গাবতলী",
        vehicle: "ট্রাক",
        driver: "রহিম",
      });
      return {
        id: made.id,
        trail: { entity: "sale", entityId: made.id },
        field: "priceBdt",
        from: 30_000,
        to: 29_500,
      };
    },
    correct: (client, input) => client.sale.correct(input as never),
  },
  {
    name: "feed that came in",
    make: async (manager) => {
      const feed = await manager.feed.addItem({
        name: { bn: `খড় ${suffix} ${Math.random()}` },
        unit: "kg",
      });
      const made = await manager.stock.receive({
        feedItemId: feed.id,
        kind: "purchase",
        quantity: 400,
        priceBdt: 8000,
        seller: { name: `খড়ের দোকান ${suffix}` },
        receivedOn: "2039-03-01",
      });
      // Retired at once: a Stock Count on another file's clock must not find this lot in the store.
      await manager.feed.retireItem({ id: feed.id });
      return {
        id: made.id,
        trail: { entity: "feed_in", entityId: made.id },
        field: "quantity",
        from: 400,
        to: 450,
      };
    },
    correct: (client, input) => client.stock.correct(input as never),
  },
];

describe.each(KINDS)("putting right $name", (kind) => {
  const made = async () => {
    const manager = await as("manager", RECORDED);
    return kind.make(manager.client);
  };

  it("writes the Correction under the Role that let them, superseding the event that recorded it", async () => {
    const record = await made();
    const manager = await as("manager", "2039-03-02T04:00:00.000Z");
    const [recorded] = await manager.client.audit.list(record.trail);
    await kind.correct(manager.client, {
      id: record.id,
      reason: "রসিদ মিলিয়ে দেখা",
      changes: { [record.field]: { from: record.from, to: record.to } },
    });
    const [corrected] = await manager.client.audit.list(record.trail);
    expect(corrected).toMatchObject({
      action: "correct",
      roleUsed: "manager",
      reason: "রসিদ মিলিয়ে দেখা",
      supersedesId: recorded?.id,
    });
    expect(corrected?.before).not.toEqual(corrected?.after);
  });

  it("refuses a value the record no longer holds, and says what it holds now", async () => {
    const record = await made();
    const manager = await as("manager", "2039-03-02T04:00:00.000Z");
    await expect(
      kind.correct(manager.client, {
        id: record.id,
        reason: "অন্য কেউ আগে ঠিক করেছেন",
        changes: { [record.field]: { from: record.from + 1, to: record.to } },
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        refusal: "changed_since",
        now: expect.objectContaining({ [record.field]: record.from }),
      },
    });
  });

  it("refuses a Correction that changes nothing", async () => {
    const record = await made();
    const manager = await as("manager", "2039-03-02T04:00:00.000Z");
    const nothing = {
      code: "BAD_REQUEST",
      data: { refusal: "nothing_to_correct" },
    };
    await expect(
      kind.correct(manager.client, {
        id: record.id,
        reason: "একই",
        changes: { [record.field]: { from: record.from, to: record.from } },
      })
    ).rejects.toMatchObject(nothing);
    await expect(
      kind.correct(manager.client, {
        id: record.id,
        reason: "কিছুই না",
        changes: {},
      })
    ).rejects.toMatchObject(nothing);
  });

  it("refuses the Manager once their window has closed, and lets the Owner", async () => {
    const record = await made();
    const change = {
      id: record.id,
      reason: "অনেক পরে ধরা পড়ল",
      changes: { [record.field]: { from: record.from, to: record.to } },
    };
    const manager = await as("manager", YEARS_ON);
    await expect(kind.correct(manager.client, change)).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: {
        refusal: {
          word: "window_closed",
          role: "manager",
          ownEntriesOnly: false,
        },
      },
    });
    const owner = await as("owner", YEARS_ON);
    await kind.correct(owner.client, change);
    const [corrected] = await owner.client.audit.list(record.trail);
    expect(corrected).toMatchObject({ action: "correct", roleUsed: "owner" });
  });

  it("asks for a reason", async () => {
    const record = await made();
    const manager = await as("manager", "2039-03-02T04:00:00.000Z");
    await expect(
      kind.correct(manager.client, {
        id: record.id,
        reason: " ",
        changes: { [record.field]: { from: record.from, to: record.to } },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
