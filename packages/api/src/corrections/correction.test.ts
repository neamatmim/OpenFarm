import type { Principal } from "@OpenFarm/test-harness";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "../routers/index";
import { createTestClient } from "../test/client";

// Every kind of record a person can put right, through the one Correction: the Role and the trail it is written under,
// a value the record no longer holds, a Correction that changes nothing, a window that has closed or never does, whose
// record it is, and a reason.

const suffix = `${Date.now()}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const RECORDED = "2039-03-01T04:00:00.000Z";
const NEXT_DAY = "2039-03-02T04:00:00.000Z";
/** Long past the Manager's window, however the farm has it set; never past the Owner's, nor the Vet's. */
const YEARS_ON = new Date(new Date(RECORDED).getTime() + 800 * DAY_MS);

const as = (who: Principal, instant: string | Date) =>
  createTestClient(appRouter, {
    as: who,
    clock: new FakeClock(
      instant instanceof Date ? instant.toISOString() : instant
    ),
  });

type Client = Awaited<ReturnType<typeof as>>["client"];

/** A record made for one test, and how to put one of its values right. */
interface Made {
  /** What the procedure is asked about it by. */
  id: string;
  /** What its Audit Events are filed under. */
  trail: { entity: string; entityId: string };
  field: string;
  from: unknown;
  to: unknown;
  /** A value it never held. */
  stale: unknown;
  /** Asking for the value it already holds, when that is asked in another shape than it is shown. */
  unchanged?: unknown;
}

interface Kind {
  name: string;
  /** Who records it: the office's work, or the Vet's own. */
  by: "manager" | "vet";
  /** Whether the Owner may put it right as well: money entered by hand is the Manager's alone. */
  ownerToo?: boolean;
  make: (client: Client) => Promise<Made>;
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

/** A bull on the farm, for the Vet to examine. */
const aBull = async () => {
  const manager = await as("manager", RECORDED);
  return intakeFor(manager.client, 20_000);
};

const KINDS: Kind[] = [
  {
    name: "a Dispatch",
    by: "manager",
    ownerToo: true,
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
        stale: 101,
      };
    },
    correct: (client, input) => client.milk.correctDispatch(input as never),
  },
  {
    name: "an Intake",
    by: "manager",
    ownerToo: true,
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
        stale: 20_001,
      };
    },
    correct: (client, input) => client.intake.correct(input as never),
  },
  {
    name: "a Sale",
    by: "manager",
    ownerToo: true,
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
        stale: 30_001,
      };
    },
    correct: (client, input) => client.sale.correct(input as never),
  },
  {
    name: "feed that came in",
    by: "manager",
    ownerToo: true,
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
        stale: 401,
      };
    },
    correct: (client, input) => client.stock.correct(input as never),
  },
  {
    name: "money entered by hand",
    by: "manager",
    make: async (manager) => {
      const categories = await manager.money.categories();
      const repairs = categories.find((one) => one.key === "repairs");
      const made = await manager.money.enter({
        categoryId: repairs?.id ?? "",
        amountBdt: 1500,
        occurredOn: "2039-03-01",
        counterparty: { name: `মিস্ত্রি ${suffix}` },
      });
      return {
        id: made.id,
        trail: { entity: "money_event", entityId: made.id },
        field: "amountBdt",
        from: 1500,
        to: 1800,
        stale: 1501,
      };
    },
    correct: (client, input) => client.money.correctEntered(input as never),
  },
  {
    name: "a death",
    by: "manager",
    ownerToo: true,
    make: async (manager) => {
      const bull = await intakeFor(manager, 20_000);
      await manager.animals.recordMortality({
        tagNumber: bull.tagNumber,
        kind: "died",
        cause: "কারণ জানা যায়নি",
        disposal: "buried",
      });
      const her = await manager.animals.byTag({ tagNumber: bull.tagNumber });
      const row = await scratchDb().query.mortality.findFirst({
        where: { animalId: her.id },
        columns: { id: true },
      });
      return {
        // Asked about by her Tag Number, as the screen knows her.
        id: bull.tagNumber,
        trail: { entity: "mortality", entityId: row?.id ?? "" },
        field: "cause",
        from: "কারণ জানা যায়নি",
        to: "সাপের কামড়",
        stale: "অন্য কারণ",
      };
    },
    correct: (client, { id, ...input }) =>
      client.animals.correctMortality({ ...input, tagNumber: id } as never),
  },
  {
    name: "a Diagnosis",
    by: "vet",
    make: async (vet) => {
      const bull = await aBull();
      const made = await vet.diagnoses.record({
        animalTag: bull.tagNumber,
        disease: { bn: "জ্বর" },
      });
      return {
        id: made.id,
        trail: { entity: "diagnosis", entityId: made.id },
        field: "disease",
        from: "জ্বর",
        to: { bn: "নিউমোনিয়া" },
        stale: "খুরা রোগ",
        unchanged: { bn: "জ্বর" },
      };
    },
    correct: (client, input) => client.diagnoses.correct(input as never),
  },
  {
    name: "an abortion",
    by: "vet",
    make: async (vet) => {
      const owner = await as("owner", RECORDED);
      const her = await owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "pregnant_heifer",
        penId,
        source: "bought",
        aliases: [],
        expectedCalvingOn: "2039-08-01",
      });
      const made = await vet.breeding.recordAbortion({
        tagNumber: her.tagNumber,
        abortedAt: new Date("2039-03-01T02:00:00.000Z"),
        stageMonths: 3,
        note: "গর্ভপাত",
      });
      return {
        id: made.id,
        trail: { entity: "abortion", entityId: made.id },
        field: "stageMonths",
        from: 3,
        to: 4,
        stale: 5,
      };
    },
    correct: (client, input) => client.breeding.correctAbortion(input as never),
  },
];

const changing = (record: Made, from: unknown, to: unknown) => ({
  id: record.id,
  reason: "রসিদ মিলিয়ে দেখা",
  changes: { [record.field]: { from, to } },
});

describe.each(KINDS)("putting right $name", (kind) => {
  const made = async () => {
    const maker = await as(kind.by, RECORDED);
    return kind.make(maker.client);
  };

  it("writes the Correction under the Role that let them, superseding the event that recorded it", async () => {
    const record = await made();
    const them = await as(kind.by, NEXT_DAY);
    const [recorded] = await them.client.audit.list(record.trail);
    await kind.correct(them.client, changing(record, record.from, record.to));
    const [corrected] = await them.client.audit.list(record.trail);
    expect(corrected).toMatchObject({
      action: "correct",
      roleUsed: kind.by,
      reason: "রসিদ মিলিয়ে দেখা",
      supersedesId: recorded?.id,
    });
    expect(corrected?.before).not.toEqual(corrected?.after);
  });

  it("refuses a value the record no longer holds, and says what it holds now", async () => {
    const record = await made();
    const them = await as(kind.by, NEXT_DAY);
    await expect(
      kind.correct(them.client, changing(record, record.stale, record.to))
    ).rejects.toMatchObject({
      code: "CONFLICT",
      data: {
        refusal: "changed_since",
        now: expect.objectContaining({
          [record.field]: record.from,
        }),
      },
    });
  });

  it("refuses a Correction that changes nothing", async () => {
    const record = await made();
    const them = await as(kind.by, NEXT_DAY);
    const nothing = {
      code: "BAD_REQUEST",
      data: { refusal: "nothing_to_correct" },
    };
    await expect(
      kind.correct(
        them.client,
        changing(record, record.from, record.unchanged ?? record.from)
      )
    ).rejects.toMatchObject(nothing);
    await expect(
      kind.correct(them.client, { ...changing(record, 0, 0), changes: {} })
    ).rejects.toMatchObject(nothing);
  });

  it("asks for a reason", async () => {
    const record = await made();
    const them = await as(kind.by, NEXT_DAY);
    await expect(
      kind.correct(them.client, {
        ...changing(record, record.from, record.to),
        reason: " ",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe.each(KINDS.filter((kind) => kind.by === "manager"))(
  "the Manager's window on $name",
  (kind) => {
    it("refuses the Manager once it has closed", async () => {
      const manager = await as("manager", RECORDED);
      const record = await kind.make(manager.client);
      const change = changing(record, record.from, record.to);
      const later = await as("manager", YEARS_ON);
      await expect(kind.correct(later.client, change)).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: {
          refusal: {
            word: "window_closed",
            role: "manager",
            ownEntriesOnly: false,
          },
        },
      });
      if (!kind.ownerToo) {
        return;
      }
      const owner = await as("owner", YEARS_ON);
      await kind.correct(owner.client, change);
      const [corrected] = await owner.client.audit.list(record.trail);
      expect(corrected).toMatchObject({ action: "correct", roleUsed: "owner" });
    });
  }
);

describe.each(KINDS.filter((kind) => kind.by === "vet"))(
  "the Vet's own $name",
  (kind) => {
    it("is theirs for as long as she is on the farm, and never another Vet's", async () => {
      const vet = await as("vet", RECORDED);
      const record = await kind.make(vet.client);
      const change = changing(record, record.from, record.to);
      const other = await as("otherVet", NEXT_DAY);
      await expect(kind.correct(other.client, change)).rejects.toMatchObject({
        code: "FORBIDDEN",
        data: { refusal: { word: "not_theirs", role: null } },
      });
      const later = await as("vet", YEARS_ON);
      await kind.correct(later.client, change);
      const [corrected] = await later.client.audit.list(record.trail);
      expect(corrected).toMatchObject({ action: "correct", roleUsed: "vet" });
    });
  }
);
