import { standardPlaybook } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { PAID_FROM_THE_ACCOUNT, putCapitalIn } from "../test/bought-by-bank";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// An animal that leaves the farm some other way than dying is no carcass to bury: a Sale, and — once written off — an
// animal lost. The write-off is the Owner's alone, only of an animal the round could not find, and one found after all
// comes back as she was.

const suffix = `lost-${Date.now()}`;
const NOT_FOUND = "পশু পাওয়া যায়নি";
const WINDOW = {
  targetWindowStart: "2066-06-17",
  targetWindowEnd: "2066-06-19",
};

let penId = "";
let burialId = "";
let roundId = "";
let ventureId = "";

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

beforeAll(async () => {
  const owner = await as("owner", "2066-03-01T04:00:00.000Z");
  const shed = await owner.client.sheds.create({ name: suffix });
  const pen = await owner.client.sheds.pens.create({
    quarantine: true,
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;
  const burial = await owner.client.sops.create({
    content: standardPlaybook().burial,
  });
  burialId = burial.definitionId;
  const round = await owner.client.sops.create({
    content: standardPlaybook().healthRound,
  });
  roundId = round.definitionId;
  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalMoney: 1_000_000,
    floorMoney: 0,
    decideBy: "2066-03-02",
    unitPriceMoney: 50_000,
    units: 20,
    ...WINDOW,
  });
  // Capital in first: a bull at the gate is paid from what the account holds.
  await putCapitalIn(
    owner.client,
    { id: venture.id, units: 20, unitPriceMoney: 50_000 },
    `venture ${suffix}`,
    "2066-03-01"
  );
  await owner.client.ventures.startBuying({ id: venture.id });
  ventureId = venture.id;
});

/** One bull off the lorry — the Farm's own, or a Venture's. */
const aBull = async (instant: string, ventureFor?: string) => {
  // A Venture's bull at the gate is the Owner's, paid from its account by bank.
  const manager = await as(ventureFor ? "owner" : "manager", instant);
  return manager.client.intakes.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceMoney: 80_000,
    weightKg: 250,
    estimatedAgeMonths: 20,
    arrivedAt: new Date(instant),
    ventureId: ventureFor,
    ...(ventureFor ? PAID_FROM_THE_ACCOUNT : {}),
    ...WINDOW,
  });
};

/** The round on a morning cannot find him. */
const notFoundOn = async (day: string, tag: string) => {
  const manager = await as("manager", `${day}T02:30:00.000Z`);
  await manager.client.work.ensureDue();
  const today = await manager.client.work.today({ penId });
  const work = today.find((row) => row.definitionId === roundId);
  if (!work) {
    throw new Error("expected the round");
  }
  await manager.client.work.claim({ id: work.id });
  await manager.client.work.completeStep({
    instanceId: work.id,
    stepId: "look",
    animalTag: tag,
    evidence: [],
    skipReason: NOT_FOUND,
  });
};

const him = async (tag: string) =>
  await scratchDb().query.animal.findFirst({
    where: { farmId: theFarm().id, tagNumber: tag },
    columns: { id: true, state: true, stateChangedAt: true },
  });

const burialsFor = async (tag: string, instant: string) => {
  const manager = await as("manager", instant);
  await manager.client.work.ensureDue();
  const bull = await him(tag);
  return scratchDb().query.sopInstance.findMany({
    where: { animalId: bull?.id ?? "", definitionId: burialId },
    columns: { id: true },
  });
};

const STOLEN = {
  cause: "রাতে গোয়াল থেকে চুরি",
  stolen: true,
  gdNumber: "জিডি ৪১২",
};

describe("an animal that leaves without dying", () => {
  it("raises no carcass disposal when he is sold", async () => {
    const bull = await aBull("2066-03-02T04:00:00.000Z");
    const manager = await as("manager", "2066-03-10T06:00:00.000Z");
    await manager.client.sales.record({
      tagNumber: bull.tagNumber,
      buyer: { name: `করিম ব্যাপারী ${suffix}`, phone: "+8801711000078" },
      weightKg: 330,
      destination: `গাবতলী ${suffix}`,
      vehicle: "ঢাকা মেট্রো-ট ১১-৪৪৫৬",
      driver: `চালক ${suffix}`,
      priceMoney: 120_000,
    });
    expect(
      await burialsFor(bull.tagNumber, "2066-03-10T07:00:00.000Z")
    ).toEqual([]);
  });

  it("leaves as Lost from the morning he was last looked for, and raises no burial", async () => {
    const bull = await aBull("2066-03-03T04:00:00.000Z");
    await notFoundOn("2066-03-11", bull.tagNumber);
    const owner = await as("owner", "2066-03-19T06:00:00.000Z");
    const home = await owner.client.overview.get();
    // A week and a day missing: past the Owner's seven, so the Owner is asked.
    expect(
      home.needsYou.missing.find((one) => one.tag === bull.tagNumber)
    ).toMatchObject({ askWriteOff: true });

    await owner.client.animals.writeOff({
      tagNumber: bull.tagNumber,
      ...STOLEN,
    });
    const gone = await him(bull.tagNumber);
    expect(gone?.state).toBe("lost");
    expect(gone?.stateChangedAt.toISOString().slice(0, 10)).toBe("2066-03-11");
    expect(
      await burialsFor(bull.tagNumber, "2066-03-19T07:00:00.000Z")
    ).toEqual([]);

    const after = await owner.client.overview.get();
    expect(after.needsYou.missing.map((one) => one.tag)).not.toContain(
      bull.tagNumber
    );
    // Bought for ৳80,000 and fed since: the year's lost animals cost at least that.
    expect(after.tiles.lostYear.count).toBeGreaterThanOrEqual(1);
    expect(after.tiles.lostYear.costMoney).toBeGreaterThanOrEqual(80_000);
    const page = await owner.client.animals.get({
      tagNumber: bull.tagNumber,
    });
    expect(page.missing?.writtenOff).toMatchObject(STOLEN);
  });

  it("is not asked about before the Owner's days are up", async () => {
    const bull = await aBull("2066-03-04T04:00:00.000Z");
    await notFoundOn("2066-03-12", bull.tagNumber);
    const owner = await as("owner", "2066-03-14T06:00:00.000Z");
    const home = await owner.client.overview.get();
    expect(
      home.needsYou.missing.find((one) => one.tag === bull.tagNumber)
    ).toMatchObject({ askWriteOff: false });
  });

  it("is the Owner's write-off alone, of an animal the farm cannot find, and a theft needs its GD number", async () => {
    const bull = await aBull("2066-03-05T04:00:00.000Z");
    const owner = await as("owner", "2066-03-13T06:00:00.000Z");
    await expect(
      owner.client.animals.writeOff({
        tagNumber: bull.tagNumber,
        cause: "জানা নেই",
      })
    ).rejects.toMatchObject({ data: { refusal: "not_missing" } });

    await notFoundOn("2066-03-13", bull.tagNumber);
    const manager = await as("manager", "2066-03-13T06:00:00.000Z");
    await expect(
      manager.client.animals.writeOff({
        tagNumber: bull.tagNumber,
        cause: "জানা নেই",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.client.animals.writeOff({
        tagNumber: bull.tagNumber,
        cause: "চুরি",
        stolen: true,
      })
    ).rejects.toMatchObject({ data: { refusal: "gd_number_needed" } });
    const still = await him(bull.tagNumber);
    expect(still?.state).toBe("quarantine");
  });

  it("makes a Venture's lost animal good: the Farm pays the Venture what she cost it, by bank, from its own books", async () => {
    const bull = await aBull("2066-03-06T04:00:00.000Z", ventureId);
    await notFoundOn("2066-03-14", bull.tagNumber);
    const owner = await as("owner", "2066-03-22T06:00:00.000Z");
    // The money has to move: a write-off with no transfer behind it is a promise nobody can find in the account.
    await expect(
      owner.client.animals.writeOff({
        tagNumber: bull.tagNumber,
        cause: "জানা নেই",
      })
    ).rejects.toMatchObject({ data: { refusal: "made_good_needs_reference" } });
    const still = await him(bull.tagNumber);
    expect(still?.state).toBe("quarantine");
    // Said before the act, so the transfer the Owner makes is the figure the farm books.
    expect(
      await owner.client.animals.madeGoodAmount({ tagNumber: bull.tagNumber })
    ).toEqual({ amountMoney: 80_000 });

    await owner.client.animals.writeOff({
      tagNumber: bull.tagNumber,
      cause: "জানা নেই",
      madeGood: { reference: `MG-${suffix}` },
    });
    const gone = await him(bull.tagNumber);
    expect(gone?.state).toBe("lost");
    // Bought at ৳80,000 and charged nothing since: that is what she cost the Venture, and what comes back to it.
    const movements = await scratchDb().query.ventureMovement.findMany({
      where: { farmId: theFarm().id, ventureId, kind: "made_good" },
    });
    expect(movements).toEqual([
      expect.objectContaining({
        amountMoney: 80_000,
        reference: `MG-${suffix}`,
        movedOn: "2066-03-22",
      }),
    ]);
    const money = await scratchDb().query.moneyEvent.findMany({
      where: {
        farmId: theFarm().id,
        source: "venture_made_good",
        sourceId: movements[0]?.id ?? "",
      },
    });
    expect(money).toEqual([
      expect.objectContaining({ amountMoney: 80_000, direction: "out" }),
    ]);
    // Moved with the Farm's own books, so never put right on the Venture's side alone.
    const listed = await owner.client.ventures.movements.list({ ventureId });
    expect(listed.find((one) => one.kind === "made_good")?.whyItStands).toBe(
      "made_good_with_the_farms_money"
    );
    // Told apart from a death wherever the Venture's herd is counted.
    const herd = await owner.client.ventures.herd({ ventureId });
    expect(herd).toMatchObject({ lostCount: 1, diedCount: 0 });
  });

  it("names a Venture's missing animal in its Settlement as missing, not as still standing", async () => {
    const bull = await aBull("2066-03-08T04:00:00.000Z", ventureId);
    await notFoundOn("2066-03-16", bull.tagNumber);
    const owner = await as("owner", "2066-03-17T06:00:00.000Z");
    const settlement = await owner.client.ventures.settlement.get({
      ventureId,
    });
    const blocks = settlement.blocks as {
      word: string;
      tagNumbers?: string[];
    }[];
    expect(
      blocks.find((one) => one.word === "an_animal_is_missing")?.tagNumbers
    ).toContain(bull.tagNumber);
    expect(
      blocks.find((one) => one.word === "an_animal_still_stands")?.tagNumbers ??
        []
    ).not.toContain(bull.tagNumber);
  });

  it("found after the Farm made a Venture's bull good, comes back as the Farm's own: it paid for him", async () => {
    const bull = await aBull("2066-03-09T04:00:00.000Z", ventureId);
    await notFoundOn("2066-03-17", bull.tagNumber);
    const owner = await as("owner", "2066-03-25T06:00:00.000Z");
    await owner.client.animals.writeOff({
      tagNumber: bull.tagNumber,
      cause: "জানা নেই",
      madeGood: { reference: `MG-FOUND-${suffix}` },
    });
    const later = await as("owner", "2066-03-26T06:00:00.000Z");
    await later.client.animals.found({ tagNumber: bull.tagNumber });

    // The Farm's from the day he was found, at what it made good: an Internal Sale with no money of its own, the
    // made-good transfer having paid for him already.
    const back = await scratchDb().query.animal.findFirst({
      where: { farmId: theFarm().id, tagNumber: bull.tagNumber },
      columns: { id: true, state: true, ownerVentureId: true },
    });
    expect(back).toMatchObject({ state: "quarantine", ownerVentureId: null });
    const handed = await scratchDb().query.internalSale.findMany({
      where: { farmId: theFarm().id, animalId: back?.id ?? "" },
      columns: {
        fromVentureId: true,
        toVentureId: true,
        priceMoney: true,
        soldOn: true,
      },
    });
    expect(handed).toEqual([
      {
        fromVentureId: ventureId,
        toVentureId: null,
        priceMoney: 80_000,
        soldOn: "2066-03-26",
      },
    ]);
    const moved = await scratchDb().query.ventureMovement.findMany({
      where: { farmId: theFarm().id, ventureId, animalId: back?.id ?? "" },
      columns: { kind: true, amountMoney: true },
    });
    expect(moved).toEqual([{ kind: "made_good", amountMoney: 80_000 }]);
    // Nobody's money moved again: the Farm's books hold the one transfer out.
    const booked = await scratchDb().query.moneyEvent.findMany({
      where: {
        farmId: theFarm().id,
        source: { in: ["internal_sale_in", "internal_sale_out"] },
        occurredAt: { gte: new Date("2066-03-26T00:00:00Z") },
      },
      columns: { id: true },
    });
    expect(booked).toEqual([]);
  });

  it("comes back as he was when the Owner finds him after all — the Manager cannot", async () => {
    const bull = await aBull("2066-03-07T04:00:00.000Z");
    const before = await him(bull.tagNumber);
    await notFoundOn("2066-03-15", bull.tagNumber);
    const owner = await as("owner", "2066-03-23T06:00:00.000Z");
    await owner.client.animals.writeOff({
      tagNumber: bull.tagNumber,
      cause: "হারিয়ে গেছে, খোঁজ নেই",
    });

    const manager = await as("manager", "2066-03-24T06:00:00.000Z");
    await expect(
      manager.client.animals.found({ tagNumber: bull.tagNumber })
    ).rejects.toMatchObject({ data: { refusal: "owner_only" } });

    const later = await as("owner", "2066-03-24T06:00:00.000Z");
    await later.client.animals.found({ tagNumber: bull.tagNumber });
    const back = await him(bull.tagNumber);
    // Still in quarantine, as he was the morning he went.
    expect(back?.state).toBe("quarantine");
    expect(back?.stateChangedAt).toEqual(before?.stateChangedAt);
    const page = await later.client.animals.get({
      tagNumber: bull.tagNumber,
    });
    expect(page.missing).toBeNull();

    // Back in the herd, the round can lose him again.
    await notFoundOn("2066-03-25", bull.tagNumber);
    const again = await scratchDb().query.missing.findMany({
      where: { animalId: back?.id ?? "", foundAt: { isNull: true } },
      columns: { id: true },
    });
    expect(again).toHaveLength(1);
  });
});
